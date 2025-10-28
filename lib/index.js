const PassThrough = require("stream").PassThrough;
const getInfo = require("./info");
const utils = require("./utils");
const formatUtils = require("./format-utils");
const urlUtils = require("./url-utils");
const miniget = require("miniget");
const { request } = require("undici");
const m3u8stream = require("m3u8stream");
const { parseTimestamp } = require("m3u8stream");
const agent = require("./agent");

/**
 * Create a stream from undici request (replacement for miniget)
 * This works better with YouTube's authentication
 */
const createUndiciStream = (url, options = {}) => {
  const stream = new PassThrough();

  // Start the request
  const makeRequest = async () => {
    try {
      const response = await request(url, {
        method: 'GET',
        headers: options.headers || {},
        dispatcher: options.dispatcher
      });

      // Emit response event for compatibility
      stream.emit('response', {
        statusCode: response.statusCode,
        headers: response.headers
      });

      // Check status code
      if (response.statusCode < 200 || response.statusCode >= 400) {
        const error = new Error(`Status code: ${response.statusCode}`);
        error.statusCode = response.statusCode;
        stream.emit('error', error);
        return;
      }

      // Pipe body to stream
      for await (const chunk of response.body) {
        if (!stream.destroyed) {
          stream.push(chunk);
        } else {
          break;
        }
      }

      if (!stream.destroyed) {
        stream.push(null); // End stream
      }
    } catch (error) {
      if (!stream.destroyed) {
        stream.emit('error', error);
      }
    }
  };

  // Start request asynchronously
  makeRequest();

  // Add destroy method
  const originalDestroy = stream.destroy.bind(stream);
  stream.destroy = (error) => {
    originalDestroy(error);
  };

  return stream;
};

/**
 * @param {string} link
 * @param {!Object} options
 * @returns {ReadableStream}
 */
