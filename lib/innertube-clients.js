const https = require('https');
const sigDecoder = require('./sig-decoder');

// ANDROID client config - Only client that works reliably with restricted videos
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

// Request YouTube InnerTube API with ANDROID client
async function requestInnerTube(videoId, options = {}) {
  const apiUrl = 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false&t=' +
                 generateNonce(12) + '&id=' + videoId;

  const requestBody = JSON.stringify({
    videoId: videoId,
    cpn: generateNonce(16),
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: ANDROID_CLIENT.clientName,
        clientVersion: ANDROID_CLIENT.clientVersion,
        platform: ANDROID_CLIENT.platform,
        osName: ANDROID_CLIENT.osName,
        osVersion: ANDROID_CLIENT.osVersion,
        hl: ANDROID_CLIENT.hl,
        gl: ANDROID_CLIENT.gl,
        utcOffsetMinutes: ANDROID_CLIENT.utcOffsetMinutes,
        timeZone: ANDROID_CLIENT.timeZone
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true
      },
      user: {
        lockedSafetyMode: false
      }
    }
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);

    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_CLIENT.userAgent,
        'Content-Length': Buffer.byteLength(requestBody),
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        'X-Goog-Api-Format-Version': '2',
        'X-Goog-Visitor-Id': generateNonce(11),
        'X-YouTube-Client-Name': ANDROID_CLIENT.clientId,
        'X-YouTube-Client-Version': ANDROID_CLIENT.clientVersion,
        ...(options.headers || {})
      }
    };

    const req = https.request(reqOptions, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
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
      // If format has direct URL and doesn't need deciphering, use it
      if (format.url && !format.signatureCipher && !format.cipher) {
        decipheredFormats.push(format);
        continue;
      }

      // If format needs deciphering
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

// Get video info using ANDROID client
async function getInfo(videoId, options = {}) {
  try {
    const data = await requestInnerTube(videoId, options);

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
      container: format.mimeType ? format.mimeType.split(';')[0].split('/')[1] : 'unknown'
    }));

    // Check if any formats need deciphering
    const needsDecipher = (f) => {
      if (f.signatureCipher || f.cipher || f.s) return true;
      if (f.url) {
        try {
          const url = new URL(f.url);
          const sig = url.searchParams.get('sig') || url.searchParams.get('signature');
          // Encrypted signatures are typically 80-150 chars
          if (sig && sig.length >= 80) return true;
        } catch (e) {}
      }
      return false;
    };

    const directFormats = formats.filter(f => f.url && !needsDecipher(f));
    const cipherFormats = formats.filter(f => needsDecipher(f) || !f.url);

    let playerScriptUrl = null;

    // Decipher encrypted formats if needed
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
        client: 'ANDROID',
        directUrls: directFormats.length,
        needsCipher: cipherFormats.length,
        allDeciphered: cipherFormats.length > 0 && formats.length > directFormats.length,
        playerScriptUrl: playerScriptUrl
      }
    };

  } catch (error) {
    error.videoId = videoId;
    throw error;
  }
}

module.exports = {
  getInfo,
  requestInnerTube,
  ANDROID_CLIENT
};
