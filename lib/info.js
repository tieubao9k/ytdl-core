/* eslint-disable no-unused-vars */
const sax = require("sax");

const utils = require("./utils");
const { setTimeout } = require("timers");
const formatUtils = require("./format-utils");
const urlUtils = require("./url-utils");
const extras = require("./info-extras");
const Cache = require("./cache");
const sig = require("./sig");
const innertubeClients = require("./innertube-clients");

let BG, JSDOM;
try {
  BG = require("bgutils-js").BG;
  JSDOM = require("jsdom").JSDOM;
} catch (_) {
  BG = null;
  JSDOM = null;
}

const poTokenCache = { poToken: null, visitorData: null, expiry: 0, requestKey: null };
const PO_TOKEN_TTL = 6 * 60 * 60 * 1000;
const DEFAULT_REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

const fetchVisitorDataAndKey = async () => {
  const response = await fetch("https://www.youtube.com/embed", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
  });
  const body = await response.text();

  // Extract visitorData
  let visitorData = null;
  const visitorMatch = body.match(/"visitorData"\s*:\s*"([^"]+)"/);
  if (visitorMatch) {
    visitorData = visitorMatch[1];
  } else {
    const cookies = response.headers.get("set-cookie") || "";
    const cookieMatch = cookies.match(/VISITOR_INFO1_LIVE=([^;]+)/);
    if (cookieMatch) visitorData = cookieMatch[1];
  }

  // Extract BotGuard REQUEST_KEY dynamically from YouTube's page
  // Note: INNERTUBE_API_KEY is different from BotGuard requestKey!
  let requestKey = DEFAULT_REQUEST_KEY;
  const requestKeyMatch = body.match(/"requestKey"\s*:\s*"([^"]+)"/);
  if (requestKeyMatch) {
    requestKey = requestKeyMatch[1];
  }

  return { visitorData, requestKey };
};

// Legacy function for backwards compatibility
const fetchVisitorData = async () => {
  const result = await fetchVisitorDataAndKey();
  if (!result.visitorData) {
    throw new Error("Could not fetch visitorData from YouTube");
  }
  return result.visitorData;
};


