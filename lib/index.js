const PassThrough = require("stream").PassThrough;
const getInfo = require("./info");
const utils = require("./utils");
const formatUtils = require("./format-utils");
const urlUtils = require("./url-utils");
const miniget = require("miniget");
const m3u8stream = require("m3u8stream");
const { parseTimestamp } = require("m3u8stream");
const agent = require("./agent");

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
  if (options.IPv6Block) {
    options.requestOptions = Object.assign({}, options.requestOptions, {
      localAddress: utils.getRandomIPv6(options.IPv6Block),
    });
  }

  if (options.agent) {
    // Don't set agent.agent (it's undefined and not needed for miniget)
    // options.requestOptions.agent = options.agent.agent;

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

  // Download strategy: YouTube requires specific browser headers
  // Without these headers, downloads fail with 403
  const dlChunkSize = typeof options.dlChunkSize === "number" ? options.dlChunkSize : 512 * 1024;

  // YouTube stream headers (matching real Chrome browser)
  const YOUTUBE_STREAM_HEADERS = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'origin': 'https://www.youtube.com',
    'referer': 'https://www.youtube.com/',
    'sec-ch-ua': '"Chromium";v="144", "Google Chrome";v="144", "Not-A.Brand";v="99"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"144.0.7559.110"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"10.0.0"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-storage-access': 'active',
    'x-browser-channel': 'stable',
    'x-browser-copyright': 'Copyright 2026 Google LLC. All Rights reserved.',
    'x-browser-validation': 'AKIAtsVHZoiKbPixy+qSK1BgKWo=',
    'x-browser-year': '2026',
    'x-client-data': 'CKO1yQEIhLbJAQiktskBCKmdygEIvYDLAQiTocsBCIWgzQEIl4zPAQiAps8BCOGmzwEI0KnPAQjaqs8BCLarzwEIvKvPARjshc8B',
  };
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

    // Merge YouTube stream headers
    requestOptions.headers = Object.assign({}, YOUTUBE_STREAM_HEADERS, requestOptions.headers);

    let shouldBeChunked = dlChunkSize !== 0 && (!format.hasAudio || !format.hasVideo);

    if (shouldBeChunked) {
      let start = options.range?.start || 0;
      let end = start + dlChunkSize;
      const rangeEnd = options.range?.end;

      contentLength = options.range
        ? (rangeEnd ? rangeEnd + 1 : parseInt(format.contentLength)) - start
        : parseInt(format.contentLength);

      const getNextChunk = () => {
        if (stream.destroyed) return;
        if (!rangeEnd && end >= contentLength) end = 0;
        if (rangeEnd && end > rangeEnd) end = rangeEnd;
        shouldEnd = !end || end === rangeEnd;

        // Use range= query param instead of Range header for faster downloads
        // YouTube throttles Range header requests but not query param
        const chunkUrl = new URL(format.url);
        chunkUrl.searchParams.set('range', `${start}-${end || ''}`);
        req = miniget(chunkUrl.toString(), requestOptions);
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
      // Audio only and video only formats don't support begin
      let downloadUrl = format.url;
      if (options.begin) {
        downloadUrl += `&begin=${parseTimestamp(options.begin)}`;
      }
      // Use range= query param instead of Range header for faster downloads
      if (options.range?.start || options.range?.end) {
        const rangeUrl = new URL(downloadUrl);
        rangeUrl.searchParams.set('range', `${options.range.start || '0'}-${options.range.end || ''}`);
        downloadUrl = rangeUrl.toString();
      }
      req = miniget(downloadUrl, requestOptions);
      req.on("response", res => {
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
