const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');

/**
 * Fast info retrieval using Android client
 */

class FastInfoRetriever {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    this.visitorData = null;
    
    // Connection pooling for performance
    this.httpsAgent = new https.Agent({ 
      keepAlive: true, 
      maxSockets: 10,
      timeout: 60000
    });
  }

  /**
   * Initialize session with visitor data
   */
  async initialize() {
    if (this.visitorData) return;
    
    try {
      const response = await this.makeRequest('https://www.youtube.com/');
      const visitorMatch = response.match(/VISITOR_DATA["\s]*:["\s]*"([^"]+)"/);
      if (visitorMatch) {
        this.visitorData = visitorMatch[1];
      }
    } catch (error) {
      // Continue without visitor data
    }
  }

  /**
   * Optimized HTTP request with compression
   */
  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const agent = isHttps ? this.httpsAgent : this.httpAgent;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        agent: agent,
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          ...options.headers
        }
      };

      if (options.body) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      const client = isHttps ? https : http;
      const req = client.request(requestOptions, (res) => {
        let chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          let buffer = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'];
          
          if (encoding === 'gzip') {
            zlib.gunzip(buffer, (err, decompressed) => {
              if (err) reject(err);
              else resolve(decompressed.toString());
            });
          } else if (encoding === 'deflate') {
            zlib.inflate(buffer, (err, decompressed) => {
              if (err) reject(err);
              else resolve(decompressed.toString());
            });
          } else if (encoding === 'br') {
            zlib.brotliDecompress(buffer, (err, decompressed) => {
              if (err) reject(err);
              else resolve(decompressed.toString());
            });
          } else {
            resolve(buffer.toString());
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => reject(new Error('Request timeout')));
      
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  /**
   * Get video info using Android client (bypasses signature encryption)
   */
  async getFastVideoInfo(videoId) {
    if (!this.visitorData) await this.initialize();

    const url = `https://www.youtube.com/youtubei/v1/player?key=${this.apiKey}`;
    
    const payload = {
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.09.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
          visitorData: this.visitorData
        }
      },
      videoId: videoId
    };

    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37'
      },
      body: JSON.stringify(payload)
    });

    const result = JSON.parse(response);
    return result;
  }

  /**
   * Cleanup connections
   */
  destroy() {
    if (this.httpsAgent) this.httpsAgent.destroy();
  }
}

module.exports = FastInfoRetriever;