const { ProxyAgent } = require("undici");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { Cookie, CookieJar, canonicalDomain } = require("tough-cookie");
const { CookieAgent, CookieClient } = require("http-cookie-agent/undici");

/**
 * Convert SameSite attribute from YouTube format to cookie format
 */
const convertSameSite = sameSite => {
  switch (sameSite) {
    case "strict":
      return "strict";
    case "lax":
      return "lax";
    case "no_restriction":
    case "unspecified":
    default:
      return "none";
  }
};

/**
 * Convert cookie object to Cookie instance
 */
const convertCookie = cookie =>
  cookie instanceof Cookie
    ? cookie
    : new Cookie({
        key: cookie.name,
        value: cookie.value,
        expires: typeof cookie.expirationDate === "number" ? new Date(cookie.expirationDate * 1000) : "Infinity",
        domain: canonicalDomain(cookie.domain),
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: convertSameSite(cookie.sameSite),
        hostOnly: cookie.hostOnly,
      });

/**
 * Add cookies to a cookie jar
 * Automatically adds SOCS cookie for YouTube compliance if not present
 */
const addCookies = (exports.addCookies = (jar, cookies) => {
  if (!cookies || !Array.isArray(cookies)) {
    throw new Error("cookies must be an array");
  }
  
  // Add SOCS cookie for YouTube compliance if not already present
  if (!cookies.some(c => c.name === "SOCS")) {
    cookies.push({
      domain: ".youtube.com",
      hostOnly: false,
      httpOnly: false,
      name: "SOCS",
      path: "/",
      sameSite: "lax",
      secure: true,
      session: false,
      value: "CAI",
    });
  }
  
  for (const cookie of cookies) {
    jar.setCookieSync(convertCookie(cookie), "https://www.youtube.com");
  }
});

/**
 * Add cookies from a cookie string (e.g., "name1=value1; name2=value2")
 */
exports.addCookiesFromString = (jar, cookies) => {
  if (!cookies || typeof cookies !== "string") {
    throw new Error("cookies must be a string");
  }
  return addCookies(
    jar,
    cookies
      .split(";")
      .map(c => Cookie.parse(c))
      .filter(Boolean),
  );
};

/**
 * Create a cookie agent for HTTP requests with enhanced features
 * Supports both cookie array and string formats
 */
const createAgent = (exports.createAgent = (cookies = [], opts = {}) => {
  const options = Object.assign({}, opts);
  
  if (!options.cookies) {
    const jar = new CookieJar();
    
    // Handle both cookie formats
    if (typeof cookies === 'string') {
      exports.addCookiesFromString(jar, cookies);
    } else if (Array.isArray(cookies)) {
      addCookies(jar, cookies);
    }
    
    options.cookies = { jar };
  }
  
  return {
    dispatcher: new CookieAgent(options),
    localAddress: options.localAddress,
    jar: options.cookies.jar,
  };
});

/**
 * Create a proxy agent with cookie support
 * Enhanced for both HTTP and HTTPS proxy support
 */
exports.createProxyAgent = (options, cookies = []) => {
  if (!cookies) cookies = [];
  if (typeof options === "string") options = { uri: options };
  if (options.factory) throw new Error("Cannot use factory with createProxyAgent");
  
  const jar = new CookieJar();
  
  // Handle both cookie formats
  if (typeof cookies === 'string') {
    exports.addCookiesFromString(jar, cookies);
  } else if (Array.isArray(cookies)) {
    addCookies(jar, cookies);
  }
  
  const proxyOptions = Object.assign(
    {
      factory: (origin, opts) => {
        const o = Object.assign({ cookies: { jar } }, opts);
        return new CookieClient(origin, o);
      },
    },
    options,
  );

  // ProxyAgent type that node http library supports
  const agent = new HttpsProxyAgent(options.uri);

  // ProxyAgent type that undici supports  
  const dispatcher = new ProxyAgent(proxyOptions);

  return { dispatcher, agent, jar, localAddress: options.localAddress };
};

/**
 * Default agent instance for enhanced ytdl-core
 * Includes SOCS cookie for compliance
 */
exports.defaultAgent = createAgent();

/**
 * Enhanced agent creation with Android client optimization
 * Combines cookie support with fast Android client features
 */
exports.createEnhancedAgent = (cookies = [], opts = {}) => {
  const options = Object.assign({
    // Android client optimization headers
    headers: {
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.09.37',
    }
  }, opts);
  
  return createAgent(cookies, options);
};