const generatePoToken = async (visitorData) => {
  const debug = process.env.DEBUG_POTOKEN;

  // Return cached token if valid
  if (poTokenCache.poToken && Date.now() < poTokenCache.expiry) {
    return { poToken: poTokenCache.poToken, visitorData: poTokenCache.visitorData };
  }

  if (!BG || !JSDOM) {
    throw new Error(
      "bgutils-js and jsdom are required for poToken generation. " +
      "Run: npm install bgutils-js jsdom",
    );
  }

  // Save native fetch FIRST before anything else
  const nativeFetch = globalThis.fetch;
  if (debug) {
    console.log("[poToken] Step 1: Saved nativeFetch");
    console.log("[poToken] Step 1: typeof nativeFetch:", typeof nativeFetch);
    console.log("[poToken] Step 1: nativeFetch.name:", nativeFetch?.name);
  }

  // Fetch visitorData and requestKey dynamically
  let requestKey = poTokenCache.requestKey || DEFAULT_REQUEST_KEY;
  if (!visitorData) {
    if (debug) console.log("[poToken] Step 2: Fetching visitorData...");
    const result = await fetchVisitorDataAndKey();
    visitorData = result.visitorData;
    if (result.requestKey) {
      requestKey = result.requestKey;
      poTokenCache.requestKey = requestKey;
    }
    if (!visitorData) {
      throw new Error("Could not fetch visitorData from YouTube");
    }
    if (debug) console.log("[poToken] Step 2: Got visitorData:", visitorData?.substring(0, 30) + "...");
  }

  if (debug) console.log("[poToken] Step 3: Creating JSDOM...");
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    url: "https://www.youtube.com",
    referrer: "https://www.youtube.com",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });

  const savedGlobals = {};
  const keysToReplace = ["window", "document", "navigator", "location", "self"];

  try {
    if (debug) console.log("[poToken] Step 4: Creating bgConfig...");
    // Wrap fetch to debug what's happening
    const wrappedFetch = async (url, options) => {
      if (debug) {
        console.log("[poToken] Fetch called:", url);
        console.log("[poToken] Fetch body:", options?.body?.substring?.(0, 200) || options?.body);
      }
      const res = await nativeFetch(url, options);
      if (debug) {
        console.log("[poToken] Fetch response:", res.status, res.ok);
        if (!res.ok) {
          const text = await res.clone().text();
          console.log("[poToken] Fetch error body:", text.substring(0, 200));
        }
      }
      return res;
    };
    const bgConfig = {
      fetch: debug ? wrappedFetch : nativeFetch,
      globalObj: globalThis,
      identifier: visitorData,
      requestKey: requestKey,
    };

    if (debug) {
      console.log("[poToken] Step 5: Creating challenge...");
      console.log("[poToken] Step 5: bgConfig.requestKey:", bgConfig.requestKey);
      console.log("[poToken] Step 5: bgConfig.identifier:", bgConfig.identifier?.substring(0, 30) + "...");
    }
    const challenge = await BG.Challenge.create(bgConfig);
    if (debug) console.log("[poToken] Step 5: Challenge created, globalName:", challenge.globalName);

    if (!challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue) {
      throw new Error("Could not get BotGuard challenge script");
    }

    // Setup globals AFTER challenge is created, BEFORE executing script
    if (debug) console.log("[poToken] Step 6: Setting up globals...");
    for (const key of keysToReplace) {
      savedGlobals[key] = globalThis[key];
      if (key === "window" || key === "self") {
        globalThis[key] = dom.window;
      } else {
        globalThis[key] = dom.window[key];
      }
    }

    if (debug) console.log("[poToken] Step 7: Executing interpreter script...");
    new Function(challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue)();

    if (debug) console.log("[poToken] Step 8: Generating poToken...");
    const poTokenResult = await BG.PoToken.generate({
      program: challenge.program,
      globalName: challenge.globalName,
      bgConfig,
    });

    // Cache the result
    poTokenCache.poToken = poTokenResult.poToken;
    poTokenCache.visitorData = visitorData;
    poTokenCache.requestKey = requestKey;
    poTokenCache.expiry = Date.now() + PO_TOKEN_TTL;

    return { poToken: poTokenResult.poToken, visitorData };
  } finally {
    // Restore globals
    for (const key of Object.keys(savedGlobals)) {
      if (savedGlobals[key] !== undefined) {
        globalThis[key] = savedGlobals[key];
      } else {
        delete globalThis[key];
      }
    }
    dom.window.close();
  }
};

exports.generatePoToken = generatePoToken;

const BASE_URL = "https://www.youtube.com/watch?v=";
exports.cache = new Cache();
exports.watchPageCache = new Cache();
const AGE_RESTRICTED_URLS = ["support.google.com/youtube/?p=age_restrictions", "youtube.com/t/community_guidelines"];

/**
 * Gets info from a video without getting additional formats.
 *
 * @param {string} id
 * @param {Object} options
 * @returns {Promise<Object>}
 */
