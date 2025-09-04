const querystring = require('querystring');
const Cache = require('./cache');
const utils = require('./utils');
const vm = require('vm');

// A shared cache to keep track of html5player js functions.
exports.cache = new Cache();

/**
 * Extract signature deciphering and n parameter transform functions from html5player file.
 *
 * @param {string} html5playerfile
 * @param {Object} options
 * @returns {Promise<Array.<string>>}
 */
exports.getFunctions = (html5playerfile, options) => exports.cache.getOrSet(html5playerfile, async() => {
  const body = await utils.exposedMiniget(html5playerfile, options).text();
  const functions = exports.extractFunctions(body);
  if (!functions || !functions.length) {
    // Try DisTube extraction method as fallback
    const distubeFunctions = exports.extractFunctionsDistube(body);
    if (distubeFunctions && distubeFunctions.length) {
      exports.cache.set(html5playerfile, distubeFunctions);
      return distubeFunctions;
    }
    throw Error('Could not extract functions');
  }
  exports.cache.set(html5playerfile, functions);
  return functions;
});

/**
 * Extracts the actions that should be taken to decipher a signature
 * and tranform the n parameter
 *
 * @param {string} body
 * @returns {Array.<string>}
 */
exports.extractFunctions = body => {
  const functions = [];
  const extractManipulations = caller => {
    const functionName = utils.between(caller, `a=a.split("");`, `.`);
    if (!functionName) return '';
    const functionStart = `var ${functionName}={`;
    const ndx = body.indexOf(functionStart);
    if (ndx < 0) return '';
    const subBody = body.slice(ndx + functionStart.length - 1);
    return `var ${functionName}=${utils.cutAfterJS(subBody)}`;
  };
  const extractDecipher = () => {
    const functionName = utils.between(body, `a.set("alr","yes");c&&(c=`, `(decodeURIC`);
    if (functionName && functionName.length) {
      const functionStart = `${functionName}=function(a)`;
      const ndx = body.indexOf(functionStart);
      if (ndx >= 0) {
        const subBody = body.slice(ndx + functionStart.length);
        let functionBody = `var ${functionStart}${utils.cutAfterJS(subBody)}`;
        functionBody = `${extractManipulations(functionBody)};${functionBody};${functionName}(sig);`;
        functions.push(functionBody);
      }
    }
  };
  const extractNCode = () => {
    let functionName = utils.between(body, `&&(b=a.get("n"))&&(b=`, `(b)`);
    if (functionName.includes('[')) functionName = utils.between(body, `var ${functionName.split('[')[0]}=[`, `]`);
    if (functionName && functionName.length) {
      const functionStart = `${functionName}=function(a)`;
      const ndx = body.indexOf(functionStart);
      if (ndx >= 0) {
        const subBody = body.slice(ndx + functionStart.length);
        const functionBody = `var ${functionStart}${utils.cutAfterJS(subBody)};${functionName}(ncode);`;
        functions.push(functionBody);
      }
    }
  };
  extractDecipher();
  extractNCode();
  return functions;
};

/**
 * Apply decipher and n-transform to individual format
 *
 * @param {Object} format
 * @param {vm.Script} decipherScript
 * @param {vm.Script} nTransformScript
 */
exports.setDownloadURL = (format, decipherScript, nTransformScript) => {
  const decipher = url => {
    if (!url) return url;
    try {
      const args = querystring.parse(url);
      if (!args.s || !decipherScript) return args.url || url;
      if (!args.url) return url;
      const components = new URL(decodeURIComponent(args.url));
      components.searchParams.set(args.sp ? args.sp : 'signature',
        decipherScript.runInNewContext({ sig: decodeURIComponent(args.s) }));
      return components.toString();
    } catch (error) {
      console.warn('Decipher failed:', error.message);
      return url;
    }
  };
  const ncode = url => {
    if (!url) return url;
    try {
      const components = new URL(decodeURIComponent(url));
      const n = components.searchParams.get('n');
      if (!n || !nTransformScript) return url;
      components.searchParams.set('n', nTransformScript.runInNewContext({ ncode: n }));
      return components.toString();
    } catch (error) {
      console.warn('N-code transform failed:', error.message);
      return url;
    }
  };
  const cipher = !format.url;
  const url = format.url || format.signatureCipher || format.cipher;
  format.url = cipher ? ncode(decipher(url)) : ncode(url);
  delete format.signatureCipher;
  delete format.cipher;
};

/**
 * Applies decipher and n parameter transforms to all format URL's.
 *
 * @param {Array.<Object>} formats
 * @param {string} html5player
 * @param {Object} options
 */
