const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

/**
 * Advanced Cookie Management System for ytdl-core-enhanced
 * Provides automatic cookie handling, browser import, and session management
 */
class CookieManager {
  constructor(options = {}) {
    this.cookieJar = new Map();
    this.sessionData = {};
    this.options = {
      autoSave: options.autoSave !== false,
      cookieFile: options.cookieFile || path.join(process.cwd(), '.ytdl-cookies.json'),
      domain: options.domain || 'youtube.com',
      ...options
    };
    
    this.loadCookies();
  }

  /**
   * Add cookie from string format
   * @param {string} cookieString - Cookie in "name=value; Domain=.youtube.com" format
   */
  addCookie(cookieString) {
    const cookies = this.parseCookieString(cookieString);
    cookies.forEach(cookie => {
      const key = `${cookie.name}_${cookie.domain}`;
      this.cookieJar.set(key, {
        ...cookie,
        timestamp: Date.now(),
        expires: cookie.expires || Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year default
      });
    });
    
    if (this.options.autoSave) {
      this.saveCookies();
    }
    
    return this;
  }

  /**
   * Add cookies from object
   * @param {Object} cookies - Object with cookie name-value pairs
   * @param {string} domain - Domain for cookies
   */
  addCookies(cookies, domain = this.options.domain) {
    Object.entries(cookies).forEach(([name, value]) => {
      this.addCookie(`${name}=${value}; Domain=${domain}; Path=/`);
    });
    return this;
  }

  /**
   * Import cookies from browser
   * @param {string} browser - Browser name ('chrome', 'firefox', 'edge', 'safari')
   * @param {string} profile - Profile name (optional)
   */
  async importFromBrowser(browser, profile = 'default') {
    try {
      const cookiePath = this.getBrowserCookiePath(browser, profile);
      if (!fs.existsSync(cookiePath)) {
        throw new Error(`Browser cookie file not found: ${cookiePath}`);
      }

      const cookies = await this.extractBrowserCookies(browser, cookiePath);
      cookies.forEach(cookie => {
        if (cookie.domain.includes('youtube.com') || cookie.domain.includes('google.com')) {
          this.addCookie(`${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`);
        }
      });

      console.log(`✅ Imported ${cookies.length} cookies from ${browser}`);
      return this;
    } catch (error) {
      console.warn(`⚠️  Failed to import cookies from ${browser}: ${error.message}`);
      return this;
    }
  }

  /**
   * Import cookies from Netscape format file
   * @param {string} filePath - Path to netscape cookies file
   */
  importFromNetscape(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line && !line.startsWith('#'));
      
      lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 7) {
          const [domain, , path, secure, expires, name, value] = parts;
          this.addCookie(`${name}=${value}; Domain=${domain}; Path=${path}; ${secure === 'TRUE' ? 'Secure;' : ''}`);
        }
      });
      
      console.log(`✅ Imported cookies from ${filePath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to import Netscape cookies: ${error.message}`);
    }
    return this;
  }

  /**
   * Get cookies for YouTube requests
   * @param {string} url - Target URL
   * @returns {string} Cookie header string
   */
  getCookieString(url = 'https://www.youtube.com') {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    const matchingCookies = Array.from(this.cookieJar.values())
      .filter(cookie => {
        // Check domain match
        if (cookie.domain.startsWith('.')) {
          return domain.endsWith(cookie.domain.slice(1));
        }
        return domain === cookie.domain;
      })
      .filter(cookie => {
        // Check expiration
        return !cookie.expires || cookie.expires > Date.now();
      })
      .filter(cookie => {
        // Check path
        return !cookie.path || urlObj.pathname.startsWith(cookie.path);
      })
      .filter(cookie => {
        // Check secure flag
        return !cookie.secure || urlObj.protocol === 'https:';
      });

    return matchingCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }

  /**
   * Clear expired cookies
   */
  clearExpired() {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, cookie] of this.cookieJar.entries()) {
      if (cookie.expires && cookie.expires < now) {
        this.cookieJar.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0 && this.options.autoSave) {
      this.saveCookies();
      console.log(`🧹 Cleared ${cleared} expired cookies`);
    }
    
    return cleared;
  }

  /**
   * Save cookies to file
   */
  saveCookies() {
    try {
      const cookieData = {
        cookies: Array.from(this.cookieJar.entries()).map(([key, cookie]) => ({
          key,
          ...cookie
        })),
        sessionData: this.sessionData,
        timestamp: Date.now()
      };
      
      fs.writeFileSync(this.options.cookieFile, JSON.stringify(cookieData, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save cookies: ${error.message}`);
    }
  }

  /**
   * Load cookies from file
   */
  loadCookies() {
    try {
      if (fs.existsSync(this.options.cookieFile)) {
        const data = JSON.parse(fs.readFileSync(this.options.cookieFile, 'utf8'));
        
        if (data.cookies) {
          data.cookies.forEach(({ key, ...cookie }) => {
            this.cookieJar.set(key, cookie);
          });
        }
        
        if (data.sessionData) {
          this.sessionData = data.sessionData;
        }
        
        this.clearExpired();
      }
    } catch (error) {
      console.warn(`⚠️  Failed to load cookies: ${error.message}`);
    }
  }

  /**
   * Parse cookie string into objects
   * @private
   */
  parseCookieString(cookieString) {
    const cookies = [];
    const parts = cookieString.split(';').map(part => part.trim());
    
    if (parts.length === 0) return cookies;
    
    // First part is name=value
    const [name, value] = parts[0].split('=').map(p => p.trim());
    if (!name || value === undefined) return cookies;
    
    const cookie = { name, value };
    
    // Parse attributes
    for (let i = 1; i < parts.length; i++) {
      const [attr, attrValue] = parts[i].split('=').map(p => p.trim());
      
      switch (attr.toLowerCase()) {
        case 'domain':
          cookie.domain = attrValue;
          break;
        case 'path':
          cookie.path = attrValue;
          break;
        case 'expires':
          cookie.expires = new Date(attrValue).getTime();
          break;
        case 'max-age':
          cookie.expires = Date.now() + parseInt(attrValue) * 1000;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'httponly':
          cookie.httpOnly = true;
          break;
      }
    }
    
    // Default values
    cookie.domain = cookie.domain || '.youtube.com';
    cookie.path = cookie.path || '/';
    
    cookies.push(cookie);
    return cookies;
  }

  /**
   * Get browser cookie file path
   * @private
   */
  getBrowserCookiePath(browser, profile) {
    const os = require('os');
    const platform = os.platform();
    const home = os.homedir();
    
    const paths = {
      win32: {
        chrome: `${home}\\AppData\\Local\\Google\\Chrome\\User Data\\${profile}\\Cookies`,
        edge: `${home}\\AppData\\Local\\Microsoft\\Edge\\User Data\\${profile}\\Cookies`,
        firefox: `${home}\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\*/cookies.sqlite`
      },
      darwin: {
        chrome: `${home}/Library/Application Support/Google/Chrome/${profile}/Cookies`,
        safari: `${home}/Library/Cookies/Cookies.binarycookies`,
        firefox: `${home}/Library/Application Support/Firefox/Profiles/*/cookies.sqlite`
      },
      linux: {
        chrome: `${home}/.config/google-chrome/${profile}/Cookies`,
        firefox: `${home}/.mozilla/firefox/*/cookies.sqlite`
      }
    };
    
    return paths[platform]?.[browser] || null;
  }

  /**
   * Extract cookies from browser database
   * @private
   */
  async extractBrowserCookies(browser, cookiePath) {
    // This is a simplified implementation
    // In real implementation, you'd need sqlite3 or other DB libraries
    console.log(`📁 Browser cookie path: ${cookiePath}`);
    
    // For demo purposes, return empty array
    // Real implementation would use sqlite3 to read Chrome/Edge cookies
    // or parse Firefox cookies.sqlite
    return [];
  }

  /**
   * Get cookie statistics
   */
  getStats() {
    const total = this.cookieJar.size;
    const expired = Array.from(this.cookieJar.values())
      .filter(cookie => cookie.expires && cookie.expires < Date.now()).length;
    
    return {
      total,
      active: total - expired,
      expired,
      domains: [...new Set(Array.from(this.cookieJar.values()).map(c => c.domain))],
      oldestCookie: Math.min(...Array.from(this.cookieJar.values()).map(c => c.timestamp || Date.now())),
      newestCookie: Math.max(...Array.from(this.cookieJar.values()).map(c => c.timestamp || Date.now()))
    };
  }

  /**
   * Get cookie header string for HTTP requests
   * @param {string} url - Target URL
   */
  getCookieHeader(url = 'https://www.youtube.com') {
    const cookieString = this.getCookieString(url);
    return cookieString;
  }

  /**
   * Clear all cookies
   */
  clear() {
    this.cookieJar.clear();
    this.sessionData = {};
    if (this.options.autoSave) {
      this.saveCookies();
    }
    return this;
  }
}

module.exports = CookieManager;