exports.getBasicInfo = async (id, options) => {
  utils.applyIPv6Rotations(options);
  utils.applyDefaultHeaders(options);
  utils.applyDefaultAgent(options);
  utils.applyOldLocalAddress(options);
  const retryOptions = Object.assign({}, options.requestOptions);
  const { jar, dispatcher } = options.agent;
  utils.setPropInsensitive(
    options.requestOptions.headers,
    "cookie",
    jar.getCookieStringSync("https://www.youtube.com"),
  );
  options.requestOptions.dispatcher = dispatcher;
  if (options.visitorData) {
    utils.setPropInsensitive(options.requestOptions.headers, "X-Goog-Visitor-Id", options.visitorData);
  }
  const info = await retryFunc(getWatchHTMLPage, [id, options], retryOptions);

  const playErr = utils.playError(info.player_response);
  if (playErr) throw playErr;

  Object.assign(info, {
    related_videos: extras.getRelatedVideos(info),
  });

  // Add additional properties to info.
  const media = extras.getMedia(info);
  const additional = {
    author: extras.getAuthor(info),
    media,
    likes: extras.getLikes(info),
    age_restricted: !!(
      media && AGE_RESTRICTED_URLS.some(url => Object.values(media).some(v => typeof v === "string" && v.includes(url)))
    ),

    // Give the standard link to the video.
    video_url: BASE_URL + id,
    storyboards: extras.getStoryboards(info),
    chapters: extras.getChapters(info),
  };

  info.videoDetails = extras.cleanVideoDetails(
    Object.assign(
      {},
      info.player_response?.microformat?.playerMicroformatRenderer,
      info.player_response?.videoDetails,
      additional,
    ),
    info,
  );

  return info;
};

const getWatchHTMLURL = (id, options) =>
  `${BASE_URL + id}&hl=${options.lang || "en"}&bpctr=${Math.ceil(Date.now() / 1000)}&has_verified=1`;
const getWatchHTMLPageBody = (id, options) => {
  const url = getWatchHTMLURL(id, options);
  return exports.watchPageCache.getOrSet(url, () => utils.request(url, options));
};

const EMBED_URL = "https://www.youtube.com/embed/";
const getEmbedPageBody = (id, options) => {
  const embedUrl = `${EMBED_URL + id}?hl=${options.lang || "en"}`;
  return utils.request(embedUrl, options);
};

