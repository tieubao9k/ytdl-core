const { request } = require("undici");
const { writeFileSync } = require("fs");
const AGENT = require("./agent");

/**
 * Extract string inbetween another.
 *
 * @param {string} haystack
 * @param {string} left
 * @param {string} right
 * @returns {string}
 */
const between = (exports.between = (haystack, left, right) => {
  let pos;
  if (left instanceof RegExp) {
    const match = haystack.match(left);
    if (!match) {
      return "";
    }
    pos = match.index + match[0].length;
  } else {
    pos = haystack.indexOf(left);
    if (pos === -1) {
      return "";
    }
    pos += left.length;
  }
  haystack = haystack.slice(pos);
  pos = haystack.indexOf(right);
  if (pos === -1) {
    return "";
  }
  haystack = haystack.slice(0, pos);
  return haystack;
});

exports.tryParseBetween = (body, left, right, prepend = "", append = "") => {
  try {
    let data = between(body, left, right);
    if (!data) return null;
    
    // Clean up common YouTube JSON issues
    data = data.trim();
    
    // Remove trailing comma or semicolon
    data = data.replace(/[,;]$/, '');
    
    // Handle incomplete objects
    if (data.endsWith('}}') && !data.endsWith('}}}')) {
      data = data + '}';
    }
    
    // Try parsing with prepend/append
    let jsonStr = `${prepend}${data}${append}`;
    
    // Clean up malformed JSON
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    return JSON.parse(jsonStr);
  } catch (e) {
    // Advanced parsing fallback for YouTube 2025
    try {
      let data = between(body, left, right);
      if (!data) return null;
      
      // Remove HTML entities
      data = data.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
      
      // Fix common YouTube JSON patterns
      data = data.replace(/\\"/g, '"');
      data = data.replace(/\\n/g, '');
      data = data.replace(/\\t/g, '');
      
      // Try to find a valid JSON substring
      let startBrace = data.indexOf('{');
      let endBrace = data.lastIndexOf('}');
      
      if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
        data = data.substring(startBrace, endBrace + 1);
        return JSON.parse(data);
      }
      
      return null;
    } catch (e2) {
      return null;
    }
  }
};

/**
 * Advanced JSON extraction for YouTube 2025 format
 * Handles new YouTube JSON structures and patterns
 */
exports.extractYouTubeJSON = (body, varName) => {
  const patterns = [
    // Standard patterns
    new RegExp(`var ${varName}\\s*=\\s*({.+?});`, 'i'),
    new RegExp(`"${varName}"\\s*:\\s*({.+?})(?:,|$)`, 'i'),
    new RegExp(`${varName}\\s*[":=]\\s*({.+?})(?:[,;}]|$)`, 'i'),
    
    // 2025 patterns
    new RegExp(`["']${varName}["']\\s*:\\s*({.+?})(?:,|$)`, 'i'),
    new RegExp(`\\b${varName}\\b.*?:\\s*({.+?})(?:[,;}\\]])`, 'i'),
    
    // Embedded patterns
    new RegExp(`ytcfg\\.set\\(.*?"${varName}"\\s*:\\s*({.+?})`, 'i'),
    new RegExp(`window\\["yt"\\].*?"${varName}"\\s*:\\s*({.+?})`, 'i')
  ];
  
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      try {
        // Clean the JSON string
        let jsonStr = match[1];
        
        // Balance braces if needed
        const openBraces = (jsonStr.match(/{/g) || []).length;
        const closeBraces = (jsonStr.match(/}/g) || []).length;
        
        if (openBraces > closeBraces) {
          jsonStr += '}'.repeat(openBraces - closeBraces);
        }
        
        // Clean up common issues
        jsonStr = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ':"$1"')      // Convert single to double quotes
          .replace(/\\'/g, "'");                   // Fix escaped quotes
        
        return JSON.parse(jsonStr);
      } catch (e) {
        continue; // Try next pattern
      }
    }
  }
  
  return null;
};

/**
 * Get a number from an abbreviated number string.
 *
 * @param {string} string
 * @returns {number}
 */
exports.parseAbbreviatedNumber = string => {
  const match = string
    .replace(",", ".")
    .replace(" ", "")
    .match(/([\d,.]+)([MK]?)/);
  if (match) {
    let [, num, multi] = match;
    num = parseFloat(num);
    return Math.round(multi === "M" ? num * 1000000 : multi === "K" ? num * 1000 : num);
  }
  return null;
};

/**
 * Escape sequences for cutAfterJS
 * @param {string} start the character string the escape sequence
 * @param {string} end the character string to stop the escape seequence
 * @param {undefined|Regex} startPrefix a regex to check against the preceding 10 characters
 */