exports.decipherFormats = async(formats, html5player, options) => {
  let decipheredFormats = {};
  let functions;
  let decipherScript = null;
  let nTransformScript = null;
  
  try {
    functions = await exports.getFunctions(html5player, options);
    decipherScript = functions.length ? functions[0] : null;
    nTransformScript = functions.length > 1 ? functions[1] : null;
    
    // Convert to vm.Script if they are strings
    if (typeof decipherScript === 'string') {
      decipherScript = new vm.Script(decipherScript);
    }
    if (typeof nTransformScript === 'string') {
      nTransformScript = new vm.Script(nTransformScript);
    }
  } catch (error) {
    console.warn('Standard signature extraction failed, trying DisTube fallback...');
    
    try {
      const body = await utils.exposedMiniget(html5player, options).text();
      const distubeFunctions = exports.extractFunctionsDistube(body);
      decipherScript = distubeFunctions.length ? distubeFunctions[0] : null;
      nTransformScript = distubeFunctions.length > 1 ? distubeFunctions[1] : null;
      console.log('✅ DisTube signature extraction succeeded');
    } catch (distubeError) {
      console.warn('DisTube signature extraction also failed:', distubeError.message);
    }
  }
  
  formats.forEach(format => {
    exports.setDownloadURL(format, decipherScript, nTransformScript);
    decipheredFormats[format.url] = format;
  });
  return decipheredFormats;
};

// DisTube extraction patterns
const DECIPHER_NAME_REGEXPS = [
  "\\bm=([a-zA-Z0-9$]{2,})\\(decodeURIComponent\\(h\\.s\\)\\)",
  "\\bc&&\\(c=([a-zA-Z0-9$]{2,})\\(decodeURIComponent\\(c\\)\\)",
  '(?:\\b|[^a-zA-Z0-9$])([a-zA-Z0-9$]{2,})\\s*=\\s*function\\(\\s*a\\s*\\)\\s*\\{\\s*a\\s*=\\s*a\\.split\\(\\s*""\\s*\\)',
  '([\\w$]+)\\s*=\\s*function\\((\\w+)\\)\\{\\s*\\2=\\s*\\2\\.split\\(""\\)\\s*;',
];

const VARIABLE_PART = "[a-zA-Z_\\$][a-zA-Z_0-9]*";
const VARIABLE_PART_DEFINE = `\\"?${VARIABLE_PART}\\"?`;
const BEFORE_ACCESS = '(?:\\[\\"|\\.)';
const AFTER_ACCESS = '(?:\\"\\]|)';
const VARIABLE_PART_ACCESS = BEFORE_ACCESS + VARIABLE_PART + AFTER_ACCESS;
const REVERSE_PART = ":function\\(\\w\\)\\{(?:return )?\\w\\.reverse\\(\\)\\}";
const SLICE_PART = ":function\\(\\w,\\w\\)\\{return \\w\\.slice\\(\\w\\)\\}";
const SPLICE_PART = ":function\\(\\w,\\w\\)\\{\\w\\.splice\\(0,\\w\\)\\}";
const SWAP_PART = ":function\\(\\w,\\w\\)\\{var \\w=\\w\\[0\\];\\w\\[0\\]=\\w\\[\\w%\\w\\.length\\];\\w\\[\\w(?:%\\w.length|)\\]=\\w(?:;return \\w)?\\}";

const DECIPHER_REGEXP =
  `function(?: ${VARIABLE_PART})?\\(([a-zA-Z])\\)\\{` +
  '\\1=\\1\\.split\\(""\\);\\s*' +
  `((?:(?:\\1=)?${VARIABLE_PART}${VARIABLE_PART_ACCESS}\\(\\1,\\d+\\);)+)` +
  'return \\1\\.join\\(""\\)' +
  `\\}`;

const HELPER_REGEXP = `var (${VARIABLE_PART})=\\{((?:(?:${VARIABLE_PART_DEFINE}${REVERSE_PART}|${
  VARIABLE_PART_DEFINE
}${SLICE_PART}|${VARIABLE_PART_DEFINE}${SPLICE_PART}|${VARIABLE_PART_DEFINE}${SWAP_PART}),?\\n?)+)\\};`;

const SCVR = "[a-zA-Z0-9$_]";
const MCR = `${SCVR}+`;
const AAR = "\\[(\\d+)]";
const N_TRANSFORM_NAME_REGEXPS = [
  `${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}\\(${MCR}\\),${MCR}=${MCR}\\.${MCR}\\[${MCR}]\\|\\|null\\).+\\|\\|(${MCR})\\(""\\)`,
  `${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}\\(${MCR}\\),${MCR}=${MCR}\\.${MCR}\\[${MCR}]\\|\\|null\\)&&\\(${MCR}=(${MCR})${AAR}`,
  `${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}=${MCR}\\.get\\(${MCR}\\)\\).+\\|\\|(${MCR})\\(""\\)`,
  `${SCVR}="nn"\\[\\+${MCR}\\.${MCR}],${MCR}=${MCR}\\.get\\(${MCR}\\)\\)&&\\(${MCR}=(${MCR})\\[(\\d+)]`,
  `\\(${SCVR}=String\\.fromCharCode\\(110\\),${SCVR}=${SCVR}\\.get\\(${SCVR}\\)\\)&&\\(${SCVR}=(${MCR})(?:${AAR})?\\(${SCVR}\\)`,
  `\\.get\\("n"\\)\\)&&\\(${SCVR}=(${MCR})(?:${AAR})?\\(${SCVR}\\)`,
];

