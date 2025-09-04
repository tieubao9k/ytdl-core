const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const zlib = require('zlib');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

/**
 * Fast YouTube Downloader với tối ưu hóa tốc độ
 */
class FastDownloader {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    this.visitorData = null;
    
    // Tối ưu hóa connection pool
    this.httpAgent = new http.Agent({ 
      keepAlive: true, 
      maxSockets: 10,
      timeout: 60000
    });
    this.httpsAgent = new https.Agent({ 
      keepAlive: true, 
      maxSockets: 10,
      timeout: 60000
    });
  }

  /**
   * Initialize với connection pooling
   */
  async initialize() {
    if (this.visitorData) return;
    
    console.log('🚀 Initializing fast downloader...');
    
    try {
      const response = await this.makeRequest('https://www.youtube.com/');
      const visitorMatch = response.match(/VISITOR_DATA["\s]*:["\s]*"([^"]+)"/);
      if (visitorMatch) {
        this.visitorData = visitorMatch[1];
        console.log('✅ Session ready for fast downloads');
      }
    } catch (error) {
      console.warn('⚠️ Using without session optimization');
    }
  }

  /**
   * Optimized HTTP request với connection reuse
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
   * Get video info với Android client (fastest)
   */
  async getVideoInfo(videoId) {
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

    return JSON.parse(response);
  }

  /**
   * Choose fastest/best quality format
   */
  chooseFastFormat(streamingData, options = {}) {
    const { formats = [], adaptiveFormats = [] } = streamingData;
    let allFormats = [...formats, ...adaptiveFormats];

    // Filter by type
    if (options.filter === 'audioandvideo') {
      allFormats = formats; // Muxed formats are faster (1 request vs 2)
    } else if (options.filter === 'audioonly') {
      allFormats = adaptiveFormats.filter(f => f.audioSampleRate);
    } else if (options.filter === 'videoonly') {
      allFormats = adaptiveFormats.filter(f => f.width);
    }

    // Filter only direct URLs
    allFormats = allFormats.filter(f => f.url);

    if (allFormats.length === 0) {
      throw new Error('No direct download URLs available');
    }

    // Sort by speed preference
    if (options.quality === 'lowest') {
      return allFormats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0];
    } else if (options.quality === 'highest') {
      return allFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    } else {
      // Choose medium quality for balanced speed/quality
      allFormats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      const middleIndex = Math.floor(allFormats.length / 2);
      return allFormats[middleIndex];
    }
  }

  /**
   * Fast download với parallel chunks
   */
  async fastDownload(videoId, options = {}) {
    if (!this.visitorData) await this.initialize();

    console.log(`🎬 Getting video info: ${videoId}`);
    const startTime = Date.now();
    
    const videoInfo = await this.getVideoInfo(videoId);
    console.log(`✅ Video: ${videoInfo.videoDetails.title}`);
    console.log(`⏱️ Info retrieved in: ${Date.now() - startTime}ms`);

    const format = this.chooseFastFormat(videoInfo.streamingData, options);
    console.log(`🎯 Selected format: itag ${format.itag} - ${format.qualityLabel || 'unknown'}`);
    
    const extension = this.getExtension(format, options);
    const filename = this.sanitizeFilename(videoInfo.videoDetails.title) + extension;
    const outputPath = path.join(__dirname, 'downloads', filename);

    // Ensure download directory exists
    const downloadsDir = path.dirname(outputPath);
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    console.log(`📁 Output: ${filename}`);

    // Choose download method based on file size
    const contentLength = parseInt(format.contentLength) || 0;
    
    if (contentLength > 10 * 1024 * 1024 && options.useParallel !== false) { // > 10MB
      console.log(`📥 Using parallel download for ${(contentLength/1024/1024).toFixed(1)}MB file`);
      await this.parallelDownload(format.url, outputPath, contentLength, options);
    } else {
      console.log(`📥 Using single-thread download`);
      await this.singleDownload(format.url, outputPath, options);
    }

    console.log(`✅ Download completed: ${outputPath}`);
    return outputPath;
  }

  /**
   * Single-threaded fast download với optimizations
   */
  async singleDownload(url, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const writeStream = fs.createWriteStream(outputPath);
      const startTime = Date.now();
      
      const headers = {
        'User-Agent': this.userAgent,
        'Connection': 'keep-alive'
      };

      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: headers,
        agent: this.httpsAgent
      }, (res) => {
        const totalSize = parseInt(res.headers['content-length']) || 0;
        let downloaded = 0;
        let lastUpdate = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          writeStream.write(chunk);
          
          const now = Date.now();
          if (now - lastUpdate > 1000) { // Update every second
            const percent = totalSize > 0 ? (downloaded / totalSize * 100) : 0;
            const speed = downloaded / ((now - startTime) / 1000) / 1024; // KB/s
            process.stdout.write(`\r📊 ${percent.toFixed(1)}% (${(downloaded/1024/1024).toFixed(1)}MB) - ${speed.toFixed(0)} KB/s`);
            lastUpdate = now;
          }
        });

        res.on('end', () => {
          writeStream.end();
          const duration = (Date.now() - startTime) / 1000;
          const avgSpeed = (downloaded / 1024) / duration;
          console.log(`\n⚡ Single-thread: ${(downloaded/1024/1024).toFixed(2)}MB in ${duration.toFixed(1)}s (${avgSpeed.toFixed(0)} KB/s)`);
          resolve();
        });

        res.on('error', (error) => {
          writeStream.end();
          reject(error);
        });
      });

      req.on('error', reject);
      req.setTimeout(60000);
      req.end();
    });
  }

  /**
   * Parallel download với multiple chunks
   */
  async parallelDownload(url, outputPath, totalSize, options = {}) {
    const numChunks = options.chunks || 4; // Default 4 parallel connections
    const chunkSize = Math.floor(totalSize / numChunks);
    const chunks = [];
    
    console.log(`🔀 Downloading ${numChunks} chunks in parallel...`);
    const startTime = Date.now();

    // Create chunk download promises
    const downloadPromises = [];
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = i === numChunks - 1 ? totalSize - 1 : (start + chunkSize - 1);
      
      downloadPromises.push(this.downloadChunk(url, start, end, i));
    }

    try {
      const chunkResults = await Promise.all(downloadPromises);
      
      // Combine chunks in order
      console.log('\n🔧 Combining chunks...');
      const writeStream = fs.createWriteStream(outputPath);
      
      for (let i = 0; i < numChunks; i++) {
        const chunkData = chunkResults.find(r => r.index === i);
        if (chunkData) {
          writeStream.write(chunkData.data);
        }
      }
      
      writeStream.end();
      
      const duration = (Date.now() - startTime) / 1000;
      const avgSpeed = (totalSize / 1024) / duration;
      console.log(`⚡ Parallel (${numChunks} chunks): ${(totalSize/1024/1024).toFixed(2)}MB in ${duration.toFixed(1)}s (${avgSpeed.toFixed(0)} KB/s)`);
      
    } catch (error) {
      console.log(`❌ Parallel download failed: ${error.message}`);
      console.log('🔄 Falling back to single-thread download...');
      await this.singleDownload(url, outputPath, options);
    }
  }

  /**
   * Download single chunk
   */
  async downloadChunk(url, start, end, index) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': this.userAgent,
          'Range': `bytes=${start}-${end}`,
          'Connection': 'keep-alive'
        },
        agent: this.httpsAgent
      }, (res) => {
        const chunks = [];
        let downloaded = 0;
        const chunkSize = end - start + 1;
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
          downloaded += chunk.length;
          
          // Show progress for this chunk
          const percent = (downloaded / chunkSize * 100);
          if (percent % 25 < 1) { // Show at 25%, 50%, 75%, 100%
            process.stdout.write(`\rChunk ${index + 1}: ${percent.toFixed(0)}% `);
          }
        });

        res.on('end', () => {
          resolve({
            index: index,
            data: Buffer.concat(chunks)
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(30000);
      req.end();
    });
  }

  /**
   * Ultra-fast method - choose best server
   */
  async ultraFastDownload(videoId, options = {}) {
    console.log('⚡ ULTRA FAST MODE');
    
    // Get multiple format options
    const videoInfo = await this.getVideoInfo(videoId);
    const { formats = [], adaptiveFormats = [] } = videoInfo.streamingData;
    
    // Find multiple direct URL formats
    const directFormats = [...formats, ...adaptiveFormats].filter(f => f.url);
    
    if (directFormats.length === 0) {
      throw new Error('No direct URLs available for ultra-fast download');
    }

    // Test server speeds
    console.log(`🔍 Testing ${Math.min(3, directFormats.length)} servers for speed...`);
    const speedTests = [];
    
    for (let i = 0; i < Math.min(3, directFormats.length); i++) {
      speedTests.push(this.testServerSpeed(directFormats[i].url, i));
    }

    const speedResults = await Promise.allSettled(speedTests);
    const validResults = speedResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.speed - a.speed);

    if (validResults.length === 0) {
      throw new Error('All servers failed speed test');
    }

    const fastestFormat = directFormats[validResults[0].index];
    console.log(`🚀 Fastest server: ${validResults[0].speed.toFixed(0)} KB/s (format ${fastestFormat.itag})`);

    // Use the fastest server with optimal settings
    const extension = this.getExtension(fastestFormat, options);
    const filename = this.sanitizeFilename(videoInfo.videoDetails.title) + extension;
    const outputPath = path.join(__dirname, 'downloads', filename);

    await this.singleDownload(fastestFormat.url, outputPath, {
      ...options,
      useOptimizedHeaders: true
    });

    return outputPath;
  }

  /**
   * Test server speed
   */
  async testServerSpeed(url, index) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const urlObj = new URL(url);
      
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': this.userAgent,
          'Range': 'bytes=0-8192' // Test with 8KB
        },
        agent: this.httpsAgent
      }, (res) => {
        let downloaded = 0;
        
        res.on('data', (chunk) => {
          downloaded += chunk.length;
        });

        res.on('end', () => {
          const duration = (Date.now() - startTime) / 1000;
          const speed = (downloaded / 1024) / duration; // KB/s
          resolve({ index, speed, downloaded });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(5000); // 5 second timeout for speed test
      req.end();
    });
  }

  /**
   * Get file extension
   */
  getExtension(format, options) {
    if (options.audioOnly || options.filter === 'audioonly') {
      return '.mp3';
    }
    if (format.mimeType?.includes('mp4')) return '.mp4';
    if (format.mimeType?.includes('webm')) return '.webm';
    return '.mp4';
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  /**
   * Cleanup connections
   */
  destroy() {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}

module.exports = FastDownloader;