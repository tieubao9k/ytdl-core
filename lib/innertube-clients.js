const https = require('https');
const zlib = require('zlib');
const sigDecoder = require('./sig-decoder');

// WEB client - Browser-based, requires signature deciphering
const WEB_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20260128.01.00',
  clientId: '1',
  platform: 'DESKTOP',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  browserName: 'Chrome',
  browserVersion: '131.0.0.0',
  osName: 'Windows',
  osVersion: '10.0',
};

// ANDROID_VR client - Based on yt-dlp, downloads adaptive formats without throttling
const ANDROID_VR_CLIENT = {
  clientName: 'ANDROID_VR',
  clientVersion: '1.71.26',
  clientId: '28',
  deviceMake: 'Oculus',
  deviceModel: 'Quest 3',
  androidSdkVersion: 32,
  osName: 'Android',
  osVersion: '12L',
  userAgent: 'com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
};

// IOS client - Apple device, may bypass throttling like ANDROID_VR
const IOS_CLIENT = {
  clientName: 'IOS',
  clientVersion: '19.45.4',
  clientId: '5',
  deviceMake: 'Apple',
  deviceModel: 'iPhone16,2',
  osName: 'iOS',
  osVersion: '18.2.1.22C150',
  userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X; en_US)',
};

// Legacy ANDROID client (kept for fallback)
const ANDROID_CLIENT = {
  clientName: 'ANDROID',
  clientVersion: '19.30.36',
  platform: 'MOBILE',
  osName: 'Android',
  osVersion: '14',
  hl: 'vi',
  gl: 'VN',
  timeZone: 'Asia/Ho_Chi_Minh',
  utcOffsetMinutes: 420,
  userAgent: 'com.google.android.youtube/19.30.36 (Linux; U; Android 14; en_US) gzip',
  clientId: '3'
};