const N_TRANSFORM_REGEXP =
  "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  "var\\s*(\\w+)=(?:\\1\\.split\\(.*?\\)|String\\.prototype\\.split\\.call\\(\\1,.*?\\))," +
  "\\s*(\\w+)=(\\[.*?]);\\s*\\3\\[\\d+]" +
  "(.*?try)(\\{.*?})catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  '\\s*return"[\\w-]+([A-z0-9-]+)"\\s*\\+\\s*\\1\\s*}' +
  '\\s*return\\s*(\\2\\.join\\(""\\)|Array\\.prototype\\.join\\.call\\(\\2,.*?\\))};';

const DECIPHER_ARGUMENT = "sig";
const N_ARGUMENT = "ncode";

const matchRegex = (regex, str) => {
  const match = str.match(new RegExp(regex, "s"));
  if (!match) throw new Error(`Could not match ${regex}`);
  return match;
};

const matchFirst = (regex, str) => matchRegex(regex, str)[0];
const matchGroup1 = (regex, str) => matchRegex(regex, str)[1];

const getFuncName = (body, regexps) => {
  let fn;
  for (const regex of regexps) {
    try {
      fn = matchGroup1(regex, body);
      try {
        fn = matchGroup1(`${fn.replace(/\$/g, "\\$")}=\\[([a-zA-Z0-9$\\[\\]]{2,})\\]`, body);
      } catch (err) {
        // Function name is not inside an array
      }
      break;
    } catch (err) {
      continue;
    }
  }
  if (!fn || fn.includes("[")) throw Error();
  return fn;
};

const DECIPHER_FUNC_NAME = "DisTubeDecipherFunc";
const extractDecipherFunc = body => {
  try {
    const helperObject = matchFirst(HELPER_REGEXP, body);
    const decipherFunc = matchFirst(DECIPHER_REGEXP, body);
    const resultFunc = `var ${DECIPHER_FUNC_NAME}=${decipherFunc};`;
    const callerFunc = `${DECIPHER_FUNC_NAME}(${DECIPHER_ARGUMENT});`;
    return helperObject + resultFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

const extractDecipherWithName = body => {
  try {
    const decipherFuncName = getFuncName(body, DECIPHER_NAME_REGEXPS);
    const funcPattern = `(${decipherFuncName.replace(/\$/g, "\\$")}=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})`;
    const decipherFunc = `var ${matchGroup1(funcPattern, body)};`;
    const helperObjectName = matchGroup1(";([A-Za-z0-9_\\$]{2,})\\.\\w+\\(", decipherFunc);
    const helperPattern = `(var ${helperObjectName.replace(/\$/g, "\\$")}=\\{[\\s\\S]+?\\}\\};)`;
    const helperObject = matchGroup1(helperPattern, body);
    const callerFunc = `${decipherFuncName}(${DECIPHER_ARGUMENT});`;
    return helperObject + decipherFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

const N_TRANSFORM_FUNC_NAME = "DisTubeNTransformFunc";
const extractNTransformFunc = body => {
  try {
    const nFunc = matchFirst(N_TRANSFORM_REGEXP, body);
    const resultFunc = `var ${N_TRANSFORM_FUNC_NAME}=${nFunc}`;
    const callerFunc = `${N_TRANSFORM_FUNC_NAME}(${N_ARGUMENT});`;
    return resultFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

const extractNTransformWithName = body => {
  try {
    const nFuncName = getFuncName(body, N_TRANSFORM_NAME_REGEXPS);
    const funcPattern = `(${nFuncName.replace(/\$/g, "\\$")}=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})`;
    const nTransformFunc = `var ${matchGroup1(funcPattern, body)};`;
    const callerFunc = `${nFuncName}(${N_ARGUMENT});`;
    return nTransformFunc + callerFunc;
  } catch (e) {
    return null;
  }
};

const getExtractFunctions = (extractFunctions, body, postProcess = null) => {
  for (const extractFunction of extractFunctions) {
    try {
      const func = extractFunction(body);
      if (!func) continue;
      return new vm.Script(postProcess ? postProcess(func) : func);
    } catch (err) {
      continue;
    }
  }
  return null;
};

/**
 * DisTube-style extraction functions as fallback
 *
 * @param {string} body
 * @returns {Array.<vm.Script>}
 */
exports.extractFunctionsDistube = body => {
  const functions = [];
  
  // Extract decipher function
  const decipherFunc = getExtractFunctions([extractDecipherFunc, extractDecipherWithName], body);
  if (decipherFunc) {
    functions.push(decipherFunc);
  }
  
  // Extract n-transform function  
  const nTransformFunc = getExtractFunctions([extractNTransformFunc, extractNTransformWithName], body, code =>
    code.replace(/if\(typeof \S+==="undefined"\)return \S+;/, "")
  );
  if (nTransformFunc) {
    functions.push(nTransformFunc);
  }
  
  return functions;
};
