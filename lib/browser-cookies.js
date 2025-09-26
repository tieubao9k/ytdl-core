const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Browser Cookie Extractor
 * Extracts cookies from popular browsers for YouTube authentication
 */
class BrowserCookieExtractor {
  constructor() {
    this.platform = os.platform();
    this.home = os.homedir();
  }

  /**
   * Get all available browser profiles
   */
  getAvailableBrowsers() {
    const browsers = [];
    
    // Check Chrome
    if (this.isBrowserInstalled('chrome')) {
      browsers.push({
        name: 'chrome',
        displayName: 'Google Chrome',
        profiles: this.getChromeProfiles()
      });
    }
    
    // Check Edge
    if (this.isBrowserInstalled('edge')) {
      browsers.push({
        name: 'edge',
        displayName: 'Microsoft Edge',
        profiles: this.getEdgeProfiles()
      });
    }
    
    // Check Firefox
    if (this.isBrowserInstalled('firefox')) {
      browsers.push({
        name: 'firefox',
        displayName: 'Mozilla Firefox',
        profiles: this.getFirefoxProfiles()
      });
    }

    return browsers;
  }

  /**
   * Check if browser is installed
   * @param {string} browser - Browser name
   */
  isBrowserInstalled(browser) {
    try {
      const cookiePath = this.getBrowserPath(browser);
      return fs.existsSync(path.dirname(cookiePath));
    } catch {
      return false;
    }
  }

  /**
   * Get browser data directory path
   */
  getBrowserPath(browser, profile = 'Default') {
    const paths = {
      win32: {
        chrome: path.join(this.home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', profile, 'Network', 'Cookies'),
        edge: path.join(this.home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', profile, 'Network', 'Cookies'),
        firefox: path.join(this.home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
      },
      darwin: {
        chrome: path.join(this.home, 'Library', 'Application Support', 'Google', 'Chrome', profile, 'Cookies'),
        edge: path.join(this.home, 'Library', 'Application Support', 'Microsoft Edge', profile, 'Cookies'),
        firefox: path.join(this.home, 'Library', 'Application Support', 'Firefox', 'Profiles')
      },
      linux: {
        chrome: path.join(this.home, '.config', 'google-chrome', profile, 'Cookies'),
        edge: path.join(this.home, '.config', 'microsoft-edge', profile, 'Cookies'),
        firefox: path.join(this.home, '.mozilla', 'firefox')
      }
    };

    return paths[this.platform]?.[browser];
  }

  /**
   * Get Chrome profiles
   */
  getChromeProfiles() {
    try {
      const userDataPath = path.dirname(this.getBrowserPath('chrome'));
      if (!fs.existsSync(userDataPath)) return ['Default'];
      
      const profiles = fs.readdirSync(userDataPath)
        .filter(dir => dir.startsWith('Profile ') || dir === 'Default')
        .filter(dir => {
          const cookiePath = path.join(userDataPath, dir, 'Network', 'Cookies');
          return fs.existsSync(cookiePath);
        });
      
      return profiles.length > 0 ? profiles : ['Default'];
    } catch {
      return ['Default'];
    }
  }

  /**
   * Get Edge profiles
   */
  getEdgeProfiles() {
    return this.getChromeProfiles(); // Edge uses same structure as Chrome
  }

  /**
   * Get Firefox profiles
   */
  getFirefoxProfiles() {
    try {
      const profilesPath = this.getBrowserPath('firefox');
      if (!fs.existsSync(profilesPath)) return [];
      
      const profiles = fs.readdirSync(profilesPath)
        .filter(dir => {
          const cookiePath = path.join(profilesPath, dir, 'cookies.sqlite');
          return fs.existsSync(cookiePath);
        });
      
      return profiles;
    } catch {
      return [];
    }
  }

  /**
   * Extract YouTube cookies from Chrome/Edge (Chromium-based)
   */
  async extractChromiumCookies(browser, profile = 'Default') {
    const cookiePath = this.getBrowserPath(browser, profile);
    
    if (!fs.existsSync(cookiePath)) {
      throw new Error(`Cookie database not found: ${cookiePath}`);
    }

    try {
      // Try to use sqlite3 if available
      const sqlite3 = require('sqlite3');
      const { Database } = sqlite3;
      
      return new Promise((resolve, reject) => {
        const db = new Database(cookiePath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            reject(new Error(`Cannot open cookie database: ${err.message}`));
            return;
          }
          
          const query = `
            SELECT name, value, host_key, path, expires_utc, is_secure, is_httponly
            FROM cookies 
            WHERE host_key LIKE '%youtube.com' OR host_key LIKE '%google.com'
            ORDER BY creation_utc DESC
          `;
          
          db.all(query, [], (err, rows) => {
            db.close();
            
            if (err) {
              reject(new Error(`Query failed: ${err.message}`));
              return;
            }
            
            const cookies = rows.map(row => ({
              name: row.name,
              value: row.value,
              domain: row.host_key,
              path: row.path,
              expires: row.expires_utc ? new Date(row.expires_utc / 1000000 - 11644473600000) : null,
              secure: row.is_secure === 1,
              httpOnly: row.is_httponly === 1
            }));
            
            resolve(cookies);
          });
        });
      });
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        // Fallback: Manual cookie extraction guide
        return this.provideCookieExtractionGuide(browser, profile);
      }
      throw error;
    }
  }