const ytdl = (link, options) => {
  const stream = createStream(options);
  ytdl.getInfo(link, options).then(
    info => {
      downloadFromInfoCallback(stream, info, options);
    },
    stream.emit.bind(stream, "error"),
  );
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
ytdl.createAgent = agent.createAgent;
ytdl.createProxyAgent = agent.createProxyAgent;
ytdl.cache = {
  info: getInfo.cache,
  watch: getInfo.watchPageCache,
};
ytdl.version = require("../package.json").version;

const createStream = options => {
  const stream = new PassThrough({ highWaterMark: options?.highWaterMark || 1024 * 512 });
  stream._destroy = () => {
    stream.destroyed = true;
  };
  return stream;
};

const pipeAndSetEvents = (req, stream, end) => {
  // Forward events from the request to the stream.
  ["abort", "request", "response", "error", "redirect", "retry", "reconnect"].forEach(event => {
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

  let err = utils.playError(info.player_response);
  if (err) {
    stream.emit("error", err);
    return;
  }

  if (!info.formats.length) {
    stream.emit("error", Error("This video is unavailable"));
    return;
  }

  let format;
  try {
    format = formatUtils.chooseFormat(info.formats, options);
  } catch (e) {
    stream.emit("error", e);
    return;
  }
  stream.emit("info", info, format);
  if (stream.destroyed) {
    return;
  }

  let contentLength,
    downloaded = 0;
  const ondata = chunk => {
    downloaded += chunk.length;
    stream.emit("progress", chunk.length, downloaded, contentLength);
  };

  utils.applyDefaultHeaders(options);

  // IMPORTANT: Apply User-Agent from InnerTube client for proper authentication
  // Different clients require different User-Agents to avoid 403 errors
  if (info._innerTube && info._innerTube.client) {
    const innerTubeClients = require('./innertube-clients');
    const CLIENTS = {
      ANDROID: { userAgent: 'com.google.android.youtube/19.30.36 (Linux; U; Android 14) gzip' },  // Match user's working version
      ANDROID_MUSIC: { userAgent: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip' },
      ANDROID_VR: { userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
      IOS: { userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)' },
      WEB: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' },
      WEB_REMIX: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' },
      MWEB: { userAgent: 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' },
      WEB_EMBEDDED_PLAYER: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' },
      TVHTML5: { userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' },
      TVHTML5_SIMPLY_EMBEDDED_PLAYER: { userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' }
    };

    const clientConfig = CLIENTS[info._innerTube.client];
    if (clientConfig && clientConfig.userAgent) {
      options.requestOptions = options.requestOptions || {};
      options.requestOptions.headers = options.requestOptions.headers || {};
      // Only set if not already set by user
      if (!options.requestOptions.headers['User-Agent']) {
        options.requestOptions.headers['User-Agent'] = clientConfig.userAgent;
      }
    }
  }

  // Add additional download headers (matching user's working code)
  options.requestOptions = options.requestOptions || {};
  options.requestOptions.headers = options.requestOptions.headers || {};

  if (!options.requestOptions.headers['Accept']) {
    options.requestOptions.headers['Accept'] = '*/*';
  }
  if (!options.requestOptions.headers['Accept-Encoding']) {
    options.requestOptions.headers['Accept-Encoding'] = 'identity';
  }
  if (!options.requestOptions.headers['Connection']) {
    options.requestOptions.headers['Connection'] = 'keep-alive';
  }
  if (!options.requestOptions.headers['Referer']) {
    options.requestOptions.headers['Referer'] = 'https://www.youtube.com/';
  }

  if (options.IPv6Block) {
    options.requestOptions = Object.assign({}, options.requestOptions, {
      localAddress: utils.getRandomIPv6(options.IPv6Block),
    });
  }

  if (options.agent) {
    // Set agent on both the miniget and m3u8stream requests
    options.requestOptions.agent = options.agent.agent;

    if (options.agent.jar) {
      utils.setPropInsensitive(
        options.requestOptions.headers,
        "cookie",
        options.agent.jar.getCookieStringSync("https://www.youtube.com"),
      );
    }
    if (options.agent.localAddress) {
      options.requestOptions.localAddress = options.agent.localAddress;
    }
  }

  // Download the file in chunks, in this case the default is 10MB,
  // anything over this will cause youtube to throttle the download
  const dlChunkSize = typeof options.dlChunkSize === "number" ? options.dlChunkSize : 1024 * 1024 * 10;
  let req;
  let shouldEnd = true;

  if (format.isHLS || format.isDashMPD) {
    req = m3u8stream(format.url, {
      chunkReadahead: +info.live_chunk_readahead,
      begin: options.begin || (format.isLive && Date.now()),
      liveBuffer: options.liveBuffer,
      // Now we have passed not only custom "dispatcher" with undici ProxyAgent, but also "agent" field which is compatible for node http
      requestOptions: options.requestOptions,
      parser: format.isDashMPD ? "dash-mpd" : "m3u8",
      id: format.itag,
    });

    req.on("progress", (segment, totalSegments) => {
      stream.emit("progress", segment.size, segment.num, totalSegments);
    });
    pipeAndSetEvents(req, stream, shouldEnd);
  } else {
    const requestOptions = Object.assign({}, options.requestOptions, {
      maxReconnects: 6,
      maxRetries: 3,
      backoff: { inc: 500, max: 10000 },
    });

    let contentLength = parseInt(format.contentLength) || 0;
    
    // Detect M3U8/HLS from URL if not already marked
    const isM3U8Url = format.url && (
      format.url.includes('.m3u8') || 
      format.url.includes('/hls_') || 
      format.url.includes('playlist/index') ||
      format.url.includes('/manifest/hls_')
    );
    
    // If M3U8 detected but not marked, handle as HLS
    if (isM3U8Url && !format.isHLS) {
      
      req = m3u8stream(format.url, {
        chunkReadahead: +info.live_chunk_readahead || 3,
        begin: options.begin || (format.isLive && Date.now()),
        liveBuffer: options.liveBuffer,
        requestOptions: options.requestOptions,
        parser: "m3u8",
        id: format.itag,
      });

      req.on("progress", (segment, totalSegments) => {
        stream.emit("progress", segment.size, segment.num, totalSegments);
      });
      pipeAndSetEvents(req, stream, shouldEnd);
      return stream;
    }
    
    // Multi-thread download logic (for non-HLS formats)
    const shouldUseMultiThread = options.multiThread !== false && 
                                contentLength > (options.minSizeForMultiThread || 2 * 1024 * 1024) && // > 2MB (adjustable)
                                !format.isLive && !format.isHLS && !format.isDashMPD && !isM3U8Url &&
                                !options.range && !options.begin;

    let shouldBeChunked = dlChunkSize !== 0 && (!format.hasAudio || !format.hasVideo);
    
    // Multi-thread condition: only for files with known content length > 2MB
    const shouldUseMultiThreadDownload = shouldUseMultiThread && shouldBeChunked && contentLength > 0;

    if (shouldUseMultiThreadDownload) {
      // Enhanced multi-threaded chunked download with better error handling
      const maxThreads = Math.min(options.maxThreads || 4, 8);
      const threadChunkSize = Math.max(dlChunkSize, Math.ceil(contentLength / maxThreads));
      
      const activeRequests = new Map();
      const completedChunks = new Set();
      const totalThreads = Math.min(maxThreads, Math.ceil(contentLength / threadChunkSize));
      let hasErrored = false;
      
      for (let i = 0; i < totalThreads && i * threadChunkSize < contentLength; i++) {
        const start = i * threadChunkSize;
        const end = Math.min(start + threadChunkSize - 1, contentLength - 1);
        
        const threadRequestOptions = {
          ...requestOptions,
          headers: {
            ...requestOptions.headers,
            Range: `bytes=${start}-${end}`
          }
        };
        
        const threadReq = createUndiciStream(format.url, threadRequestOptions);
        activeRequests.set(i, threadReq);
        
        threadReq.on('data', (chunk) => {
          if (!stream.destroyed && !hasErrored) {
            stream.write(chunk);
            ondata(chunk);
          }
        });
        
        threadReq.on('end', () => {
          completedChunks.add(i);
          activeRequests.delete(i);
          
          // Check if all threads completed successfully
          if (completedChunks.size >= totalThreads && !hasErrored) {
            stream.end();
          }
        });
        
        threadReq.on('error', (error) => {
          if (!hasErrored) {
            hasErrored = true;
            
            // Clean up all active requests
            activeRequests.forEach(req => {
              if (req !== threadReq) {
                req.destroy();
              }
            });
            activeRequests.clear();

            // Fall back to single-thread download
            const fallbackReq = createUndiciStream(format.url, requestOptions);
            fallbackReq.on("data", ondata);
            pipeAndSetEvents(fallbackReq, stream, true);
          }
        });
      }
      
      stream._destroy = () => {
        stream.destroyed = true;
        hasErrored = true;
        activeRequests.forEach(req => {
          if (req && typeof req.destroy === 'function') {
            req.destroy();
          }
        });
        activeRequests.clear();
      };
      
      return; // Skip single-thread logic
    }

    if (shouldBeChunked) {
      let start = options.range?.start || 0;
      let end = start + dlChunkSize;
      const rangeEnd = options.range?.end;

      let chunkContentLength = options.range
        ? (rangeEnd ? rangeEnd + 1 : contentLength) - start
        : contentLength;

      const getNextChunk = () => {
        if (stream.destroyed) return;
        if (!rangeEnd && end >= chunkContentLength) end = 0;
        if (rangeEnd && end > rangeEnd) end = rangeEnd;
        shouldEnd = !end || end === rangeEnd;

        requestOptions.headers = Object.assign({}, requestOptions.headers, {
          Range: `bytes=${start}-${end || ""}`,
        });
        req = createUndiciStream(format.url, requestOptions);
        req.on("data", ondata);
        req.on("end", () => {
          if (stream.destroyed) return;
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
      // Simple direct download for combined audio+video formats or when chunking disabled
      if (options.begin) {
        format.url += `&begin=${parseTimestamp(options.begin)}`;
      }
      if (options.range?.start || options.range?.end) {
        requestOptions.headers = Object.assign({}, requestOptions.headers, {
          Range: `bytes=${options.range.start || "0"}-${options.range.end || ""}`,
        });
      }
      
      req = miniget(format.url, requestOptions);
      req.on("response", res => {
        // Additional M3U8 detection from response headers
        const contentType = res.headers['content-type'] || '';
        const isM3U8Response = contentType.includes('mpegurl') || 
                               contentType.includes('m3u8') ||
                               res.headers['content-disposition']?.includes('.m3u8');
        
        if (isM3U8Response && !format.isHLS) {
          req.destroy();
          
          const hlsReq = m3u8stream(format.url, {
            chunkReadahead: +info.live_chunk_readahead || 3,
            begin: options.begin || (format.isLive && Date.now()),
            liveBuffer: options.liveBuffer,
            requestOptions: options.requestOptions,
            parser: "m3u8",
            id: format.itag,
          });

          hlsReq.on("progress", (segment, totalSegments) => {
            stream.emit("progress", segment.size, segment.num, totalSegments);
          });
          pipeAndSetEvents(hlsReq, stream, shouldEnd);
          return;
        }
        if (stream.destroyed) return;
        contentLength = contentLength || parseInt(res.headers["content-length"]);
      });
      req.on("data", ondata);
      pipeAndSetEvents(req, stream, shouldEnd);
    }
  }

  stream._destroy = () => {
    stream.destroyed = true;
    if (req) {
      req.destroy();
      req.end();
    }
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
    throw Error("Cannot use `ytdl.downloadFromInfo()` when called with info from `ytdl.getBasicInfo()`");
  }
  setImmediate(() => {
    downloadFromInfoCallback(stream, info, options);
  });
  return stream;
};
