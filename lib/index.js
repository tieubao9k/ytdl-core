const PassThrough = require('stream').PassThrough;
const getInfo = require('./info');
const utils = require('./utils');
const formatUtils = require('./format-utils');
const urlUtils = require('./url-utils');
const sig = require('./sig');
const agent = require('./agent');
const miniget = require('miniget');
const m3u8stream = require('m3u8stream');
const { parseTimestamp } = require('m3u8stream');
const https = require('https');
const http = require('http');
// Enhanced signature extraction integrated into sig.js


/**
 * @param {string} link
 * @param {!Object} options
 * @returns {ReadableStream}
 */
const ytdl = (link, options) => {
  const stream = createStream(options);
  // Enable fast mode by default if not specified and add agent support
  const finalOptions = Object.assign({ 
    fastMode: 'disabled', // Disabled by default due to YouTube API changes
    agent: options?.agent || agent.defaultAgent 
  }, options);
  
  ytdl.getInfo(link, finalOptions).then(info => {
    // Use enhanced download for large files or when parallelChunks specified
    const useEnhanced = finalOptions.parallelChunks > 1 || 
                       (finalOptions.enhancedDownload !== false && 
                        info.formats.some(f => parseInt(f.contentLength) > 10 * 1024 * 1024));
    
    if (useEnhanced) {
      enhancedDownloadFromInfo(stream, info, finalOptions);
    } else {
      downloadFromInfoCallback(stream, info, finalOptions);
    }
  }, err => {
    // Enhanced signature extraction in sig.js should handle most cases
    stream.emit('error', err);
  });
  return stream;
};
module.exports = ytdl;

ytdl.getBasicInfo = getInfo.getBasicInfo;
ytdl.getInfo = getInfo.getInfo;
ytdl.chooseFormat = formatUtils.chooseFormat;
ytdl.filterFormats = formatUtils.filterFormats;
ytdl.validateID = urlUtils.validateID;
ytdl.validateURL = urlUtils.validateURL;
ytdl.getURLVideoID = urlUtils.getURLVideoID;
ytdl.getVideoID = urlUtils.getVideoID;
ytdl.cache = {
  sig: sig.cache,
  info: getInfo.cache,
  watch: getInfo.watchPageCache,
  cookie: getInfo.cookieCache,
};
ytdl.version = require('../package.json').version;


const createStream = options => {
  const stream = new PassThrough({
    highWaterMark: (options && options.highWaterMark) || 1024 * 512,
  });
  stream._destroy = () => { stream.destroyed = true; };
  return stream;
};


const pipeAndSetEvents = (req, stream, end) => {
  // Forward events from the request to the stream.
  [
    'abort', 'request', 'response', 'error', 'redirect', 'retry', 'reconnect',
  ].forEach(event => {
    req.prependListener(event, stream.emit.bind(stream, event));
  });
  req.pipe(stream, { end });
};


/**
 * Chooses a format to download.
 *
 * @param {stream.Readable} stream
 * @param {Object} info
 * @param {Object} options
 */