  /**
   * Provide manual cookie extraction guide when sqlite3 is not available
   */
  provideCookieExtractionGuide(browser, profile) {
    const guide = {
      browser,
      profile,
      message: 'Automatic cookie extraction requires sqlite3 module. Please install it or extract cookies manually.',
      cookiePath: this.getBrowserPath(browser, profile),
      manualSteps: [
        '1. Open your browser and go to youtube.com',
        '2. Press F12 to open Developer Tools',
        '3. Go to Application/Storage tab',
        '4. Click on Cookies > https://www.youtube.com',
        '5. Copy important cookies like: VISITOR_INFO1_LIVE, CONSENT, SESSION_TOKEN',
        '6. Use cookieManager.addCookies() to add them manually'
      ],
      importantCookies: [
        'VISITOR_INFO1_LIVE',
        'CONSENT', 
        'SESSION_TOKEN',
        'LOGIN_INFO',
        'PREF',
        'HSID',
        'SSID',
        'APISID',
        'SAPISID'
      ]
    };
    
    console.log(`\n🍪 Cookie Extraction Guide for ${browser}:`);
    console.log(`📁 Cookie file location: ${guide.cookiePath}`);
    console.log('\n📋 Manual steps:');
    guide.manualSteps.forEach(step => console.log(`   ${step}`));
    console.log('\n🔑 Important cookies to extract:');
    guide.importantCookies.forEach(cookie => console.log(`   • ${cookie}`));
    console.log('\n💡 Tip: Install sqlite3 for automatic extraction: npm install sqlite3\n');
    
    return [];
  }

  /**
   * Quick setup for common YouTube cookies
   */
  getQuickSetupCookies() {
    return {
      // Essential cookies for YouTube access
      CONSENT: 'YES+cb.20210328-17-p0.en+FX+700',
      VISITOR_INFO1_LIVE: 'dQw4w9WgXcQ', // Placeholder - user needs real value
      PREF: 'tz=Asia.Ho_Chi_Minh&f4=4000000',
      
      // Instructions
      _instructions: {
        message: 'Replace placeholder values with real cookies from your browser',
        steps: [
          'Go to youtube.com in your browser',
          'Open DevTools (F12) > Application > Cookies',
          'Copy the values for VISITOR_INFO1_LIVE and other cookies',
          'Use cookieManager.addCookies() with real values'
        ]
      }
    };
  }

  /**
   * Export cookies to Netscape format
   */
  exportToNetscape(cookies, filePath) {
    const lines = [
      '# Netscape HTTP Cookie File',
      '# This is a generated file! Do not edit.',
      ''
    ];
    
    cookies.forEach(cookie => {
      const expires = cookie.expires ? Math.floor(cookie.expires.getTime() / 1000) : 0;
      const line = [
        cookie.domain,
        cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE',
        cookie.path || '/',
        cookie.secure ? 'TRUE' : 'FALSE',
        expires,
        cookie.name,
        cookie.value
      ].join('\t');
      
      lines.push(line);
    });
    
    fs.writeFileSync(filePath, lines.join('\n'));
  }
}

module.exports = BrowserCookieExtractor;