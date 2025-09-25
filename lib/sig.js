const querystring = require('querystring');
const Cache = require('./cache');
const utils = require('./utils');
const vm = require('vm');
exports.cache = new Cache();


const VARIABLE_PART = "[a-zA-Z_\\$][a-zA-Z_0-9\\$]*";
const VARIABLE_PART_DEFINE = "\\\"?" + VARIABLE_PART + "\\\"?";
const BEFORE_ACCESS = "(?:\\[\\\"|\\.)";
const AFTER_ACCESS = "(?:\\\"\\]|)";
const VARIABLE_PART_ACCESS = BEFORE_ACCESS + VARIABLE_PART + AFTER_ACCESS;

const REVERSE_PART = ":function\\(\\w\\)\\{(?:return )?\\w\\.reverse\\(\\)\\}";
const SLICE_PART = ":function\\(\\w,\\w\\)\\{return \\w\\.slice\\(\\w\\)\\}";
const SPLICE_PART = ":function\\(\\w,\\w\\)\\{\\w\\.splice\\(0,\\w\\)\\}";
const SWAP_PART = ":function\\(\\w,\\w\\)\\{" +
  "var \\w=\\w\\[0\\];\\w\\[0\\]=\\w\\[\\w%\\w\\.length\\];\\w\\[\\w(?:%\\w.length|)\\]=\\w(?:;return \\w)?\\}";

const DECIPHER_REGEXP =
  "function(?: " + VARIABLE_PART + ")?\\(([a-zA-Z])\\)\\{" +
  "\\1=\\1\\.split\\(\\\"\\\"\\);\\s*" +
  "((?:(?:\\1=)?" + VARIABLE_PART + VARIABLE_PART_ACCESS + "\\(\\1,\\d+\\);)+)" +
  "return \\1\\.join\\(\\\"\\\"\\)" +
  "\\}";

const HELPER_REGEXP =
  "var (" + VARIABLE_PART + ")=\\{((?:(?:" +
  VARIABLE_PART_DEFINE + REVERSE_PART + "|" +
  VARIABLE_PART_DEFINE + SLICE_PART + "|" +
  VARIABLE_PART_DEFINE + SPLICE_PART + "|" +
  VARIABLE_PART_DEFINE + SWAP_PART +
  "),?\\n?)+)\\};";

const N_TRANSFORM_REGEXP =
  "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  "var\\s*(\\w+)=(?:\\1\\.split\\(.*?\\)|String\\.prototype\\.split\\.call\\(\\1,.*?\\))," +
  "\\s*(\\w+)=(\\[.*?]);\\s*\\3\\[\\d+]" +
  "(.*?try)(\\{.*?})catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  '\\s*return"[\\w-]+([A-z0-9-]+)"\\s*\\+\\s*\\1\\s*}' +
  '\\s*return\\s*(\\2\\.join\\(""\\)|Array\\.prototype\\.join\\.call\\(\\2,.*?\\))};';

const BASE64URL_N_TRANSFORM_REGEXP =
  "function\\s*\\([^)]*\\)\\s*\\{[^}]*" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" +
  "[^}]*\\&\\s*63[^}]*charAt[^}]*join[^}]*\\}";

const VSG_PATTERN =
  "function\\s*\\(\\)\\s*\\{[^}]*generateRandomData\\(16\\)[^}]*" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" +
  "[^}]*charAt[^}]*&\\s*63[^}]*join[^}]*\\}";

const WU_PATTERN =
  "function\\s*\\([^)]*\\)\\s*\\{[^}]*generateRandomData[^}]*" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" +
  "[^}]*charAt[^}]*&\\s*63[^}]*join[^}]*\\}";

const REVERSE_PATTERN = new RegExp("(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?" + REVERSE_PART, "m");
const SLICE_PATTERN = new RegExp("(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?" + SLICE_PART, "m");
const SPLICE_PATTERN = new RegExp("(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?" + SPLICE_PART, "m");
const SWAP_PATTERN = new RegExp("(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?" + SWAP_PART, "m");

const DECIPHER_ARGUMENT = "sig";
const N_ARGUMENT = "ncode";
const DECIPHER_FUNC_NAME = "decipherSignature";
const N_TRANSFORM_FUNC_NAME = "nTransformFunc";

exports.getFunctions = (html5playerfile, options) => exports.cache.getOrSet(html5playerfile, async() => {
  const body = await utils.request(html5playerfile, options);
  const functions = exports.extractFunctions(body);
  if (!functions || !functions.length) {
    throw Error('Could not extract functions');
  }
  exports.cache.set(html5playerfile, functions);
  return functions;
});


const extractDollarEscapedFirstGroup = (pattern, text) => {
  const match = text.match(pattern);
  return match ? match[1].replace(/\$/g, "\\$") : null;
};

const extractSignatureFunction = (body) => {
  try {
    const helperMatch = body.match(new RegExp(HELPER_REGEXP, "s"));
    if (!helperMatch) return null;

    const helperObject = helperMatch[0];
    const actionBody = helperMatch[2];
    const helperName = helperMatch[1];

    const reverseKey = extractDollarEscapedFirstGroup(REVERSE_PATTERN, actionBody);
    const sliceKey = extractDollarEscapedFirstGroup(SLICE_PATTERN, actionBody);
    const spliceKey = extractDollarEscapedFirstGroup(SPLICE_PATTERN, actionBody);
    const swapKey = extractDollarEscapedFirstGroup(SWAP_PATTERN, actionBody);

    if (!reverseKey && !sliceKey && !spliceKey && !swapKey) return null;

    const funcMatch = body.match(new RegExp(DECIPHER_REGEXP, "s"));
    if (!funcMatch) return null;

    const decipherFunc = funcMatch[0];
    const callerFunc = `${DECIPHER_FUNC_NAME}(${DECIPHER_ARGUMENT});`;
    const resultFunc = `${helperObject}\nvar ${DECIPHER_FUNC_NAME}=${decipherFunc};\n`;

    return resultFunc + callerFunc;

  } catch (error) {
    return null;
  }
};


