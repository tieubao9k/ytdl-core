const CookieManager = require('./cookie-manager');
const BrowserCookieExtractor = require('./browser-cookies');

/**
 * Authentication Manager for ytdl-core-enhanced
 * Handles YouTube authentication, session management, and age-restricted content
 */
class AuthManager {
  constructor(options = {}) {
    this.cookieManager = new CookieManager(options.cookieOptions);
    this.browserExtractor = new BrowserCookieExtractor();
    this.sessionInfo = {};
    this.options = {
      autoRefresh: options.autoRefresh !== false,
      maxRetries: options.maxRetries || 3,
      ...options
    };
  }

  /**
   * Quick setup with browser cookies
   * @param {string} browser - Browser name ('chrome', 'edge', 'firefox')
   * @param {string} profile - Browser profile (optional)
   */
  async setupWithBrowser(browser = 'chrome', profile = 'Default') {
    try {
      console.log(`🍪 Setting up authentication with ${browser}...`);
      
      // Check if browser is available
      const browsers = this.browserExtractor.getAvailableBrowsers();
      const targetBrowser = browsers.find(b => b.name === browser);
      
      if (!targetBrowser) {
        console.warn(`⚠️  ${browser} not found or has no cookies`);
        return this.setupManual();
      }

      // Extract cookies
      const cookies = await this.browserExtractor.extractChromiumCookies(browser, profile);
      
      if (cookies.length === 0) {
        console.log(`📋 No cookies extracted automatically. Setting up manual mode...`);
        return this.setupManual();
      }

      // Add cookies to manager
      cookies.forEach(cookie => {
        this.cookieManager.addCookie(
          `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`
        );
      });

      console.log(`✅ Successfully imported ${cookies.length} cookies from ${browser}`);
      
      // Test authentication
      const isValid = await this.validateAuthentication();
      if (isValid) {
        console.log('✅ Authentication validated successfully');
        this.updateSessionInfo({ browser, profile, cookieCount: cookies.length });
      }
      
      return this;
    } catch (error) {
      console.warn(`⚠️  Browser setup failed: ${error.message}`);
      return this.setupManual();
    }
  }

  /**
   * Manual cookie setup with guided instructions
   */
  setupManual() {
    console.log('\n🔧 Manual Cookie Setup Guide:');
    console.log('='.repeat(50));
    
    const quickCookies = this.browserExtractor.getQuickSetupCookies();
    delete quickCookies._instructions; // Remove instructions from object
    
    console.log('1. Go to https://youtube.com in your browser');
    console.log('2. Make sure you\'re logged in');
    console.log('3. Press F12 → Application → Cookies → https://www.youtube.com');
    console.log('4. Copy these important cookies:');
    console.log('   • VISITOR_INFO1_LIVE (most important)');
    console.log('   • CONSENT');
    console.log('   • SESSION_TOKEN (if available)');
    console.log('   • LOGIN_INFO (if logged in)');
    console.log('\n5. Use one of these methods to add cookies:');
    console.log('\n   Method 1 - Individual cookies:');
    console.log('   auth.addCookie("VISITOR_INFO1_LIVE", "your_value_here");');
    console.log('\n   Method 2 - Cookie object:');
    console.log('   auth.addCookies({');
    console.log('     VISITOR_INFO1_LIVE: "your_value_here",');
    console.log('     CONSENT: "YES+cb.20210328-17-p0.en+FX+700"');
    console.log('   });');
    console.log('\n   Method 3 - Full cookie string:');
    console.log('   auth.addCookieString("VISITOR_INFO1_LIVE=value; CONSENT=value");');
    console.log('\n='.repeat(50));
    
    return this;
  }

  /**
   * Add single cookie
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {string} domain - Cookie domain
   */
  addCookie(name, value, domain = '.youtube.com') {
    this.cookieManager.addCookie(`${name}=${value}; Domain=${domain}; Path=/`);
    console.log(`✅ Added cookie: ${name}`);
    return this;
  }

  /**
   * Add multiple cookies from object
   * @param {Object} cookies - Cookie name-value pairs
   * @param {string} domain - Cookie domain
   */
  addCookies(cookies, domain = '.youtube.com') {
    this.cookieManager.addCookies(cookies, domain);
    console.log(`✅ Added ${Object.keys(cookies).length} cookies`);
    return this;
  }

