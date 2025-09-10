/**
 * Anti-Bot Detection System for ytdl-core
 * Helps bypass YouTube's "Sign in to confirm you're not a bot" detection
 */

const os = require('os');
const crypto = require('crypto');

class AntiBotManager {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.requestCount = 0;
    this.lastRotation = Date.now();
    this.currentUserAgent = null;
    this.currentFingerprint = null;
  }

  /**
   * Get realistic browser User-Agent strings (updated 2025)
   */
  getBrowserUserAgents() {
    const chromeVersions = ['131.0.0.0', '130.0.0.0', '129.0.0.0', '128.0.0.0'];
    const edgeVersions = ['131.0.0.0', '130.0.0.0', '129.0.0.0'];
    const firefoxVersions = ['133.0', '132.0', '131.0', '130.0'];
    
    const platform = this.getPlatformInfo();
    
    return [
      // Chrome (most common)
      ...chromeVersions.map(v => 
        `Mozilla/5.0 (${platform.windows}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`
      ),
      ...chromeVersions.map(v => 
        `Mozilla/5.0 (${platform.mac}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`
      ),
      
      // Edge
      ...edgeVersions.map(v => 
        `Mozilla/5.0 (${platform.windows}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36 Edg/${v}`
      ),
      
      // Firefox
      ...firefoxVersions.map(v => 
        `Mozilla/5.0 (${platform.windows}; rv:${v}) Gecko/20100101 Firefox/${v}`
      ),
      ...firefoxVersions.map(v => 
        `Mozilla/5.0 (${platform.mac}) Gecko/20100101 Firefox/${v}`
      )
    ];
  }

  /**
   * Get platform-specific info
   */
  getPlatformInfo() {
    return {
      windows: 'Windows NT 10.0; Win64; x64',
      mac: 'Macintosh; Intel Mac OS X 10_15_7',
      linux: 'X11; Linux x86_64'
    };
  }

  /**
   * Get current User-Agent (with rotation)
   */
  getUserAgent() {
    const now = Date.now();
    const rotationInterval = 5 * 60 * 1000; // Rotate every 5 minutes
    
    if (!this.currentUserAgent || (now - this.lastRotation) > rotationInterval) {
      const userAgents = this.getBrowserUserAgents();
      this.currentUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      this.lastRotation = now;
    }
    
    return this.currentUserAgent;
  }

  /**
   * Generate realistic browser headers
   */
  getBrowserHeaders(url = 'https://www.youtube.com') {
    const urlObj = new URL(url);
    const isYoutube = urlObj.hostname.includes('youtube.com');
    
    const baseHeaders = {
      'User-Agent': this.getUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Pragma': 'no-cache'
    };

    if (isYoutube) {
      // YouTube-specific headers
      Object.assign(baseHeaders, {
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'DNT': '1',
        'X-Client-Data': this.generateClientData(),
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': '2.20241210.01.00'
      });
    }

    return baseHeaders;
  }

  /**
   * Generate realistic client data for YouTube
   */
  generateClientData() {
    const variations = [
      'CIW2yQEIorbBAg==',
      'CIi2yQEIorbBAg==', 
      'CKq2yQEIorbBAg==',
      'CLG2yQEIorbBAg==',
      'CMS2yQEIorbBAg=='
    ];
    return variations[Math.floor(Math.random() * variations.length)];
  }

  /**
   * Generate session ID for consistency
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get visitor data for YouTube API requests
   */
  getVisitorData() {
    const variations = [
      'CgtBcjQ2SklNQnhOSSjWvr2qBg%3D%3D',
      'CgtYUjVDVElKTGNrcyjxsr2qBg%3D%3D',
      'CgtTV1ZVWklCZE9hSSjDrr2qBg%3D%3D',
      'CgtSY0s2VE5MWUJRTSi3s72qBg%3D%3D'
    ];
    return variations[Math.floor(Math.random() * variations.length)];
  }

  /**
   * Add timing delays to mimic human behavior
   */
  async addHumanDelay() {
    const minDelay = 100;
    const maxDelay = 1000;
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Apply anti-bot measures to request options
   */
  applyAntiBotHeaders(options, url) {
    this.requestCount++;
    
    const headers = this.getBrowserHeaders(url);
    
    // Merge with existing headers, prioritizing anti-bot headers
    options.requestOptions = options.requestOptions || {};
    options.requestOptions.headers = {
      ...headers,
      ...options.requestOptions.headers
    };

    // Add session consistency
    if (!options.requestOptions.headers['X-Session-Id']) {
      options.requestOptions.headers['X-Session-Id'] = this.sessionId;
    }

    // Add request fingerprinting resistance
    this.addFingerprintResistance(options);

    return options;
  }

  /**
   * Add fingerprinting resistance
   */
  addFingerprintResistance(options) {
    // Randomize request timing
    const jitter = Math.floor(Math.random() * 50);
    if (options.requestOptions.timeout) {
      options.requestOptions.timeout += jitter;
    }

    // Vary connection behavior slightly
    if (!options.requestOptions.keepAlive) {
      options.requestOptions.keepAlive = Math.random() > 0.3;
    }
  }

  /**
   * Handle bot detection response
   */
  handleBotDetection(error, url) {
    const errorMessage = error.message || error.toString();
    const isBotDetection = 
      errorMessage.includes('Sign in to confirm') ||
      errorMessage.includes('not a bot') ||
      errorMessage.includes('automated') ||
      errorMessage.includes('captcha') ||
      errorMessage.includes('unusual traffic');

    if (isBotDetection) {
      // Force rotation of User-Agent and headers
      this.currentUserAgent = null;
      this.lastRotation = 0;
      this.sessionId = this.generateSessionId();
      
      return {
        detected: true,
        suggestion: 'Try adding cookies from a real browser session or reducing request frequency'
      };
    }

    return { detected: false };
  }

  /**
   * Get smart retry options after bot detection
   */
  getRetryOptions() {
    return {
      retries: 3,
      retryDelay: 2000 + Math.random() * 3000, // 2-5 seconds
      backoffFactor: 1.5,
      maxRetryDelay: 30000
    };
  }

  /**
   * Enhanced request wrapper with anti-bot measures
   */
  async makeRequest(url, options = {}) {
    // Apply anti-bot headers
    this.applyAntiBotHeaders(options, url);
    
    // Add human-like delay
    await this.addHumanDelay();
    
    try {
      const utils = require('./utils');
      return await utils.request(url, options);
    } catch (error) {
      const detection = this.handleBotDetection(error, url);
      
      if (detection.detected) {
        // Bot detection handled silently, allow retry with new headers
        throw new Error(`Bot detection: ${detection.suggestion}`);
      }
      
      throw error;
    }
  }

  /**
   * Get anti-bot status and recommendations
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      requestCount: this.requestCount,
      currentUserAgent: this.currentUserAgent ? this.currentUserAgent.split(' ')[0] + '...' : 'Not set',
      lastRotation: new Date(this.lastRotation).toLocaleTimeString(),
      recommendations: [
        'Use ytdl.auth.setupWithBrowser() for browser cookies',
        'Limit concurrent requests to 2-3 per second',
        'Add delays between video requests',
        'Rotate User-Agents automatically (built-in)',
        'Use different IP addresses if possible'
      ]
    };
  }
}

// Global instance
const globalAntiBotManager = new AntiBotManager();

module.exports = {
  AntiBotManager,
  antiBotManager: globalAntiBotManager
};