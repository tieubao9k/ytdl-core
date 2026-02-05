/**
 * ANDROID_VR Client - Based on yt-dlp's implementation
 * This client can download adaptive formats (itag 140, etc.) without throttling
 */

const https = require('https');
const zlib = require('zlib');

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

// Fetch YouTube webpage to get cookies and visitor data
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

      // Parse cookies from response
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

        // Extract VISITOR_DATA
        const visitorMatch = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
        const visitorData = visitorMatch ? visitorMatch[1] : '';

        // Extract signatureTimestamp
        const stsMatch = html.match(/(?:signatureTimestamp|sts)\s*:\s*(\d+)/);
        const sts = stsMatch ? parseInt(stsMatch[1]) : 20481;

        resolve({ cookies, visitorData, sts });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Request player API with ANDROID_VR client
async function requestPlayerAPI(videoId, webpageData) {
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

// Main function to get video info using ANDROID_VR client
async function getInfo(videoId) {
  // Step 1: Fetch webpage to get cookies and visitor data
  const webpageData = await fetchWebpageData(videoId);

  // Step 2: Call player API
  const playerResponse = await requestPlayerAPI(videoId, webpageData);

  if (playerResponse.playabilityStatus?.status !== 'OK') {
    throw new Error(playerResponse.playabilityStatus?.reason || 'Video unavailable');
  }

  // Combine formats
  const formats = [
    ...(playerResponse.streamingData?.formats || []),
    ...(playerResponse.streamingData?.adaptiveFormats || [])
  ];

  return {
    videoDetails: playerResponse.videoDetails,
    formats,
    streamingData: playerResponse.streamingData,
    _client: 'ANDROID_VR'
  };
}

module.exports = {
  getInfo,
  fetchWebpageData,
  requestPlayerAPI,
  ANDROID_VR_CLIENT
};