// Generate random nonce for API requests
function generateNonce(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Fetch YouTube webpage to get cookies and visitor data (required for ANDROID_VR)
async function fetchWebpageData(videoId) {
  return new Promise((resolve, reject) => {
    https.get(`https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept-Encoding': 'gzip',
        'Cookie': 'PREF=hl=en&tz=UTC; SOCS=CAI'
      }
    }, res => {
      const chunks = [];
      const cookies = {};

      for (const c of res.headers['set-cookie'] || []) {
        const [kv] = c.split(';');
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) {
          cookies[kv.substring(0, eqIdx)] = kv.substring(eqIdx + 1);
        }
      }

      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { data = zlib.gunzipSync(data); } catch(e) { /* ignore */ }
        }
        const html = data.toString();

        const visitorMatch = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
        const visitorData = visitorMatch ? visitorMatch[1] : '';

        const stsMatch = html.match(/(?:signatureTimestamp|sts)\s*:\s*(\d+)/);
        const sts = stsMatch ? parseInt(stsMatch[1]) : 20481;

        resolve({ cookies, visitorData, sts });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Request player API with ANDROID_VR client
async function requestInnerTubeVR(videoId, webpageData) {
  const { cookies, visitorData, sts } = webpageData;

  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; PREF=hl=en&tz=UTC; SOCS=CAI';

  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: ANDROID_VR_CLIENT.clientName,
        clientVersion: ANDROID_VR_CLIENT.clientVersion,
        deviceMake: ANDROID_VR_CLIENT.deviceMake,
        deviceModel: ANDROID_VR_CLIENT.deviceModel,
        androidSdkVersion: ANDROID_VR_CLIENT.androidSdkVersion,
        userAgent: ANDROID_VR_CLIENT.userAgent,
        osName: ANDROID_VR_CLIENT.osName,
        osVersion: ANDROID_VR_CLIENT.osVersion,
        hl: 'en',
        timeZone: 'UTC',
        utcOffsetMinutes: 0
      }
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
        signatureTimestamp: sts
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_VR_CLIENT.userAgent,
        'X-Youtube-Client-Name': ANDROID_VR_CLIENT.clientId,
        'X-Youtube-Client-Version': ANDROID_VR_CLIENT.clientVersion,
        'Origin': 'https://www.youtube.com',
        'X-Goog-Visitor-Id': visitorData,
        'Cookie': cookieStr,
        'Accept-Encoding': 'gzip',
        'Content-Length': Buffer.byteLength(requestBody),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { data = zlib.gunzipSync(data); } catch(e) { /* ignore */ }
        }
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          reject(new Error('Failed to parse player API response'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// IOS client request - similar approach to ANDROID_VR
async function requestInnerTubeIOS(videoId, webpageData) {
  const { cookies, visitorData, sts } = webpageData;
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; PREF=hl=en&tz=UTC; SOCS=CAI';

  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: IOS_CLIENT.clientName,
        clientVersion: IOS_CLIENT.clientVersion,
        deviceMake: IOS_CLIENT.deviceMake,
        deviceModel: IOS_CLIENT.deviceModel,
        userAgent: IOS_CLIENT.userAgent,
        osName: IOS_CLIENT.osName,
        osVersion: IOS_CLIENT.osVersion,
        hl: 'en',
        timeZone: 'UTC',
        utcOffsetMinutes: 0
      }
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
        signatureTimestamp: sts
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': IOS_CLIENT.userAgent,
        'X-Youtube-Client-Name': IOS_CLIENT.clientId,
        'X-Youtube-Client-Version': IOS_CLIENT.clientVersion,
        'Origin': 'https://www.youtube.com',
        'X-Goog-Visitor-Id': visitorData,
        'Cookie': cookieStr,
        'Accept-Encoding': 'gzip',
        'Content-Length': Buffer.byteLength(requestBody),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { data = zlib.gunzipSync(data); } catch(e) { /* ignore */ }
        }
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          reject(new Error('Failed to parse IOS player API response'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// WEB client request - requires signature deciphering for formats
async function requestInnerTubeWeb(videoId, webpageData) {
  const { cookies, visitorData, sts } = webpageData;
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; PREF=hl=en&tz=UTC; SOCS=CAI';

  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: WEB_CLIENT.clientName,
        clientVersion: WEB_CLIENT.clientVersion,
        platform: WEB_CLIENT.platform,
        userAgent: WEB_CLIENT.userAgent,
        browserName: WEB_CLIENT.browserName,
        browserVersion: WEB_CLIENT.browserVersion,
        osName: WEB_CLIENT.osName,
        osVersion: WEB_CLIENT.osVersion,
        hl: 'en',
        gl: 'US',
        timeZone: 'UTC',
        utcOffsetMinutes: 0
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true
      },
      user: {
        lockedSafetyMode: false
      }
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
        signatureTimestamp: sts
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WEB_CLIENT.userAgent,
        'X-Youtube-Client-Name': WEB_CLIENT.clientId,
        'X-Youtube-Client-Version': WEB_CLIENT.clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        'X-Goog-Visitor-Id': visitorData,
        'Cookie': cookieStr,
        'Accept-Encoding': 'gzip',
        'Content-Length': Buffer.byteLength(requestBody),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { data = zlib.gunzipSync(data); } catch(e) { /* ignore */ }
        }
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          reject(new Error('Failed to parse WEB player API response'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// ANDROID client request with proper authentication (like ANDROID_VR)
async function requestInnerTube(videoId, webpageData) {
  const { cookies, visitorData, sts } = webpageData;
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') + '; PREF=hl=en&tz=UTC; SOCS=CAI';

  const requestBody = JSON.stringify({
    context: {
      client: {
        clientName: ANDROID_CLIENT.clientName,
        clientVersion: ANDROID_CLIENT.clientVersion,
        androidSdkVersion: 34,
        userAgent: ANDROID_CLIENT.userAgent,
        osName: ANDROID_CLIENT.osName,
        osVersion: ANDROID_CLIENT.osVersion,
        platform: ANDROID_CLIENT.platform,
        hl: 'en',
        gl: 'US',
        timeZone: 'UTC',
        utcOffsetMinutes: 0
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true
      },
      user: {
        lockedSafetyMode: false
      }
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
        signatureTimestamp: sts
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_CLIENT.userAgent,
        'X-Youtube-Client-Name': ANDROID_CLIENT.clientId,
        'X-Youtube-Client-Version': ANDROID_CLIENT.clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        'X-Goog-Visitor-Id': visitorData,
        'Cookie': cookieStr,
        'Accept-Encoding': 'gzip',
        'Content-Length': Buffer.byteLength(requestBody),
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { data = zlib.gunzipSync(data); } catch(e) { /* ignore */ }
        }
        try {
          resolve(JSON.parse(data.toString()));
        } catch (error) {
          reject(new Error(`Failed to parse ANDROID response: ${error.message}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// Decipher formats that have encrypted signatures
async function decipherFormats(formats, playerScriptUrl) {
  if (!playerScriptUrl) {
    playerScriptUrl = await sigDecoder.getCachedPlayerScript();
  }

  const decipheredFormats = [];

  for (const format of formats) {
    try {
      if (format.url && !format.signatureCipher && !format.cipher) {
        try {
          const resolvedUrl = await sigDecoder.resolveFormatUrl(format, playerScriptUrl);
          decipheredFormats.push({ ...format, url: resolvedUrl, _nTransformed: true });
        } catch (e) {
          decipheredFormats.push(format);
        }
        continue;
      }

      if (format.signatureCipher || format.cipher || format.s) {
        const resolvedUrl = await sigDecoder.resolveFormatUrl(format, playerScriptUrl);
        decipheredFormats.push({
          ...format,
          url: resolvedUrl,
          _deciphered: true
        });
      } else {
        decipheredFormats.push(format);
      }
    } catch (error) {
      decipheredFormats.push(format);
    }
  }

  return decipheredFormats;
}

// Get video info using specified client or auto-select best client
// Priority: ANDROID_VR (no throttle) > WEB (full formats) > ANDROID (fallback)
async function getInfo(videoId, options = {}) {
  let data;
  let clientUsed = 'ANDROID_VR';
  const preferredClient = options.client || 'auto'; // 'auto', 'WEB', 'ANDROID_VR', 'ANDROID'

  const webpageData = await fetchWebpageData(videoId);

  // Try clients in order based on preference
  const tryClient = async (client) => {
    switch (client) {
      case 'WEB':
        return await requestInnerTubeWeb(videoId, webpageData);
      case 'ANDROID_VR':
        return await requestInnerTubeVR(videoId, webpageData);
      case 'ANDROID':
        return await requestInnerTube(videoId, webpageData);
      case 'IOS':
        return await requestInnerTubeIOS(videoId, webpageData);
      default:
        return null;
    }
  };

  if (preferredClient !== 'auto') {
    // Use specified client
    try {
      data = await tryClient(preferredClient);
      clientUsed = preferredClient;
      if (data?.playabilityStatus?.status !== 'OK') {
        throw new Error(data?.playabilityStatus?.reason || 'Client failed');
      }
    } catch (e) {
      // Fallback to ANDROID_VR then ANDROID
      try {
        data = await tryClient('ANDROID_VR');
        clientUsed = 'ANDROID_VR';
      } catch (e2) {
        data = await tryClient('ANDROID');
        clientUsed = 'ANDROID';
      }
    }
  } else {
    // Auto mode: try ANDROID_VR first (best for downloads), then WEB, then ANDROID
    try {
      data = await requestInnerTubeVR(videoId, webpageData);
      clientUsed = 'ANDROID_VR';

      if (data.playabilityStatus?.status !== 'OK') {
        // Try WEB client
        data = await requestInnerTubeWeb(videoId, webpageData);
        clientUsed = 'WEB';

        if (data.playabilityStatus?.status !== 'OK') {
          // Fallback to ANDROID
          data = await requestInnerTube(videoId, webpageData);
          clientUsed = 'ANDROID';
        }
      }
    } catch (e) {
      // Try WEB then ANDROID on error
      try {
        data = await requestInnerTubeWeb(videoId, webpageData);
        clientUsed = 'WEB';
        if (data?.playabilityStatus?.status !== 'OK') {
          throw new Error('WEB failed');
        }
      } catch (e2) {
        data = await requestInnerTube(videoId, webpageData);
        clientUsed = 'ANDROID';
      }
    }
  }

  // Check playability
  if (data.playabilityStatus?.status !== 'OK') {
    const error = new Error(data.playabilityStatus?.reason || 'Video is unavailable');
    error.status = data.playabilityStatus?.status;
    throw error;
  }

  // Check streaming data
  if (!data.streamingData) {
    throw new Error('No streaming data available');
  }

  // Combine all formats
  let formats = [
    ...(data.streamingData.formats || []),
    ...(data.streamingData.adaptiveFormats || [])
  ];

  // Add metadata to formats
  formats = formats.map(format => ({
    ...format,
    hasVideo: format.mimeType ? format.mimeType.includes('video') : false,
    hasAudio: format.mimeType ? format.mimeType.includes('audio') : false,
    container: format.mimeType ? format.mimeType.split(';')[0].split('/')[1] : 'unknown',
    _client: clientUsed
  }));

  // Check if any formats need deciphering
  const needsDecipher = (f) => {
    if (f.signatureCipher || f.cipher || f.s) return true;
    if (f.url) {
      try {
        const url = new URL(f.url);
        const sig = url.searchParams.get('sig') || url.searchParams.get('signature');
        if (sig && sig.length >= 80) return true;
      } catch (e) {}
    }
    return false;
  };

  const directFormats = formats.filter(f => f.url && !needsDecipher(f));
  const cipherFormats = formats.filter(f => needsDecipher(f) || !f.url);

  let playerScriptUrl = null;

  if (cipherFormats.length > 0) {
    try {
      playerScriptUrl = await sigDecoder.getCachedPlayerScript();
      const decipheredCipherFormats = await decipherFormats(cipherFormats, playerScriptUrl);
      formats = [...directFormats, ...decipheredCipherFormats];
    } catch (error) {
      formats = directFormats;
    }
  }

  return {
    success: true,
    videoDetails: data.videoDetails,
    formats: formats,
    html5player: playerScriptUrl,
    _innerTube: {
      client: clientUsed,
      directUrls: directFormats.length,
      needsCipher: cipherFormats.length,
      allDeciphered: cipherFormats.length > 0 && formats.length > directFormats.length,
      playerScriptUrl: playerScriptUrl
    }
  };
}

// Get info from multiple clients and merge formats for best results
async function getInfoMultiClient(videoId, options = {}) {
  const webpageData = await fetchWebpageData(videoId);
  const results = {};
  const errors = [];

  // Try all clients in parallel
  const clients = ['ANDROID_VR', 'IOS', 'WEB', 'ANDROID'];

  await Promise.all(clients.map(async (client) => {
    try {
      let data;
      switch (client) {
        case 'WEB':
          data = await requestInnerTubeWeb(videoId, webpageData);
          break;
        case 'ANDROID_VR':
          data = await requestInnerTubeVR(videoId, webpageData);
          break;
        case 'IOS':
          data = await requestInnerTubeIOS(videoId, webpageData);
          break;
        case 'ANDROID':
          data = await requestInnerTube(videoId, webpageData);
          break;
      }
      if (data?.playabilityStatus?.status === 'OK' && data?.streamingData) {
        results[client] = data;
      }
    } catch (e) {
      errors.push({ client, error: e.message });
    }
  }));

  if (Object.keys(results).length === 0) {
    throw new Error('All clients failed: ' + errors.map(e => `${e.client}: ${e.error}`).join(', '));
  }

  // Use ANDROID_VR as primary (best for downloads)
  const primaryClient = results['ANDROID_VR'] ? 'ANDROID_VR' :
                        results['WEB'] ? 'WEB' : 'ANDROID';
  const primaryData = results[primaryClient];

  // Merge formats from all clients
  const formatMap = new Map();

  for (const [client, data] of Object.entries(results)) {
    const allFormats = [
      ...(data.streamingData.formats || []),
      ...(data.streamingData.adaptiveFormats || [])
    ];

    for (const format of allFormats) {
      const key = format.itag;
      const existing = formatMap.get(key);

      // Prefer format with direct URL
      if (!existing || (!existing.url && format.url) ||
          (existing.signatureCipher && !format.signatureCipher && format.url)) {
        formatMap.set(key, {
          ...format,
          _client: client,
          hasVideo: format.mimeType ? format.mimeType.includes('video') : false,
          hasAudio: format.mimeType ? format.mimeType.includes('audio') : false,
          container: format.mimeType ? format.mimeType.split(';')[0].split('/')[1] : 'unknown',
        });
      }
    }
  }

  let formats = Array.from(formatMap.values());

  // Decipher formats that need it
  const needsDecipher = (f) => {
    if (f.signatureCipher || f.cipher || f.s) return true;
    return false;
  };

  const directFormats = formats.filter(f => f.url && !needsDecipher(f));
  const cipherFormats = formats.filter(f => needsDecipher(f) || !f.url);

  let playerScriptUrl = null;

  if (cipherFormats.length > 0) {
    try {
      playerScriptUrl = await sigDecoder.getCachedPlayerScript();
      const decipheredCipherFormats = await decipherFormats(cipherFormats, playerScriptUrl);
      formats = [...directFormats, ...decipheredCipherFormats.filter(f => f.url)];
    } catch (error) {
      formats = directFormats;
    }
  }

  return {
    success: true,
    videoDetails: primaryData.videoDetails,
    formats: formats,
    html5player: playerScriptUrl,
    _innerTube: {
      primaryClient,
      clientsUsed: Object.keys(results),
      formatsByClient: Object.fromEntries(
        Object.entries(results).map(([c, d]) => [
          c,
          (d.streamingData.formats?.length || 0) + (d.streamingData.adaptiveFormats?.length || 0)
        ])
      ),
      totalFormats: formats.length,
      formatsWithUrl: formats.filter(f => f.url).length
    }
  };
}

module.exports = {
  getInfo,
  getInfoMultiClient,
  requestInnerTube,
  requestInnerTubeVR,
  requestInnerTubeWeb,
  fetchWebpageData,
  decipherFormats,
  WEB_CLIENT,
  ANDROID_CLIENT,
  ANDROID_VR_CLIENT
};
