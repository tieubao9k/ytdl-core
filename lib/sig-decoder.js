/**
 * Signature Decoder
 * Handles parsing and caching of signature ciphers from YouTube player scripts
 */

const vm = require('vm');
const { request } = require('undici');
const { writeFileSync } = require('fs');

// Regex patterns for extracting cipher functions
const PATTERNS = {
  // Timestamp pattern: (signatureTimestamp|sts):(\d+)
  TIMESTAMP: /(signatureTimestamp|sts):(\d+)/,

  // Global variables pattern
  GLOBAL_VARS: /('use\s*strict';)?(?<code>var\s*(?<varname>[a-zA-Z0-9_$]+)\s*=\s*(?<value>(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\.split\((?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\)|[\[](?:(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\s*,?\s*)*[\]]|"[^"]*"\.split\("[^"]*"\)))/,

  // Actions pattern (swap, reverse, slice functions)
  ACTIONS: /var\s+([$A-Za-z0-9_]+)\s*=\s*\{\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*,\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*,\s*["']?[a-zA-Z_$][a-zA-Z_0-9$]*["']?\s*:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*}[^{}]*)*}\s*};/,

  // Signature function pattern
  SIG_FUNCTION: /function(?:\s+[a-zA-Z_$][a-zA-Z_0-9$]*)?\(([a-zA-Z_$][a-zA-Z_0-9$]*)\)\{[a-zA-Z_$][a-zA-Z_0-9$]*=[a-zA-Z_$][a-zA-Z_0-9$]*.*?\(\1,\d+\);return\s*\1.*};/,

  // N-parameter function pattern
  N_FUNCTION: /function\(\s*([a-zA-Z_$][a-zA-Z_0-9$]*)\s*\)\s*\{var\s*([a-zA-Z_$][a-zA-Z_0-9$]*)=\1\[[a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\]\([a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\).*?catch\(\s*(\w+)\s*\)\s*\{\s*return.*?\+\s*\1\s*}\s*return\s*\2\[[a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\]\([a-zA-Z_$][a-zA-Z_0-9$]*\[\d+\]\)};/s,

  // Player script URL pattern
  PLAYER_SCRIPT_URL: /"jsUrl":"([^"]+)"/
};

class SignatureDecoder {
  constructor() {
    this.cipherCache = new Map();
    this.dumpedScriptUrls = new Set();
    this.cachedPlayerScript = null;
    this.playerScriptExpiry = 0;
  }

  /**
   * Get cached player script URL or fetch new one
   */
  async getCachedPlayerScript() {
    const now = Date.now();

    if (this.cachedPlayerScript && now < this.playerScriptExpiry) {
      return this.cachedPlayerScript;
    }

    try {
      const response = await request('https://www.youtube.com/embed/', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });

      const body = await response.body.text();
      const match = body.match(PATTERNS.PLAYER_SCRIPT_URL);

      if (!match) {
        throw new Error('Could not find player script URL in embed page');
      }

      let scriptUrl = match[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');

      // Parse script URL (from CipherUtils.parseTokenScriptUrl)
      if (scriptUrl.startsWith('//')) {
        scriptUrl = 'https:' + scriptUrl;
      } else if (scriptUrl.startsWith('/')) {
        scriptUrl = 'https://www.youtube.com' + scriptUrl;
      }

      this.cachedPlayerScript = scriptUrl;
      this.playerScriptExpiry = now + (24 * 60 * 60 * 1000); // 24 hours

      return scriptUrl;
    } catch (error) {
      throw new Error(`Failed to get player script URL: ${error.message}`);
    }
  }

  /**
   * Get script timestamp
   */
  getScriptTimestamp(script, scriptUrl) {
    const match = script.match(PATTERNS.TIMESTAMP);
    if (!match) {
      this.scriptExtractionFailed(script, scriptUrl, 'TIMESTAMP_NOT_FOUND');
    }
    return match[2];
  }

  /**
   * Extract cipher components from player script
   */
  extractFromScript(script, scriptUrl) {
    const cipher = {};

    // Extract timestamp
    cipher.timestamp = this.getScriptTimestamp(script, scriptUrl);

    // Extract global variables
    const globalVarsMatch = script.match(PATTERNS.GLOBAL_VARS);
    if (!globalVarsMatch) {
      this.scriptExtractionFailed(script, scriptUrl, 'VARIABLES_NOT_FOUND');
    }
    cipher.globalVars = globalVarsMatch.groups.code;

    // Extract actions
    const actionsMatch = script.match(PATTERNS.ACTIONS);
    if (!actionsMatch) {
      this.scriptExtractionFailed(script, scriptUrl, 'SIG_ACTIONS_NOT_FOUND');
    }
    cipher.sigActions = actionsMatch[0];

    // Extract signature function
    const sigFunctionMatch = script.match(PATTERNS.SIG_FUNCTION);
    if (!sigFunctionMatch) {
      this.scriptExtractionFailed(script, scriptUrl, 'DECIPHER_FUNCTION_NOT_FOUND');
    }
    cipher.sigFunction = sigFunctionMatch[0];

    // Extract N-parameter function
    const nFunctionMatch = script.match(PATTERNS.N_FUNCTION);
    if (!nFunctionMatch) {
      this.scriptExtractionFailed(script, scriptUrl, 'N_FUNCTION_NOT_FOUND');
    }
    cipher.nFunction = nFunctionMatch[0];

    // Remove short-circuit that prevents n challenge transformation
    const nfParameterMatch = cipher.nFunction.match(/function\(\s*([^)]+)\s*\)/);
    if (nfParameterMatch) {
      const nfParameterName = nfParameterMatch[1];
      cipher.nFunction = cipher.nFunction.replace(
        new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${nfParameterName}\\s*;?`, 'g'),
        ''
      );
    }

    cipher.rawScript = script;
    cipher.scriptUrl = scriptUrl;

    return cipher;
  }

  /**
   * Get cipher for a player script URL (with caching)
   */
  async getCipherScript(scriptUrl) {
    if (this.cipherCache.has(scriptUrl)) {
      return this.cipherCache.get(scriptUrl);
    }

    try {
      // Parse script URL
      let finalUrl = scriptUrl;
      if (scriptUrl.startsWith('//')) {
        finalUrl = 'https:' + scriptUrl;
      } else if (scriptUrl.startsWith('/')) {
        finalUrl = 'https://www.youtube.com' + scriptUrl;
      }

      const response = await request(finalUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });

      if (response.statusCode !== 200) {
        throw new Error(`Received non-success response code ${response.statusCode} from script url ${scriptUrl}`);
      }

      const script = await response.body.text();
      const cipher = this.extractFromScript(script, scriptUrl);

      this.cipherCache.set(scriptUrl, cipher);

      return cipher;
    } catch (error) {
      throw new Error(`Failed to get cipher: ${error.message}`);
    }
  }

  /**
   * Apply signature cipher
   */
  applyCipher(signature, cipher) {
    try {
      const code = `
        ${cipher.globalVars};
        ${cipher.sigActions};
        var decrypt_sig = ${cipher.sigFunction};
        decrypt_sig;
      `;

      const context = vm.createContext({});
      const script = new vm.Script(code);
      const decryptFunction = script.runInContext(context);

      return decryptFunction(signature);
    } catch (error) {
      this.dumpProblematicScript(cipher.rawScript, cipher.scriptUrl,
        `Can't transform s parameter ${signature}`);
      throw new Error(`Failed to apply cipher: ${error.message}`);
    }
  }

  /**
   * Transform N-parameter
   */
  transformNParameter(nParam, cipher) {
    try {
      const code = `
        ${cipher.globalVars};
        var decrypt_nsig = ${cipher.nFunction};
        decrypt_nsig;
      `;

      const context = vm.createContext({});
      const script = new vm.Script(code);
      const transformFunction = script.runInContext(context);

      const result = transformFunction(nParam);

      return result;
    } catch (error) {
      // URLs can still be played without a resolved n parameter (will be throttled)
      this.dumpProblematicScript(cipher.rawScript, cipher.scriptUrl,
        `Can't transform n parameter ${nParam} with n function`);
      return nParam;
    }
  }

  /**
   * Resolve format URL with signature deciphering
   */
  async resolveFormatUrl(format, playerScriptUrl) {
    const cipher = await this.getCipherScript(playerScriptUrl);

    let url;
    try {
      url = new URL(format.url);
    } catch (error) {
      throw new Error(`Invalid format URL: ${format.url}`);
    }

    // Handle signatureCipher or cipher parameter
    if (format.signatureCipher || format.cipher) {
      const cipherParams = new URLSearchParams(format.signatureCipher || format.cipher);
      const signature = cipherParams.get('s');
      const signatureKey = cipherParams.get('sp') || 'signature';
      const urlParam = cipherParams.get('url');

      if (signature && urlParam) {
        const deciphered = this.applyCipher(signature, cipher);
        url = new URL(decodeURIComponent(urlParam));
        url.searchParams.set(signatureKey, deciphered);
      }
    }

    // Handle signature parameter (if exists in format)
    if (format.s) {
      const deciphered = this.applyCipher(format.s, cipher);
      url.searchParams.set(format.sp || 'signature', deciphered);
    }

    // IMPORTANT: Check if URL already has 'sig' or 'signature' parameter
    // These may need deciphering or transformation
    const existingSig = url.searchParams.get('sig') || url.searchParams.get('signature');
    const existingS = url.searchParams.get('s');

    // If there's an 's' parameter in URL (encrypted signature), decipher it
    if (existingS) {
      try {
        const deciphered = this.applyCipher(existingS, cipher);
        url.searchParams.delete('s');
        url.searchParams.set('signature', deciphered);
      } catch (error) {
        // Failed to decipher s parameter from URL
      }
    }

    // If there's a 'sig' parameter but it looks encrypted (long), try to decipher it
    // YouTube signatures are typically 80-150 chars when encrypted
    if (existingSig && existingSig.length >= 80) {
      try {
        const deciphered = this.applyCipher(existingSig, cipher);
        // Remove old sig parameter
        url.searchParams.delete('sig');
        url.searchParams.delete('signature');
        // Set new deciphered signature
        url.searchParams.set('signature', deciphered);
      } catch (error) {
        // If deciphering fails, keep original sig
      }
    }

    // Transform N-parameter if present
    const nParam = url.searchParams.get('n');
    if (nParam) {
      try {
        const transformed = this.transformNParameter(nParam, cipher);
        if (transformed && transformed !== nParam) {
          url.searchParams.set('n', transformed);
        }
      } catch (error) {
        // Non-fatal, URL will still work but may be throttled
      }
    }

    return url.toString();
  }

  /**
   * Dump problematic script for debugging
   */
  dumpProblematicScript(script, sourceUrl, issue) {
    if (this.dumpedScriptUrls.has(sourceUrl)) {
      return;
    }
    this.dumpedScriptUrls.add(sourceUrl);

    try {
      const filename = `ytdl-player-script-${Date.now()}.js`;
      writeFileSync(filename, script);
    } catch (error) {
      // Failed to dump problematic script
    }
  }

  /**
   * Script extraction failed handler
   */
  scriptExtractionFailed(script, sourceUrl, failureType) {
    this.dumpProblematicScript(script, sourceUrl, `must find ${failureType}`);
    throw new Error(`Must find ${failureType} from script: ${sourceUrl}`);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cipherCache.clear();
    this.cachedPlayerScript = null;
    this.playerScriptExpiry = 0;
  }
}

// Export singleton instance
const decoderInstance = new SignatureDecoder();

module.exports = {
  SignatureDecoder,
  decoder: decoderInstance,
  getCachedPlayerScript: () => decoderInstance.getCachedPlayerScript(),
  getCipherScript: (scriptUrl) => decoderInstance.getCipherScript(scriptUrl),
  applyCipher: (sig, cipher) => decoderInstance.applyCipher(sig, cipher),
  transformNParameter: (n, cipher) => decoderInstance.transformNParameter(n, cipher),
  resolveFormatUrl: (format, playerScript) => decoderInstance.resolveFormatUrl(format, playerScript),
  clearCache: () => decoderInstance.clearCache(),
};
