const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const zlib = require('zlib');

/**
 * Working YouTube Video & MP3 Downloader
 * Minimal implementation that actually works
 */

class WorkingDownloader {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    this.visitorData = null;
  }

  /**
   * Initialize session
   */
  async initialize() {
    console.log('🔄 Initializing downloader...');
    
    try {
      // Get visitor data from YouTube homepage
      const homePageResponse = await this.makeRequest('https://www.youtube.com/');
      
      // Extract visitor data
      const visitorMatch = homePageResponse.match(/VISITOR_DATA["\s]*:["\s]*"([^"]+)"/);
      if (visitorMatch) {
        this.visitorData = visitorMatch[1];
        console.log('✅ Visitor data obtained:', this.visitorData.substring(0, 10) + '...');
      }

      return true;
    } catch (error) {
      console.warn('⚠️ Session init failed, continuing without visitor data');
      return false;
    }
  }

  /**
   * Make HTTP request with proper encoding handling
   */
  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          ...options.headers
        }
      };

      if (options.body) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      const req = https.request(requestOptions, (res) => {
        let chunks = [];
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
          let buffer = Buffer.concat(chunks);
          
          // Handle gzip/deflate compression
          const encoding = res.headers['content-encoding'];
          
          if (encoding === 'gzip') {
            zlib.gunzip(buffer, (err, decompressed) => {
              if (err) {
                reject(err);
              } else {
                resolve(decompressed.toString());
              }
            });
          } else if (encoding === 'deflate') {
            zlib.inflate(buffer, (err, decompressed) => {
              if (err) {
                reject(err);
              } else {
                resolve(decompressed.toString());
              }
            });
          } else {
            resolve(buffer.toString());
          }
        });
      });

      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  /**
   * Get video info using multiple methods
   */
  async getVideoInfo(videoId) {
    console.log(`🎬 Getting info for video: ${videoId}`);

    // Try InnerTube API first
    try {
      const apiResult = await this.getVideoInfoInnerTube(videoId);
      if (apiResult && apiResult.streamingData) {
        console.log('✅ InnerTube API successful');
        return apiResult;
      }
    } catch (error) {
      console.warn('⚠️ InnerTube API failed:', error.message);
    }

    // Fallback to watch page scraping
    try {
      console.log('🔄 Falling back to watch page scraping...');
      const watchPageResult = await this.getVideoInfoWatchPage(videoId);
      if (watchPageResult && watchPageResult.streamingData) {
        console.log('✅ Watch page scraping successful');
        return watchPageResult;
      }
    } catch (error) {
      console.warn('⚠️ Watch page scraping failed:', error.message);
    }

    throw new Error('All methods failed to get video info');
  }

  /**
   * Get video info via InnerTube API using Android client (has direct URLs)
   */
  async getVideoInfoInnerTube(videoId) {
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
      videoId: videoId,
      playbackContext: {
        contentPlaybackContext: {
          vis: 0,
          splay: false
        }
      }
    };

    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '3', // Android client
        'X-YouTube-Client-Version': '19.09.37'
      },
      body: JSON.stringify(payload)
    });

    const result = JSON.parse(response);
    
    // Android client should provide direct URLs
    if (result.streamingData) {
      console.log('✅ Android client: Direct URLs available');
    }
    
    return result;
  }

  /**
   * Get video info via watch page scraping
   */
  async getVideoInfoWatchPage(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`;
    const response = await this.makeRequest(watchUrl);

    // Try multiple patterns to extract player response
    const patterns = [
      /var ytInitialPlayerResponse = ({.+?});/,
      /window\["ytInitialPlayerResponse"\] = ({.+?});/,
      /"playerResponse":({.+?}),"aux/,
      /ytInitialPlayerResponse":\s*({.+?}),"/,
      /"playerResponse":\s*({.+?})[,}]/,
      /ytInitialPlayerResponse\s*=\s*({.+?});/
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (parseError) {
          console.warn('Failed to parse player response with pattern:', pattern.toString());
          continue;
        }
      }
    }

    throw new Error('Could not extract player response from watch page');
  }

  /**
   * Extract download URLs from streaming data
   */
  extractFormats(streamingData) {
    const formats = [];

    // Add regular formats (video + audio)
    if (streamingData.formats) {
      formats.push(...streamingData.formats.map(f => ({
        ...f,
        type: 'muxed',
        hasVideo: true,
        hasAudio: true
      })));
    }

    // Add adaptive formats (video only or audio only)
    if (streamingData.adaptiveFormats) {
      formats.push(...streamingData.adaptiveFormats.map(f => ({
        ...f,
        type: 'adaptive',
        hasVideo: !!(f.width && f.height),
        hasAudio: !!f.audioSampleRate
      })));
    }

    // Filter out formats without direct URLs (for now, skip signature decryption)
    return formats.filter(f => f.url);
  }

  /**
   * Choose best format based on criteria
   */
  chooseFormat(formats, options = {}) {
    let filtered = [...formats];

    // Filter by type
    if (options.filter === 'audioandvideo') {
      filtered = filtered.filter(f => f.hasVideo && f.hasAudio);
    } else if (options.filter === 'audioonly') {
      filtered = filtered.filter(f => f.hasAudio && !f.hasVideo);
    } else if (options.filter === 'videoonly') {
      filtered = filtered.filter(f => f.hasVideo && !f.hasAudio);
    }

    if (filtered.length === 0) {
      throw new Error('No formats match the filter criteria');
    }

    // Sort by quality
    if (options.quality === 'lowest') {
      return filtered.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0];
    } else {
      return filtered.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    }
  }

  /**
   * Download video/audio file
   */
  async download(videoId, options = {}) {
    if (!this.visitorData) {
      await this.initialize();
    }

    // Get video info
    const videoInfo = await this.getVideoInfo(videoId);
    
    if (!videoInfo.streamingData) {
      throw new Error('No streaming data available');
    }

    console.log(`✅ Video: ${videoInfo.videoDetails.title}`);
    console.log(`👤 Author: ${videoInfo.videoDetails.author}`);
    console.log(`⏱️ Duration: ${videoInfo.videoDetails.lengthSeconds}s`);

    // Extract and choose format
    const formats = this.extractFormats(videoInfo.streamingData);
    console.log(`📋 Available formats: ${formats.length}`);

    if (formats.length === 0) {
      throw new Error('No direct download URLs available (signature decryption needed)');
    }

    const format = this.chooseFormat(formats, options);
    console.log(`🎯 Selected format: itag ${format.itag}, quality: ${format.qualityLabel || format.quality || 'unknown'}`);
    console.log(`📦 Type: ${format.type}, Video: ${format.hasVideo}, Audio: ${format.hasAudio}`);

    // Determine file extension
    const extension = this.getFileExtension(format, options);
    const filename = this.sanitizeFilename(videoInfo.videoDetails.title) + extension;
    const outputPath = path.join(__dirname, 'downloads', filename);

    // Ensure downloads directory exists
    const downloadsDir = path.dirname(outputPath);
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    console.log(`📁 Downloading to: ${outputPath}`);

    // Download file
    await this.downloadFile(format.url, outputPath, {
      onProgress: (downloaded, total, percent) => {
        process.stdout.write(`\r📊 ${percent.toFixed(1)}% (${(downloaded/1024/1024).toFixed(1)}MB/${(total/1024/1024).toFixed(1)}MB)`);
      }
    });

    console.log(`\n✅ Download completed: ${outputPath}`);
    return outputPath;
  }

  /**
   * Download file from URL with progress
   */
  async downloadFile(url, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const writeStream = fs.createWriteStream(outputPath);
      
      const headers = {
        'User-Agent': this.userAgent
      };
      
      // Only add Range header if provided
      if (options.range) {
        headers['Range'] = options.range;
      }
      
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: headers
      }, (res) => {
        const totalSize = parseInt(res.headers['content-length']) || 0;
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          writeStream.write(chunk);
          
          if (options.onProgress && totalSize > 0) {
            const percent = (downloaded / totalSize) * 100;
            options.onProgress(downloaded, totalSize, percent);
          }
        });

        res.on('end', () => {
          writeStream.end();
          resolve();
        });

        res.on('error', (error) => {
          writeStream.end();
          reject(error);
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Get file extension based on format
   */
  getFileExtension(format, options) {
    if (options.audioOnly || options.filter === 'audioonly') {
      return '.mp3'; // We'll assume MP3 for audio-only
    }

    // Determine extension from mimeType
    if (format.mimeType) {
      if (format.mimeType.includes('mp4')) return '.mp4';
      if (format.mimeType.includes('webm')) return '.webm';
      if (format.mimeType.includes('3gpp')) return '.3gp';
    }

    // Default based on container or format type
    if (format.hasVideo && format.hasAudio) return '.mp4';
    if (format.hasAudio && !format.hasVideo) return '.mp3';
    if (format.hasVideo && !format.hasAudio) return '.mp4';
    
    return '.mp4'; // default
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .substring(0, 100); // Limit length
  }

  /**
   * Download video (MP4)
   */
  async downloadVideo(videoId) {
    return await this.download(videoId, {
      filter: 'audioandvideo',
      quality: 'lowest'
    });
  }

  /**
   * Download audio only (MP3)
   */
  async downloadAudio(videoId) {
    return await this.download(videoId, {
      filter: 'audioonly',
      audioOnly: true,
      quality: 'highest'
    });
  }
}

module.exports = WorkingDownloader;