const getHTML5player = body => {
  const html5playerRes =
    /<script\s+src="([^"]+)"(?:\s+type="text\/javascript")?\s+name="player_ias\/base"\s*>|"jsUrl":"([^"]+)"/.exec(body);
  return html5playerRes?.[1] || html5playerRes?.[2];
};

/**
 * Given a function, calls it with `args` until it's successful,
 * or until it encounters an unrecoverable error.
 *
 * @param {Function} func
 * @param {Array.<Object>} args
 * @param {Object} options
 * @param {number} options.maxRetries
 * @param {Object} options.backoff
 * @param {number} options.backoff.inc
 */
const retryFunc = async (func, args, options) => {
  let currentTry = 0,
    result;
  if (!options.maxRetries) options.maxRetries = 3;
  if (!options.backoff) options.backoff = { inc: 500, max: 5000 };
  while (currentTry <= options.maxRetries) {
    try {
      result = await func(...args);
      break;
    } catch (err) {
      if (err?.statusCode < 500 || currentTry >= options.maxRetries) throw err;
      const wait = Math.min(++currentTry * options.backoff.inc, options.backoff.max);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  return result;
};

const jsonClosingChars = /^[)\]}'\s]+/;
const parseJSON = (source, varName, json) => {
  if (!json || typeof json === "object") {
    return json;
  } else {
    try {
      json = json.replace(jsonClosingChars, "");
      return JSON.parse(json);
    } catch (err) {
      throw Error(`Error parsing ${varName} in ${source}: ${err.message}`);
    }
  }
};

const findJSON = (source, varName, body, left, right, prependJSON) => {
  const jsonStr = utils.between(body, left, right);
  if (!jsonStr) {
    throw Error(`Could not find ${varName} in ${source}`);
  }
  return parseJSON(source, varName, utils.cutAfterJS(`${prependJSON}${jsonStr}`));
};

const findPlayerResponse = (source, info) => {
  if (!info) return {};
  const player_response =
    info.args?.player_response || info.player_response || info.playerResponse || info.embedded_player_response;
  return parseJSON(source, "player_response", player_response);
};

const getWatchHTMLPage = async (id, options) => {
  const body = await getWatchHTMLPageBody(id, options);
  const info = { page: "watch" };
  try {
    try {
      info.player_response =
        utils.tryParseBetween(body, "var ytInitialPlayerResponse = ", "}};", "", "}}") ||
        utils.tryParseBetween(body, "var ytInitialPlayerResponse = ", ";var") ||
        utils.tryParseBetween(body, "var ytInitialPlayerResponse = ", ";</script>") ||
        findJSON("watch.html", "player_response", body, /\bytInitialPlayerResponse\s*=\s*\{/i, "</script>", "{");
    } catch (_e) {
      let args = findJSON("watch.html", "player_response", body, /\bytplayer\.config\s*=\s*{/, "</script>", "{");
      info.player_response = findPlayerResponse("watch.html", args);
    }

    info.response =
      utils.tryParseBetween(body, "var ytInitialData = ", "}};", "", "}}") ||
      utils.tryParseBetween(body, "var ytInitialData = ", ";</script>") ||
      utils.tryParseBetween(body, 'window["ytInitialData"] = ', "}};", "", "}}") ||
      utils.tryParseBetween(body, 'window["ytInitialData"] = ', ";</script>") ||
      findJSON("watch.html", "response", body, /\bytInitialData("\])?\s*=\s*\{/i, "</script>", "{");
    info.html5player = getHTML5player(body);
  } catch (_) {
    throw Error(
      "Error when parsing watch.html, maybe YouTube made a change.\n" +
        `Please report this issue with the "${utils.saveDebugFile(
          "watch.html",
          body,
        )}" file on https://github.com/distubejs/ytdl-core/issues.`,
    );
  }
  return info;
};

/**
 * @param {Object} player_response
 * @returns {Array.<Object>}
 */
const parseFormats = player_response => {
  return (player_response?.streamingData?.formats || [])?.concat(player_response?.streamingData?.adaptiveFormats || []);
};

const parseAdditionalManifests = (player_response, options) => {
  const streamingData = player_response?.streamingData,
    manifests = [];
  if (streamingData) {
    if (streamingData.dashManifestUrl) {
      manifests.push(getDashManifest(streamingData.dashManifestUrl, options));
    }
    if (streamingData.hlsManifestUrl) {
      manifests.push(getM3U8(streamingData.hlsManifestUrl, options));
    }
  }
  return manifests;
};

/**
 * Estimate audio bitrate based on format properties
 * @param {Object} format - Format object
 * @returns {number} - Estimated audio bitrate
 */
const estimateAudioBitrate = (format) => {
  if (format.audioBitrate) return format.audioBitrate;
  if (format.audioCodec) {
    const codec = format.audioCodec.toLowerCase();
    if (codec.includes('opus')) return format.quality === 'medium' ? 160 : 128;
    if (codec.includes('aac') || codec.includes('mp4a')) return format.quality === 'medium' ? 128 : 96;
    if (codec.includes('vorbis')) return format.quality === 'medium' ? 192 : 128;
    if (codec.includes('mp3')) return 128;
  }
  if (format.container === 'webm') return 128;
  if (format.container === 'mp4') return 96;
  return 64;
};

// TODO: Clean up this function for readability and support more clients
/**
 * Gets info from a video additional formats and deciphered URLs.
 *
 * @param {string} id
 * @param {Object} options
 * @returns {Promise<Object>}
 */
exports.getInfo = async (id, options) => {
  // Auto-generate poToken if not provided and bgutils-js is available
  if (!options.poToken && BG) {
    try {
      const tokens = await generatePoToken();
      options.poToken = tokens.poToken;
      options.visitorData = options.visitorData || tokens.visitorData;
    } catch (err) {
      // Log error for debugging, but continue without poToken
      if (process.env.DEBUG_POTOKEN) {
        console.error('[poToken] Generation failed:', err.message);
      }
    }
  }

  // Initialize request options
  utils.applyIPv6Rotations(options);
  utils.applyDefaultHeaders(options);
  utils.applyDefaultAgent(options);
  utils.applyOldLocalAddress(options);
  utils.applyPlayerClients(options);

  const info = await exports.getBasicInfo(id, options);

  // Pin player version for stable decipher/n-transform extraction
  info.html5player = "/s/player/4e51e895/player_es6.vflset/en_US/base.js";

  info.html5player = new URL(info.html5player, BASE_URL).toString();

  const formatPromises = [];

  try {
    const clientPromises = [];

    if (options.playerClients.includes("ANDROID_VR")) {
      clientPromises.push(fetchAndroidVRJsonPlayer(id, options));
    }
    if (options.playerClients.includes("ANDROID")) {
      clientPromises.push(fetchAndroidJsonPlayer(id, options));
    }
    if (options.playerClients.includes("WEB_EMBEDDED")) clientPromises.push(fetchWebEmbeddedPlayer(id, info, options));
    if (options.playerClients.includes("TV")) clientPromises.push(fetchTvPlayer(id, info, options));
    if (options.playerClients.includes("IOS")) clientPromises.push(fetchIosInnertubePlayer(id, options));

    if (clientPromises.length > 0) {
      const responses = await Promise.allSettled(clientPromises);
      const successfulResponses = responses
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
        .filter(r => r);

      for (const response of successfulResponses) {
        const formats = parseFormats(response);
        if (formats && formats.length > 0) {
          formatPromises.push(sig.decipherFormats(formats, info.html5player, options));
        }

        const manifestPromises = parseAdditionalManifests(response, options);
        formatPromises.push(...manifestPromises);
      }
    }

    if (options.playerClients.includes("WEB")) {
      const formats = parseFormats(info.player_response);
      if (formats && formats.length > 0) {
        formatPromises.push(sig.decipherFormats(formats, info.html5player, options));
      }

      const manifestPromises = parseAdditionalManifests(info.player_response, options);
      formatPromises.push(...manifestPromises);
    }
  } catch (error) {
    console.error("Error fetching formats:", error);

    const formats = parseFormats(info.player_response);
    if (formats && formats.length > 0) {
      formatPromises.push(sig.decipherFormats(formats, info.html5player, options));
    }

    const manifestPromises = parseAdditionalManifests(info.player_response, options);
    formatPromises.push(...manifestPromises);
  }

  if (formatPromises.length === 0) {
    throw new Error("Failed to find any playable formats");
  }

  const results = await Promise.all(formatPromises);
  const allFormats = Object.values(Object.assign({}, ...results));

  // Deduplicate by itag, prefer ANDROID_VR URLs (no download throttling)
  const itagMap = new Map();
  for (const format of allFormats) {
    if (!format || !format.url || !format.mimeType) continue;
    const itag = format.itag;
    const existing = itagMap.get(itag);
    if (!existing) {
      itagMap.set(itag, format);
    } else {
      // Prefer ANDROID_VR URL
      try {
        const newC = new URL(format.url).searchParams.get("c");
        const oldC = new URL(existing.url).searchParams.get("c");
        if (newC === "ANDROID_VR" && oldC !== "ANDROID_VR") {
          itagMap.set(itag, format);
        }
      } catch (_) { /* keep existing */ }
    }
  }
  info.formats = Array.from(itagMap.values());

  if (info.formats.length === 0) {
    throw new Error("No playable formats found");
  }

  info.formats = info.formats.map(format => {
    const enhancedFormat = formatUtils.addFormatMeta(format);

    if (!enhancedFormat.audioBitrate && enhancedFormat.hasAudio) {
      enhancedFormat.audioBitrate = estimateAudioBitrate(enhancedFormat);
    }

    if (
      !enhancedFormat.isHLS &&
      enhancedFormat.mimeType &&
      (enhancedFormat.mimeType.includes("hls") ||
        enhancedFormat.mimeType.includes("x-mpegURL") ||
        enhancedFormat.mimeType.includes("application/vnd.apple.mpegurl"))
    ) {
      enhancedFormat.isHLS = true;
    }

    return enhancedFormat;
  });

  info.formats.sort(formatUtils.sortFormats);

  // Append poToken to stream URLs (pot + potc=1 as per YouTube player data.js)
  if (options.poToken) {
    info.formats = info.formats.map(format => {
      if (format.url) {
        const u = new URL(format.url);
        u.searchParams.set("pot", options.poToken);
        u.searchParams.set("potc", "1");
        format.url = u.toString();
      }
      return format;
    });
  }

  const bestFormat =
    info.formats.find(format => format.hasVideo && format.hasAudio) ||
    info.formats.find(format => format.hasVideo) ||
    info.formats.find(format => format.hasAudio) ||
    info.formats[0];

  info.bestFormat = bestFormat;
  info.videoUrl = bestFormat.url;
  info.selectedFormat = bestFormat;
  info.full = true;

  return info;
};

const getPlaybackContext = async (html5player, options) => {
  const body = await utils.request(html5player, options);
  const mo = body.match(/(signatureTimestamp|sts):(\d+)/);
  return {
    contentPlaybackContext: {
      html5Preference: "HTML5_PREF_WANTS",
      signatureTimestamp: mo?.[2],
    },
  };
};

const getVisitorData = (info, _options) => {
  for (const respKey of ["player_response", "response"]) {
    try {
      return info[respKey].responseContext.serviceTrackingParams
          .find(x => x.service === "GFEEDBACK").params
          .find(x => x.key === "visitor_data").value;
    }
    catch { /* not present */ }
  }
  return undefined;
};

const LOCALE = { hl: "en", timeZone: "UTC", utcOffsetMinutes: 0 },
  CHECK_FLAGS = { contentCheckOk: true, racyCheckOk: true };

const WEB_EMBEDDED_CONTEXT = {
  client: {
    clientName: "WEB_EMBEDDED_PLAYER",
    clientVersion: "1.20250110.01.00",
    ...LOCALE,
  },
};

const TVHTML5_CONTEXT = {
  client: {
    clientName: "TVHTML5",
    clientVersion: "7.20250110.13.00",
    ...LOCALE,
  },
};

const fetchWebEmbeddedPlayer = async (videoId, info, options) => {
  const payload = {
    context: JSON.parse(JSON.stringify(WEB_EMBEDDED_CONTEXT)),
    videoId,
    playbackContext: await getPlaybackContext(info.html5player, options),
    ...CHECK_FLAGS,
  };
  if (options.visitorData) {
    payload.context.client.visitorData = options.visitorData;
  }
  if (options.poToken) {
    payload.serviceIntegrityDimensions = { poToken: options.poToken };
  }
  return await playerAPI(videoId, payload, options);
};
const fetchTvPlayer = async (videoId, info, options) => {
  const payload = {
    context: JSON.parse(JSON.stringify(TVHTML5_CONTEXT)),
    videoId,
    playbackContext: await getPlaybackContext(info.html5player, options),
    ...CHECK_FLAGS,
  };

  options.visitorId = getVisitorData(info, options);

  if (options.visitorData) {
    payload.context.client.visitorData = options.visitorData;
  }
  if (options.poToken) {
    payload.serviceIntegrityDimensions = { poToken: options.poToken };
  }
  return await playerAPI(videoId, payload, options);
};

const playerAPI = async (videoId, payload, options) => {
  const { jar, dispatcher } = options.agent;
  const opts = {
    requestOptions: {
      method: "POST",
      dispatcher,
      query: {
        prettyPrint: false,
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        "Content-Type": "application/json",
        Cookie: jar.getCookieStringSync("https://www.youtube.com"),
        "X-Goog-Api-Format-Version": "2",
      },
      body: null,
    },
  };
  if (options.poToken) {
    payload.serviceIntegrityDimensions = { poToken: options.poToken };
  }
  if (options.visitorData) {
    payload.context.client.visitorData = options.visitorData;
    opts.requestOptions.headers["X-Goog-Visitor-Id"] = options.visitorData;
  } else if (options.visitorId) {
    opts.requestOptions.headers["X-Goog-Visitor-Id"] = options.visitorId;
  }
  opts.requestOptions.body = JSON.stringify(payload);
  const response = await utils.request("https://youtubei.googleapis.com/youtubei/v1/player", opts);
  const playErr = utils.playError(response);
  if (playErr) throw playErr;
  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err = new Error("Malformed response from YouTube");
    err.response = response;
    throw err;
  }
  return response;
};

const IOS_CLIENT_VERSION = "19.50.7",
  IOS_DEVICE_MODEL = "iPhone16,2",
  IOS_USER_AGENT_VERSION = "18_2",
  IOS_OS_VERSION = "18.2.1.22C150";

const fetchIosJsonPlayer = async (videoId, options) => {
  const payload = {
    videoId,
    cpn: utils.generateClientPlaybackNonce(16),
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: "IOS",
        clientVersion: IOS_CLIENT_VERSION,
        deviceMake: "Apple",
        deviceModel: IOS_DEVICE_MODEL,
        platform: "MOBILE",
        osName: "iOS",
        osVersion: IOS_OS_VERSION,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: -240,
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true,
      },
      user: {
        lockedSafetyMode: false,
      },
    },
  };

  if (options.visitorData) {
    payload.context.client.visitorData = options.visitorData;
  }
  if (options.poToken) {
    payload.serviceIntegrityDimensions = { poToken: options.poToken };
  }

  const { jar, dispatcher } = options.agent;
  const opts = {
    requestOptions: {
      method: "POST",
      dispatcher,
      query: {
        prettyPrint: false,
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        "Content-Type": "application/json",
        cookie: jar.getCookieStringSync("https://www.youtube.com"),
        "User-Agent": `com.google.ios.youtube/${IOS_CLIENT_VERSION}(${
          IOS_DEVICE_MODEL
        }; U; CPU iOS ${IOS_USER_AGENT_VERSION} like Mac OS X; en_US)`,
        "X-Goog-Api-Format-Version": "2",
      },
      body: JSON.stringify(payload),
    },
  };
  if (options.visitorData) {
    opts.requestOptions.headers["X-Goog-Visitor-Id"] = options.visitorData;
  }
  const response = await utils.request("https://youtubei.googleapis.com/youtubei/v1/player", opts);
  const playErr = utils.playError(response);
  if (playErr) throw playErr;
  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err = new Error("Malformed response from YouTube");
    err.response = response;
    throw err;
  }
  return response;
};

const ANDROID_CLIENT_VERSION = "19.50.37",
  ANDROID_OS_VERSION = "14",
  ANDROID_SDK_VERSION = "34";

const fetchAndroidJsonPlayer = async (videoId, options) => {
  const payload = {
    videoId,
    cpn: utils.generateClientPlaybackNonce(16),
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: ANDROID_CLIENT_VERSION,
        platform: "MOBILE",
        osName: "Android",
        osVersion: ANDROID_OS_VERSION,
        androidSdkVersion: ANDROID_SDK_VERSION,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: -240,
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true,
      },
      user: {
        lockedSafetyMode: false,
      },
    },
  };

  if (options.visitorData) {
    payload.context.client.visitorData = options.visitorData;
  }
  if (options.poToken) {
    payload.serviceIntegrityDimensions = { poToken: options.poToken };
  }

  const { jar, dispatcher } = options.agent;
  const opts = {
    requestOptions: {
      method: "POST",
      dispatcher,
      query: {
        prettyPrint: false,
        t: utils.generateClientPlaybackNonce(12),
        id: videoId,
      },
      headers: {
        "Content-Type": "application/json",
        cookie: jar.getCookieStringSync("https://www.youtube.com"),
        "User-Agent": `com.google.android.youtube/${
          ANDROID_CLIENT_VERSION
        } (Linux; U; Android ${ANDROID_OS_VERSION}) gzip`,
        "X-Goog-Api-Format-Version": "2",
      },
      body: JSON.stringify(payload),
    },
  };
  if (options.visitorData) {
    opts.requestOptions.headers["X-Goog-Visitor-Id"] = options.visitorData;
  }
  const response = await utils.request("https://youtubei.googleapis.com/youtubei/v1/player", opts);
  const playErr = utils.playError(response);
  if (playErr) throw playErr;
  if (!response.videoDetails || videoId !== response.videoDetails.videoId) {
    const err = new Error("Malformed response from YouTube");
    err.response = response;
    throw err;
  }
  return response;
};