const extractNTransformFunction = (body) => {
  try {
      let nMatch = body.match(new RegExp(BASE64URL_N_TRANSFORM_REGEXP, "s"));

    if (nMatch) {
      const nFunction = nMatch[0];
      const callerFunc = `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
      const resultFunc = `var ${N_TRANSFORM_FUNC_NAME}=${nFunction};\n`;
      return resultFunc + callerFunc;
    }

    nMatch = body.match(new RegExp(VSG_PATTERN, "s"));
    if (nMatch) {
      const nTransformCode = `
var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function generateRandomData(length) {
  var data = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return data;
}

function vsg() {
  var h = generateRandomData(16);
  var c = [];
  for (var t = 0; t < h.length; t++) {
    c.push(BASE64_ALPHABET.charAt(h[t] & 63));
  }
  return c.join("");
}

function Wu(h) {
  h = generateRandomData(h || 16);
  var c = [];
  for (var t = 0; t < h.length; t++) {
    c.push(BASE64_ALPHABET.charAt(h[t] & 63));
  }
  return c.join("");
}

var ${N_TRANSFORM_FUNC_NAME} = function(${N_ARGUMENT}) {
  try {
    if (!${N_ARGUMENT} || typeof ${N_ARGUMENT} !== 'string') {
      return "";
    }

    if (${N_ARGUMENT}.length > 100 && ${N_ARGUMENT}.includes('function')) {
      return vsg();
    }

    if (${N_ARGUMENT}.length < 100) {
      return Wu(${N_ARGUMENT}.length);
    }

    return "";
  } catch (error) {
    return "";
  }
};`;

      return nTransformCode + `\n${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
    }

    nMatch = body.match(new RegExp(N_TRANSFORM_REGEXP, "s"));
    if (nMatch) {
      const nFunction = nMatch[0];

      const paramMatch = nFunction.match(/function\s*\(\s*(\w+)\s*\)/);
      if (!paramMatch) return null;

      const paramName = paramMatch[1];
      const cleanedFunction = nFunction.replace(
        new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${paramName}\\s*;?`, "g"),
        ""
      );

      const callerFunc = `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
      const resultFunc = `var ${N_TRANSFORM_FUNC_NAME}=${cleanedFunction};\n`;

      return resultFunc + callerFunc;
    }
    const fallbackCode = `
var ${N_TRANSFORM_FUNC_NAME} = function(${N_ARGUMENT}) {
  return "";
};`;

    return fallbackCode + `\n${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;

  } catch (error) {
    const ultimateFallback = `
var ${N_TRANSFORM_FUNC_NAME} = function(${N_ARGUMENT}) {
  return "";
};`;

    return ultimateFallback + `\n${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
  }
};

exports.extractFunctions = (body) => {
  const functions = [];

  const signatureFunc = extractSignatureFunction(body);
  if (signatureFunc) {
    functions.push(signatureFunc);
  }

  const nTransformFunc = extractNTransformFunction(body);
  if (nTransformFunc) {
    functions.push(nTransformFunc);
  }

  return functions;
};

exports.setDownloadURL = (format, decipherScript, nTransformScript) => {
  const decipher = url => {
    const args = querystring.parse(url);
    if (!args.s || !decipherScript) return args.url;

    try {
      const components = new URL(decodeURIComponent(args.url));
      const decipheredSig = decipherScript.runInNewContext({ [DECIPHER_ARGUMENT]: decodeURIComponent(args.s) });
      components.searchParams.set(args.sp || 'signature', decipheredSig);
      return components.toString();
    } catch (error) {
      return args.url;
    }
  };

  const ncode = url => {
    const components = new URL(decodeURIComponent(url));
    const n = components.searchParams.get('n');
    if (!n || !nTransformScript) return url;

    try {
      const transformedN = nTransformScript.runInNewContext({ [N_ARGUMENT]: n });

      if (transformedN === null || transformedN === undefined) {
        return url;
      }

      if (transformedN === "") {
        components.searchParams.delete('n');
      } else {
        components.searchParams.set('n', transformedN);
      }

      return components.toString();
    } catch (error) {
      return url;
    }
  };

  const cipher = !format.url;
  const url = format.url || format.signatureCipher || format.cipher;
  if (!url) return;

  try {
    format.url = cipher ? ncode(decipher(url)) : ncode(url);
    delete format.signatureCipher;
    delete format.cipher;
  } catch (error) {
    console.log('Create issues on github/tieubao9k/ytdl-core')
  }
};


exports.decipherFormats = async(formats, html5player, options) => {
  let decipheredFormats = {};
  let functions = await exports.getFunctions(html5player, options);
  const decipherScript = functions.length ? new vm.Script(functions[0]) : null;
  const nTransformScript = functions.length > 1 ? new vm.Script(functions[1]) : null;

  formats.forEach(format => {
    exports.setDownloadURL(format, decipherScript, nTransformScript);
    decipheredFormats[format.url] = format;
  });
  return decipheredFormats;
};