const downloadFromInfoCallback = (stream, info, options) => {
  options = options || {};

  let err = utils.playError(info.player_response, ['UNPLAYABLE', 'LIVE_STREAM_OFFLINE', 'LOGIN_REQUIRED']);
  if (err) {
    stream.emit('error', err);
    return;
  }

  if (!info.formats.length) {
    stream.emit('error', Error('This video is unavailable'));
    return;
  }

  let format;
  try {
    format = formatUtils.chooseFormat(info.formats, options);
  } catch (e) {
    stream.emit('error', e);
    return;
  }
  stream.emit('info', info, format);
  if (stream.destroyed) { return; }

  let contentLength, downloaded = 0;
  const ondata = chunk => {
    downloaded += chunk.length;
    stream.emit('progress', chunk.length, downloaded, contentLength);
  };

  if (options.IPv6Block) {
    options.requestOptions = Object.assign({}, options.requestOptions, {
      family: 6,
      localAddress: utils.getRandomIPv6(options.IPv6Block),
    });
  }

  // Download the file in chunks, in this case the default is 10MB,
  // anything over this will cause youtube to throttle the download
  const dlChunkSize = options.dlChunkSize || 1024 * 1024 * 10;
  let req;
  let shouldEnd = true;

  if (format.isHLS || format.isDashMPD) {
    req = m3u8stream(format.url, {
      chunkReadahead: +info.live_chunk_readahead,
      begin: options.begin || (format.isLive && Date.now()),
      liveBuffer: options.liveBuffer,
      requestOptions: options.requestOptions,
      parser: format.isDashMPD ? 'dash-mpd' : 'm3u8',
      id: format.itag,
    });

    req.on('progress', (segment, totalSegments) => {
      stream.emit('progress', segment.size, segment.num, totalSegments);
    });
    pipeAndSetEvents(req, stream, shouldEnd);
  } else {
    const requestOptions = Object.assign({}, options.requestOptions, {
      maxReconnects: 6,
      maxRetries: 3,
      backoff: { inc: 500, max: 10000 },
    });

    let shouldBeChunked = dlChunkSize !== 0 && (!format.hasAudio || !format.hasVideo);

    if (shouldBeChunked) {
      let start = (options.range && options.range.start) || 0;
      let end = start + dlChunkSize;
      const rangeEnd = options.range && options.range.end;

      contentLength = options.range ?
        (rangeEnd ? rangeEnd + 1 : parseInt(format.contentLength)) - start :
        parseInt(format.contentLength);

      const getNextChunk = () => {
        if (!rangeEnd && end >= contentLength) end = 0;
        if (rangeEnd && end > rangeEnd) end = rangeEnd;
        shouldEnd = !end || end === rangeEnd;

        requestOptions.headers = Object.assign({}, requestOptions.headers, {
          Range: `bytes=${start}-${end || ''}`,
        });

        req = miniget(format.url, requestOptions);
        req.on('data', ondata);
        req.on('end', () => {
          if (stream.destroyed) { return; }
          if (end && end !== rangeEnd) {
            start = end + 1;
            end += dlChunkSize;
            getNextChunk();
          }
        });
        pipeAndSetEvents(req, stream, shouldEnd);
      };
      getNextChunk();
    } else {
      // Audio only and video only formats don't support begin
      if (options.begin) {
        format.url += `&begin=${parseTimestamp(options.begin)}`;
      }
      if (options.range && (options.range.start || options.range.end)) {
        requestOptions.headers = Object.assign({}, requestOptions.headers, {
          Range: `bytes=${options.range.start || '0'}-${options.range.end || ''}`,
        });
      }
      req = miniget(format.url, requestOptions);
      req.on('response', res => {
        if (stream.destroyed) { return; }
        contentLength = contentLength || parseInt(res.headers['content-length']);
      });
      req.on('data', ondata);
      pipeAndSetEvents(req, stream, shouldEnd);
    }
  }

  stream._destroy = () => {
    stream.destroyed = true;
    req.destroy();
    req.end();
  };
};


/**
 * Can be used to download video after its `info` is gotten through
 * `ytdl.getInfo()`. In case the user might want to look at the
 * `info` object before deciding to download.
 *
 * @param {Object} info
 * @param {!Object} options
 * @returns {ReadableStream}
 */
ytdl.downloadFromInfo = (info, options) => {
  const stream = createStream(options);
  if (!info.full) {
    throw Error('Cannot use `ytdl.downloadFromInfo()` when called ' +
      'with info from `ytdl.getBasicInfo()`');
  }
  setImmediate(() => {
    downloadFromInfoCallback(stream, info, options);
  });
  return stream;
};

/**
 * Enhanced download with parallel chunks and agent support
 * @param {string} url
 * @param {Object} options
 * @returns {ReadableStream}
 */