/**
 * Fetch video info using ANDROID_VR client (no throttling on adaptive formats).
 * This client bypasses YouTube's adaptive format throttling.
 *
 * @param {string} videoId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const fetchInnertubePlayer = async (videoId, options, clientName) => {
  try {
    const result = await innertubeClients.getInfo(videoId, { ...options, client: clientName });

    if (!result.success) {
      throw new Error(result.error || `${clientName} client failed`);
    }

    return {
      videoDetails: result.videoDetails,
      streamingData: {
        formats: result.formats.filter(f => f.hasVideo && f.hasAudio),
        adaptiveFormats: result.formats.filter(f => !(f.hasVideo && f.hasAudio)),
        expiresInSeconds: "21540",
      },
      playabilityStatus: {
        status: "OK",
      },
      _client: result._innerTube?.client || clientName,
    };
  } catch (error) {
    // Fallback to legacy ANDROID client
    return fetchAndroidJsonPlayer(videoId, options);
  }
};

const fetchAndroidVRJsonPlayer = (videoId, options) => fetchInnertubePlayer(videoId, options, "ANDROID_VR");
const fetchIosInnertubePlayer = (videoId, options) => fetchInnertubePlayer(videoId, options, "IOS");

/**
 * Gets additional DASH formats.
 *
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Array.<Object>>}
 */