const ESCAPING_SEQUENZES = [
  // Strings
  { start: '"', end: '"' },
  { start: "'", end: "'" },
  { start: "`", end: "`" },
  // RegeEx
  { start: "/", end: "/", startPrefix: /(^|[[{:;,/])\s?$/ },
];

/**
 * Match begin and end braces of input JS, return only JS
 *
 * @param {string} mixedJson
 * @returns {string}
 */
exports.cutAfterJS = mixedJson => {
  // Define the general open and closing tag
  let open, close;
  if (mixedJson[0] === "[") {
    open = "[";
    close = "]";
  } else if (mixedJson[0] === "{") {
    open = "{";
    close = "}";
  }

  if (!open) {
    throw new Error(`Can't cut unsupported JSON (need to begin with [ or { ) but got: ${mixedJson[0]}`);
  }

  // States if the loop is currently inside an escaped js object
  let isEscapedObject = null;

  // States if the current character is treated as escaped or not
  let isEscaped = false;

  // Current open brackets to be closed
  let counter = 0;

  let i;
  // Go through all characters from the start
  for (i = 0; i < mixedJson.length; i++) {
    // End of current escaped object
    if (!isEscaped && isEscapedObject !== null && mixedJson[i] === isEscapedObject.end) {
      isEscapedObject = null;
      continue;
      // Might be the start of a new escaped object
    } else if (!isEscaped && isEscapedObject === null) {
      for (const escaped of ESCAPING_SEQUENZES) {
        if (mixedJson[i] !== escaped.start) continue;
        // Test startPrefix against last 10 characters
        if (!escaped.startPrefix || mixedJson.substring(i - 10, i).match(escaped.startPrefix)) {
          isEscapedObject = escaped;
          break;
        }
      }
      // Continue if we found a new escaped object
      if (isEscapedObject !== null) {
        continue;
      }
    }

    // Toggle the isEscaped boolean for every backslash
    // Reset for every regular character
    isEscaped = mixedJson[i] === "\\" && !isEscaped;

    if (isEscapedObject !== null) continue;

    if (mixedJson[i] === open) {
      counter++;
    } else if (mixedJson[i] === close) {
      counter--;
    }

    // All brackets have been closed, thus end of JSON is reached
    if (counter === 0) {
      // Return the cut JSON
      return mixedJson.substring(0, i + 1);
    }
  }

  // We ran through the whole string and ended up with an unclosed bracket
  throw Error("Can't cut unsupported JSON (no matching closing bracket found)");
};

class UnrecoverableError extends Error {}
/**
 * Checks if there is a playability error.
 *
 * @param {Object} player_response
 * @returns {!Error}
 */
exports.playError = player_response => {
  const playability = player_response?.playabilityStatus;
  if (!playability) return null;
  if (["ERROR", "LOGIN_REQUIRED"].includes(playability.status)) {
    return new UnrecoverableError(playability.reason || playability.messages?.[0]);
  }
  if (playability.status === "LIVE_STREAM_OFFLINE") {
    return new UnrecoverableError(playability.reason || "The live stream is offline.");
  }
  if (playability.status === "UNPLAYABLE") {
    return new UnrecoverableError(playability.reason || "This video is unavailable.");
  }
  return null;
};

// Undici request
const useFetch = async (fetch, url, requestOptions) => {
  // embed query to url
  const query = requestOptions.query;
  if (query) {
    const urlObject = new URL(url);
    for (const key in query) {
      urlObject.searchParams.append(key, query[key]);
    }
    url = urlObject.toString();
  }

  const response = await fetch(url, requestOptions);

  // convert webstandard response to undici request's response
  const statusCode = response.status;
  const body = Object.assign(response, response.body || {});
  const headers = Object.fromEntries(response.headers.entries());

  return { body, statusCode, headers };
};
exports.request = async (url, options = {}) => {
  let { requestOptions, rewriteRequest, fetch } = options;

  if (typeof rewriteRequest === "function") {
    const rewritten = rewriteRequest(url, requestOptions);
    requestOptions = rewritten.requestOptions || requestOptions;
    url = rewritten.url || url;
  }

  // Ensure proper decompression for YouTube requests
  if (!requestOptions.headers) requestOptions.headers = {};
  if (!requestOptions.headers['Accept-Encoding']) {
    requestOptions.headers['Accept-Encoding'] = 'identity';
  }

  const req =
    typeof fetch === "function" ? await useFetch(fetch, url, requestOptions) : await request(url, requestOptions);
  const code = req.statusCode.toString();

  if (code.startsWith("2")) {
    if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
      return req.body.json();
    }
    
    // Handle text response with potential encoding issues
    let responseText = await req.body.text();
    
    // Check if response looks corrupted (contains binary data)
    const hasBinaryData = /[\x00-\x08\x0E-\x1F\x7F-\xFF]/.test(responseText.substring(0, 100));
    
    if (hasBinaryData && req.headers["content-encoding"]) {
      const encoding = req.headers["content-encoding"];
      console.log(`🗜️  Handling compressed response: ${encoding}`);
      
      // Try manual decompression for various encodings
      if (req.body.arrayBuffer) {
        try {
          const buffer = new Uint8Array(await req.body.arrayBuffer());
          const zlib = require('zlib');
          
          let decompressed;
          if (encoding === 'gzip') {
            decompressed = zlib.gunzipSync(buffer);
          } else if (encoding === 'deflate') {
            decompressed = zlib.inflateSync(buffer);
          } else if (encoding === 'br' && zlib.brotliDecompressSync) {
            decompressed = zlib.brotliDecompressSync(buffer);
          }
          
          if (decompressed) {
            responseText = decompressed.toString('utf-8');
            console.log(`✅ Successfully decompressed ${encoding} response`);
          }
        } catch (decodeErr) {
          console.warn('⚠️  Manual decompression failed:', decodeErr.message);
          
          // Last resort: try to extract readable parts
          const readableParts = responseText.replace(/[\x00-\x1F\x7F-\xFF]/g, '');
          if (readableParts.length > 1000) {
            console.log('🔄 Using readable parts extraction as fallback');
            responseText = readableParts;
          }
        }
      }
    }
    
    return responseText;
  }
  if (code.startsWith("3")) return exports.request(req.headers.location, options);

  const e = new Error(`Status code: ${code}`);
  e.statusCode = req.statusCode;
  throw e;
};

/**
 * Temporary helper to help deprecating a few properties.
 *
 * @param {Object} obj
 * @param {string} prop
 * @param {Object} value
 * @param {string} oldPath
 * @param {string} newPath
 */
exports.deprecate = (obj, prop, value, oldPath, newPath) => {
  Object.defineProperty(obj, prop, {
    get: () => {
      console.warn(`\`${oldPath}\` will be removed in a near future release, ` + `use \`${newPath}\` instead.`);
      return value;
    },
  });
};

// Check for updates.
const pkg = require("../package.json");
const UPDATE_INTERVAL = 1000 * 60 * 60 * 12;
let updateWarnTimes = 0;
exports.lastUpdateCheck = 0;
exports.checkForUpdates = () => {
  // Update check disabled for ytdl-core-enhanced
  // This package integrates DisTube functionality but maintains independent versioning
  return null;
};

/**
 * Gets random IPv6 Address from a block
 *
 * @param {string} ip the IPv6 block in CIDR-Notation
 * @returns {string}
 */
const getRandomIPv6 = ip => {
  if (!isIPv6(ip)) {
    throw new Error("Invalid IPv6 format");
  }

  const [rawAddr, rawMask] = ip.split("/");
  const mask = parseInt(rawMask, 10);

  if (isNaN(mask) || mask > 128 || mask < 1) {
    throw new Error("Invalid IPv6 subnet mask (must be between 1 and 128)");
  }

  const base10addr = normalizeIP(rawAddr);

  const fullMaskGroups = Math.floor(mask / 16);
  const remainingBits = mask % 16;

  const result = new Array(8).fill(0);

  for (let i = 0; i < 8; i++) {
    if (i < fullMaskGroups) {
      result[i] = base10addr[i];
    } else if (i === fullMaskGroups && remainingBits > 0) {
      const groupMask = 0xffff << (16 - remainingBits);
      const randomPart = Math.floor(Math.random() * (1 << (16 - remainingBits)));
      result[i] = (base10addr[i] & groupMask) | randomPart;
    } else {
      result[i] = Math.floor(Math.random() * 0x10000);
    }
  }

  return result.map(x => x.toString(16).padStart(4, "0")).join(":");
};

const isIPv6 = ip => {
  const IPV6_REGEX =
    /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(?:\/(?:1[0-1][0-9]|12[0-8]|[1-9][0-9]|[1-9]))?$/;
  return IPV6_REGEX.test(ip);
};

/**
 * Normalizes an IPv6 address into an array of 8 integers
 * @param {string} ip - IPv6 address
 * @returns {number[]} - Array of 8 integers representing the address
 */
const normalizeIP = ip => {
  const parts = ip.split("::");
  let start = parts[0] ? parts[0].split(":") : [];
  let end = parts[1] ? parts[1].split(":") : [];

  const missing = 8 - (start.length + end.length);
  const zeros = new Array(missing).fill("0");

  const full = [...start, ...zeros, ...end];

  return full.map(part => parseInt(part || "0", 16));
};

exports.saveDebugFile = (name, body) => {
  if (process.env.YTDL_NO_DEBUG_FILE) {
    console.warn(`\x1b[33mWARNING:\x1b[0m Debug file saving is disabled. "${name}"`);
    return body;
  }
  const filename = `${+new Date()}-${name}`;
  const debugPath = process.env.YTDL_DEBUG_PATH || '.';
  writeFileSync(`${debugPath}/${filename}`, body);
  return filename;
};

const findPropKeyInsensitive = (obj, prop) =>
  Object.keys(obj).find(p => p.toLowerCase() === prop.toLowerCase()) || null;

exports.getPropInsensitive = (obj, prop) => {
  const key = findPropKeyInsensitive(obj, prop);
  return key && obj[key];
};

exports.setPropInsensitive = (obj, prop, value) => {
  const key = findPropKeyInsensitive(obj, prop);
  obj[key || prop] = value;
  return key;
};

let oldCookieWarning = true;
let oldDispatcherWarning = true;
exports.applyDefaultAgent = options => {
  if (!options.agent) {
    const { jar } = AGENT.defaultAgent;
    const c = exports.getPropInsensitive(options.requestOptions.headers, "cookie");
    if (c) {
      jar.removeAllCookiesSync();
      AGENT.addCookiesFromString(jar, c);
      if (oldCookieWarning) {
        oldCookieWarning = false;
        console.warn(
          "\x1b[33mWARNING:\x1B[0m Using old cookie format, " +
            "please use the new one instead. (https://github.com/tieubao9k/ytdl-core#cookies-support)",
        );
      }
    }
    if (options.requestOptions.dispatcher && oldDispatcherWarning) {
      oldDispatcherWarning = false;
      console.warn(
        "\x1b[33mWARNING:\x1B[0m Your dispatcher is overridden by `ytdl.Agent`. " +
          "To implement your own, check out the documentation. " +
          "(https://github.com/tieubao9k/ytdl-core#how-to-implement-ytdlagent-with-your-own-dispatcher)",
      );
    }
    options.agent = AGENT.defaultAgent;
  }
};

let oldLocalAddressWarning = true;
exports.applyOldLocalAddress = options => {
  if (!options?.requestOptions?.localAddress || options.requestOptions.localAddress === options.agent.localAddress)
    return;
  options.agent = AGENT.createAgent(undefined, { localAddress: options.requestOptions.localAddress });
  if (oldLocalAddressWarning) {
    oldLocalAddressWarning = false;
    console.warn(
      "\x1b[33mWARNING:\x1B[0m Using old localAddress option, " +
        "please add it to the agent options instead. (https://github.com/tieubao9k/ytdl-core#ip-rotation)",
    );
  }
};

let oldIpRotationsWarning = true;
exports.applyIPv6Rotations = options => {
  if (options.IPv6Block) {
    options.requestOptions = Object.assign({}, options.requestOptions, {
      localAddress: getRandomIPv6(options.IPv6Block),
    });
    if (oldIpRotationsWarning) {
      oldIpRotationsWarning = false;
      oldLocalAddressWarning = false;
      console.warn(
        "\x1b[33mWARNING:\x1B[0m IPv6Block option is deprecated, " +
          "please create your own ip rotation instead. (https://github.com/tieubao9k/ytdl-core#ip-rotation)",
      );
    }
  }
};

exports.applyDefaultHeaders = options => {
  const { antiBotManager } = require('./anti-bot');
  
  options.requestOptions = { ...options.requestOptions };
  
  // Apply anti-bot headers including dynamic User-Agent
  const antiBotHeaders = antiBotManager.getBrowserHeaders();
  
  options.requestOptions.headers = {
    ...antiBotHeaders,
    ...options.requestOptions.headers,
    // Force identity encoding to avoid compression issues
    'Accept-Encoding': 'identity'
  };
  
  // Apply fingerprint resistance
  antiBotManager.addFingerprintResistance(options);
};

exports.generateClientPlaybackNonce = length => {
  const CPN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CPN_CHARS[Math.floor(Math.random() * CPN_CHARS.length)];
  }
  return result;
};

exports.applyPlayerClients = options => {
  if (!options.playerClients || options.playerClients.length === 0) {
    options.playerClients = ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"];
  }
};