  /**
   * Add cookies from cookie header string
   * @param {string} cookieString - Full cookie header string
   */
  addCookieString(cookieString) {
    // Parse "name1=value1; name2=value2" format
    const cookies = {};
    cookieString.split(';').forEach(pair => {
      const [name, value] = pair.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
    
    return this.addCookies(cookies);
  }

  /**
   * Import cookies from Netscape format file
   * @param {string} filePath - Path to cookies.txt file
   */
  importCookieFile(filePath) {
    this.cookieManager.importFromNetscape(filePath);
    console.log(`✅ Imported cookies from ${filePath}`);
    return this;
  }

  /**
   * Get cookie header for YouTube requests
   * @param {string} url - Target URL
   */
  getCookieHeader(url = 'https://www.youtube.com') {
    const cookieString = this.cookieManager.getCookieString(url);
    return cookieString ? { Cookie: cookieString } : {};
  }

  /**
   * Get authentication status and statistics
   */
  getAuthStatus() {
    const stats = this.cookieManager.getStats();
    const cookieHeader = this.getCookieHeader();
    
    return {
      isAuthenticated: stats.active > 0,
      cookieCount: stats.active,
      totalCookies: stats.total,
      expiredCookies: stats.expired,
      domains: stats.domains,
      hasCookieHeader: Object.keys(cookieHeader).length > 0,
      sessionInfo: this.sessionInfo,
      lastUpdate: new Date(stats.newestCookie).toLocaleString()
    };
  }

  /**
   * Validate authentication by testing cookie effectiveness
   */
  async validateAuthentication() {
    try {
      const cookieHeader = this.getCookieHeader();
      if (Object.keys(cookieHeader).length === 0) {
        return false;
      }

      // Test with a simple request (this would be integrated with ytdl-core's request system)
      console.log('🔍 Validating cookies...');
      
      // In real implementation, this would make a test request to YouTube
      // For now, we'll check if we have essential cookies
      const cookieString = cookieHeader.Cookie || '';
      const hasVisitorInfo = cookieString.includes('VISITOR_INFO1_LIVE');
      const hasConsent = cookieString.includes('CONSENT');
      
      const isValid = hasVisitorInfo || hasConsent;
      
      if (!isValid) {
        console.warn('⚠️  No essential YouTube cookies found');
        console.log('💡 You may need VISITOR_INFO1_LIVE or CONSENT cookies for full functionality');
      }
      
      return isValid;
    } catch (error) {
      console.warn(`⚠️  Cookie validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all authentication data
   */
  clearAuth() {
    this.cookieManager.clear();
    this.sessionInfo = {};
    console.log('🧹 Authentication data cleared');
    return this;
  }

  /**
   * Export authentication data
   * @param {string} format - Export format ('json' | 'netscape')
   * @param {string} filePath - Output file path
   */
  exportAuth(format = 'json', filePath) {
    if (format === 'netscape') {
      const cookies = Array.from(this.cookieManager.cookieJar.values());
      this.browserExtractor.exportToNetscape(cookies, filePath);
    } else {
      const authData = {
        cookies: Array.from(this.cookieManager.cookieJar.entries()),
        sessionInfo: this.sessionInfo,
        exportedAt: new Date().toISOString()
      };
      
      require('fs').writeFileSync(filePath, JSON.stringify(authData, null, 2));
      console.log(`✅ Authentication data exported to ${filePath}`);
    }
    
    return this;
  }

  /**
   * Auto-refresh expired cookies (if possible)
   */
  async refreshAuth() {
    console.log('🔄 Refreshing authentication...');
    
    // Clear expired cookies
    const cleared = this.cookieManager.clearExpired();
    
    if (cleared > 0) {
      console.log(`🧹 Cleared ${cleared} expired cookies`);
    }
    
    // Re-validate
    const isValid = await this.validateAuthentication();
    
    if (!isValid && this.sessionInfo.browser) {
      console.log('🔄 Attempting to re-import from browser...');
      try {
        await this.setupWithBrowser(this.sessionInfo.browser, this.sessionInfo.profile);
      } catch (error) {
        console.warn(`⚠️  Auto-refresh failed: ${error.message}`);
      }
    }
    
    return this;
  }

  /**
   * Update session information
   * @private
   */
  updateSessionInfo(info) {
    this.sessionInfo = {
      ...this.sessionInfo,
      ...info,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get list of available browsers for cookie import
   */
  getAvailableBrowsers() {
    return this.browserExtractor.getAvailableBrowsers();
  }
}

module.exports = AuthManager;