const getDashManifest = (url, options) =>
  new Promise((resolve, reject) => {
    const formats = {};
    const parser = sax.parser(false);
    parser.onerror = reject;
    let adaptationSet;
    parser.onopentag = node => {
      if (node.name === "ADAPTATIONSET") {
        adaptationSet = node.attributes;
      } else if (node.name === "REPRESENTATION") {
        const itag = parseInt(node.attributes.ID);
        if (!isNaN(itag)) {
          formats[url] = Object.assign(
            {
              itag,
              url,
              bitrate: parseInt(node.attributes.BANDWIDTH),
              mimeType: `${adaptationSet.MIMETYPE}; codecs="${node.attributes.CODECS}"`,
            },
            node.attributes.HEIGHT
              ? {
                  width: parseInt(node.attributes.WIDTH),
                  height: parseInt(node.attributes.HEIGHT),
                  fps: parseInt(node.attributes.FRAMERATE),
                }
              : {
                  audioSampleRate: node.attributes.AUDIOSAMPLINGRATE,
                },
          );
        }
      }
    };
    parser.onend = () => {
      resolve(formats);
    };
    utils
      .request(new URL(url, BASE_URL).toString(), options)
      .then(res => {
        parser.write(res);
        parser.close();
      })
      .catch(reject);
  });

/**
 * Gets additional formats.
 *
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Array.<Object>>}
 */
const getM3U8 = async (url, options) => {
  url = new URL(url, BASE_URL);
  const body = await utils.request(url.toString(), options);
  const formats = {};
  body
    .split("\n")
    .filter(line => /^https?:\/\//.test(line))
    .forEach(line => {
      const itag = parseInt(line.match(/\/itag\/(\d+)\//)[1]);
      formats[line] = { itag, url: line };
    });
  return formats;
};

// Cache get info functions.
// In case a user wants to get a video's info before downloading.
for (const funcName of ["getBasicInfo", "getInfo"]) {
  /**
   * @param {string} link
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  const func = exports[funcName];
  exports[funcName] = async (link, options = {}) => {
    const id = await urlUtils.getVideoID(link);
    const key = [funcName, id, options.lang].join("-");
    return exports.cache.getOrSet(key, () => func(id, options));
  };
}

// Export a few helpers.
exports.validateID = urlUtils.validateID;
exports.validateURL = urlUtils.validateURL;
exports.getURLVideoID = urlUtils.getURLVideoID;
exports.getVideoID = urlUtils.getVideoID;