ytdl.downloadWithEnhancements = (url, options = {}) => {
  const stream = createStream(options);
  const finalOptions = Object.assign({ 
    fastMode: 'disabled', // Disabled by default due to YouTube API changes 
    parallelChunks: 4,
    agent: options.agent || agent.defaultAgent
  }, options);

  ytdl.getInfo(url, finalOptions).then(info => {
    enhancedDownloadFromInfo(stream, info, finalOptions);
  }, err => {
    stream.emit('error', err);
  });
  
  return stream;
};

/**
 * Enhanced download from info with parallel processing
 */
const enhancedDownloadFromInfo = (stream, info, options) => {
  options = options || {};
  
  let format;
  try {
    format = formatUtils.chooseFormat(info.formats, options);
  } catch (error) {
    // If chooseFormat fails, pick first format
    format = info.formats[0];
  }
  
  if (!format) {
    stream.emit('error', Error('No format found with given criteria'));
    return;
  }

  // Check if format has URL, if not, try to get URL from format processing
  if (!format.url) {
    // Some formats need signature processing first
    downloadFromInfoCallback(stream, info, options);
    return;
  }

  const contentLength = parseInt(format.contentLength) || 0;
  const useParallel = options.parallelChunks > 1 && 
                     contentLength > 1 * 1024 * 1024; // >1MB for testing

  if (useParallel && contentLength > 0) {
    parallelDownload(stream, format, options);
  } else {
    standardDownload(stream, format, options);
  }
};

/**
 * Parallel chunk download for large files
 */
const parallelDownload = async (stream, format, options) => {
  const numChunks = options.parallelChunks || 4;
  const contentLength = parseInt(format.contentLength);
  const chunkSize = Math.floor(contentLength / numChunks);
  
  stream.emit('info', format, format);
  
  try {
    const chunks = [];
    const downloadPromises = [];
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = i === numChunks - 1 ? contentLength - 1 : (start + chunkSize - 1);
      downloadPromises.push(downloadChunk(format.url, start, end, options));
    }
    
    const chunkResults = await Promise.all(downloadPromises);
    let totalDownloaded = 0;
    
    // Stream chunks in order
    for (const chunk of chunkResults) {
      stream.write(chunk.data);
      totalDownloaded += chunk.data.length;
      stream.emit('progress', chunk.data.length, totalDownloaded, contentLength);
    }
    
    stream.end();
    
  } catch (error) {
    stream.emit('error', error);
  }
};

/**
 * Download a single chunk with range headers
 */
const downloadChunk = (url, start, end, options) => {
  return new Promise((resolve, reject) => {
    // Validate URL first
    if (!url) {
      reject(new Error('URL is required for chunk download'));
      return;
    }
    
    const requestOptions = {
      headers: {
        'Range': `bytes=${start}-${end}`,
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
      }
    };
    
    // Use agent if provided
    if (options.agent) {
      if (options.agent.dispatcher) {
        // Use undici agent
        requestOptions.dispatcher = options.agent.dispatcher;
      } else if (options.agent.agent) {
        // Use https-proxy-agent
        requestOptions.agent = options.agent.agent;
      }
    }
    
    const req = miniget(url, requestOptions);
    const chunks = [];
    
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      resolve({ 
        start, 
        end, 
        data: Buffer.concat(chunks) 
      });
    });
    req.on('error', reject);
  });
};

/**
 * Standard single-connection download
 */
const standardDownload = (stream, format, options) => {
  downloadFromInfoCallback(stream, { formats: [format] }, options);
};

// Export agent functions for enhanced cookie and proxy support
ytdl.createAgent = agent.createAgent;
ytdl.createProxyAgent = agent.createProxyAgent;
ytdl.createEnhancedAgent = agent.createEnhancedAgent;
ytdl.addCookies = agent.addCookies;
ytdl.addCookiesFromString = agent.addCookiesFromString;
