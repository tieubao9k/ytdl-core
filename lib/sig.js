const querystring = require("querystring");
const Cache = require("./cache");
const utils = require("./utils");
const vm = require("vm");

exports.cache = new Cache(3600000); // 1 hour TTL

exports.getFunctions = (html5playerfile, options) =>
  exports.cache.getOrSet(html5playerfile, async () => {
    const body = await utils.request(html5playerfile, options);
    const functions = exports.extractFunctions(body);
    exports.cache.set(html5playerfile, functions);
    return functions;
  });

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
  "\\1=\\1\\.split\\(\"\"\\);\\s*" +
  "((?:(?:\\1=)?" + VARIABLE_PART + VARIABLE_PART_ACCESS + "\\(\\1,\\d+\\);)+)" +
  "return \\1\\.join\\(\"\"\\)" +
  "\\}";

const HELPER_REGEXP =
  "var (" + VARIABLE_PART + ")=\\{((?:(?:" +
  VARIABLE_PART_DEFINE + REVERSE_PART + "|" +
  VARIABLE_PART_DEFINE + SLICE_PART + "|" +
  VARIABLE_PART_DEFINE + SPLICE_PART + "|" +
  VARIABLE_PART_DEFINE + SWAP_PART +
  "),?\\n?)+)\\};";

const FUNCTION_TCE_REGEXP =
  "function(?:\\s+[a-zA-Z_\\$][a-zA-Z0-9_\\$]*)?\\(\\w\\)\\{" +
  "\\w=\\w\\.split\\((?:\"\"|[a-zA-Z0-9_$]*\\[\\d+])\\);" +
  "\\s*((?:(?:\\w=)?[a-zA-Z_\\$][a-zA-Z0-9_\\$]*(?:\\[\\\"|\\.)[a-zA-Z_\\$][a-zA-Z0-9_\\$]*(?:\\\"\\]|)\\(\\w,\\d+\\);)+)" +
  "return \\w\\.join\\((?:\"\"|[a-zA-Z0-9_$]*\\[\\d+])\\)}";

const N_TRANSFORM_REGEXP =
  "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  "var\\s*(\\w+)=(?:\\1\\.split\\(.*?\\)|String\\.prototype\\.split\\.call\\(\\1,.*?\\))," +
  "\\s*(\\w+)=(\\[.*?]);\\s*\\3\\[\\d+]" +
  "(.*?try)(\\{.*?})catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  '\\s*return"[\\w-]+([A-z0-9-]+)"\\s*\\+\\s*\\1\\s*}' +
  '\\s*return\\s*(\\2\\.join\\(""\\)|Array\\.prototype\\.join\\.call\\(\\2,.*?\\))};';

const N_TRANSFORM_TCE_REGEXP =
  "function\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  "\\s*var\\s*(\\w+)=\\1\\.split\\(\\1\\.slice\\(0,0\\)\\),\\s*(\\w+)=\\[.*?];" +
  ".*?catch\\(\\s*(\\w+)\\s*\\)\\s*\\{" +
  "\\s*return(?:\"[^\"]+\"|\\s*[a-zA-Z_0-9$]*\\[\\d+])\\s*\\+\\s*\\1\\s*}" +
  "\\s*return\\s*\\2\\.join\\((?:\"\"|[a-zA-Z_0-9$]*\\[\\d+])\\)};";

const TCE_GLOBAL_VARS_REGEXP =
  "(?:^|[;,])\\s*(var\\s+([\\w$]+)\\s*=\\s*" +
  "(?:" +
  "([\"'])(?:\\\\.|[^\\\\])*?\\3" +
  "\\s*\\.\\s*split\\((" +
  "([\"'])(?:\\\\.|[^\\\\])*?\\5" +
  "\\))" +
  "|" +
  "\\[\\s*(?:([\"'])(?:\\\\.|[^\\\\])*?\\6\\s*,?\\s*)+\\]" +
  "))(?=\\s*[,;])";

const NEW_TCE_GLOBAL_VARS_REGEXP =
  "('use\\s*strict';)?" +
  "(?<code>var\\s*" +
  "(?<varname>[a-zA-Z0-9_$]+)\\s*=\\s*" +
  "(?<value>" +
  "(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
  "\\.split\\(" +
  "(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
  "\\)" +
  "|" +
  "\\[" +
  "(?:(?:\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(?:\\\\.[^'\\\\]*)*')" +
  "\\s*,?\\s*)*" +
  "\\]" +
  "|" +
  "\"[^\"]*\"\\.split\\(\"[^\"]*\"\\)" +
  ")" +
  ")";

const TCE_SIGN_FUNCTION_REGEXP = "function\\(\\s*([a-zA-Z0-9$])\\s*\\)\\s*\\{" +
  "\\s*\\1\\s*=\\s*\\1\\[(\\w+)\\[\\d+\\]\\]\\(\\2\\[\\d+\\]\\);" +
  "([a-zA-Z0-9$]+)\\[\\2\\[\\d+\\]\\]\\(\\s*\\1\\s*,\\s*\\d+\\s*\\);" +
  "\\s*\\3\\[\\2\\[\\d+\\]\\]\\(\\s*\\1\\s*,\\s*\\d+\\s*\\);" +
  ".*?return\\s*\\1\\[\\2\\[\\d+\\]\\]\\(\\2\\[\\d+\\]\\)\\};";

const TCE_SIGN_FUNCTION_ACTION_REGEXP = "var\\s+([$A-Za-z0-9_]+)\\s*=\\s*\\{\\s*[$A-Za-z0-9_]+\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[^{}]*(?:\\{[^{}]*}[^{}]*)*}\\s*,\\s*[$A-Za-z0-9_]+\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[^{}]*(?:\\{[^{}]*}[^{}]*)*}\\s*,\\s*[$A-Za-z0-9_]+\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[^{}]*(?:\\{[^{}]*}[^{}]*)*}\\s*};";

const TCE_N_FUNCTION_REGEXP = "function\\s*\\((\\w+)\\)\\s*\\{var\\s*\\w+\\s*=\\s*\\1\\[\\w+\\[\\d+\\]\\]\\(\\w+\\[\\d+\\]\\)\\s*,\\s*\\w+\\s*=\\s*\\[.*?\\]\\;.*?catch\\s*\\(\\s*(\\w+)\\s*\\)\\s*\\{return\\s*\\w+\\[\\d+\\]\\s*\\+\\s*\\1\\}\\s*return\\s*\\w+\\[\\w+\\[\\d+\\]\\]\\(\\w+\\[\\d+\\]\\)\\}\\s*\\;";

const PATTERN_PREFIX = "(?:^|,)\\\"?(" + VARIABLE_PART + ")\\\"?";
const REVERSE_PATTERN = new RegExp(PATTERN_PREFIX + REVERSE_PART, "m");
const SLICE_PATTERN = new RegExp(PATTERN_PREFIX + SLICE_PART, "m");
const SPLICE_PATTERN = new RegExp(PATTERN_PREFIX + SPLICE_PART, "m");
const SWAP_PATTERN = new RegExp(PATTERN_PREFIX + SWAP_PART, "m");

const DECIPHER_ARGUMENT = "sig";
const N_ARGUMENT = "ncode";
const DECIPHER_FUNC_NAME = "DisTubeDecipherFunc";
const N_TRANSFORM_FUNC_NAME = "DisTubeNTransformFunc";

const extractDollarEscapedFirstGroup = (pattern, text) => {
  const match = text.match(pattern);
  return match ? match[1].replace(/\$/g, "\\$") : null;
};

const extractTceFunc = (body) => {
  try {
    const tceVariableMatcher = body.match(new RegExp(NEW_TCE_GLOBAL_VARS_REGEXP, 'm'));

    if (!tceVariableMatcher) return;

    const tceVariableMatcherGroups = tceVariableMatcher.groups;
    if (!tceVariableMatcher.groups) return;

    const code = tceVariableMatcherGroups.code;
    const varname = tceVariableMatcherGroups.varname;

    return { name: varname, code: code };
  } catch (e) {
    console.error("Error in extractTceFunc:", e);
    return null;
  }
}

const extractDecipherFunc = (body, name, code) => {
  try {
    const callerFunc = DECIPHER_FUNC_NAME + "(" + DECIPHER_ARGUMENT + ");";
    let resultFunc;

    const sigFunctionMatcher = body.match(new RegExp(TCE_SIGN_FUNCTION_REGEXP, 's'));
    const sigFunctionActionsMatcher = body.match(new RegExp(TCE_SIGN_FUNCTION_ACTION_REGEXP, 's'));

    if (sigFunctionMatcher && sigFunctionActionsMatcher && code) {
      resultFunc = "var " + DECIPHER_FUNC_NAME + "=" + sigFunctionMatcher[0] + sigFunctionActionsMatcher[0] + code + ";\n";
      return resultFunc + callerFunc;
    }

    const helperMatch = body.match(new RegExp(HELPER_REGEXP, "s"));
    if (!helperMatch) return null;

    const helperObject = helperMatch[0];
    const actionBody = helperMatch[2];
    const helperName = helperMatch[1];

    const reverseKey = extractDollarEscapedFirstGroup(REVERSE_PATTERN, actionBody);
    const sliceKey = extractDollarEscapedFirstGroup(SLICE_PATTERN, actionBody);
    const spliceKey = extractDollarEscapedFirstGroup(SPLICE_PATTERN, actionBody);
    const swapKey = extractDollarEscapedFirstGroup(SWAP_PATTERN, actionBody);

    const quotedFunctions = [reverseKey, sliceKey, spliceKey, swapKey]
      .filter(Boolean)
      .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (quotedFunctions.length === 0) return null;

    let funcMatch = body.match(new RegExp(DECIPHER_REGEXP, "s"));
    let isTce = false;
    let decipherFunc;

    if (funcMatch) {
      decipherFunc = funcMatch[0];
    } else {

      const tceFuncMatch = body.match(new RegExp(FUNCTION_TCE_REGEXP, "s"));
      if (!tceFuncMatch) return null;

      decipherFunc = tceFuncMatch[0];
      isTce = true;
    }

    let tceVars = "";
    if (isTce) {
      const tceVarsMatch = body.match(new RegExp(TCE_GLOBAL_VARS_REGEXP, "m"));
      if (tceVarsMatch) {
        tceVars = tceVarsMatch[1] + ";\n";
      }
    }

    resultFunc = tceVars + helperObject + "\nvar " + DECIPHER_FUNC_NAME + "=" + decipherFunc + ";\n";
    return resultFunc + callerFunc;
  } catch (e) {
    console.error("Error in extractDecipherFunc:", e);
    return null;
  }
};

const extractNTransformFunc = (body, name, code) => {
  try {
    const callerFunc = N_TRANSFORM_FUNC_NAME + "(" + N_ARGUMENT + ");";
    let resultFunc;
    let nFunction;

    const nFunctionMatcher = body.match(new RegExp(TCE_N_FUNCTION_REGEXP, 's'));

    if (nFunctionMatcher && name && code) {
      nFunction = nFunctionMatcher[0];

      const tceEscapeName = name.replace("$", "\\$");
      const shortCircuitPattern = new RegExp(
        `;\\s*if\\s*\\(\\s*typeof\\s+[a-zA-Z0-9_$]+\\s*===?\\s*(?:\"undefined\"|'undefined'|${tceEscapeName}\\[\\d+\\])\\s*\\)\\s*return\\s+\\w+;`
      );

      const tceShortCircuitMatcher = nFunction.match(shortCircuitPattern);

      if (tceShortCircuitMatcher) {
        nFunction = nFunction.replaceAll(tceShortCircuitMatcher[0], ";");
      }

      resultFunc = "var " + N_TRANSFORM_FUNC_NAME + "=" + nFunction + code + ";\n";
      return resultFunc + callerFunc;
    }

    let nMatch = body.match(new RegExp(N_TRANSFORM_REGEXP, "s"));
    let isTce = false;

    if (nMatch) {
      nFunction = nMatch[0];
    } else {

      const nTceMatch = body.match(new RegExp(N_TRANSFORM_TCE_REGEXP, "s"));
      if (!nTceMatch) return null;

      nFunction = nTceMatch[0];
      isTce = true;
    }

    const paramMatch = nFunction.match(/function\s*\(\s*(\w+)\s*\)/);
    if (!paramMatch) return null;

    const paramName = paramMatch[1];

    const cleanedFunction = nFunction.replace(
      new RegExp(`if\\s*\\(typeof\\s*[^\\s()]+\\s*===?.*?\\)return ${paramName}\\s*;?`, "g"),
      ""
    );

    let tceVars = "";
    if (isTce) {
      const tceVarsMatch = body.match(new RegExp(TCE_GLOBAL_VARS_REGEXP, "m"));
      if (tceVarsMatch) {
        tceVars = tceVarsMatch[1] + ";\n";
      }
    }

    resultFunc = tceVars + "var " + N_TRANSFORM_FUNC_NAME + "=" + cleanedFunction + ";\n";
    return resultFunc + callerFunc;
  } catch (e) {
    console.error("Error in extractNTransformFunc:", e);
    return null;
  }
};

let decipherWarning = true;
let nTransformWarning = true;

// === Dispatch-based extraction for newer player formats ===
// These handle the obfuscated dispatch pattern where functions are routed through
// multi-purpose dispatch functions with a numeric selector parameter.

const extractFuncFromBody = (body, name) => {
  const escaped = name.replace(/\$/g, '\\$');
  const idx = body.search(new RegExp(`(?:^|[;\\n,])\\s*(?:var\\s+)?${escaped}\\s*=\\s*function`));
  if (idx < 0) return null;
  const funcStart = body.indexOf(name + '=', idx);
  if (funcStart < 0) return null;
  let depth = 0, started = false, i = funcStart;
  while (i < funcStart + 50000) {
    const c = body[i];
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < body.length) { if (body[i] === '\\') { i += 2; continue; } if (body[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '/' && i > 0) {
      const prev = body.substring(Math.max(0, i - 5), i).trimEnd();
      const lastCh = prev[prev.length - 1];
      if (',=([!&|;:{+-*/%^~?:'.includes(lastCh) || prev.endsWith('return')) {
        i++;
        while (i < body.length && body[i] !== '/') { if (body[i] === '\\') i++; i++; }
        i++; continue;
      }
    }
    if (c === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i++; continue; }
    if (c === '/' && body[i + 1] === '*') { i += 2; while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{') { depth++; started = true; }
    if (c === '}') { depth--; if (started && depth === 0) return body.substring(funcStart, i + 1); }
    i++;
  }
  return null;
};

const extractKArray = (body) => {
  const kStart = body.indexOf('var K=');
  if (kStart < 0) return null;
  let inStr = false, strCh = '', parenDepth = 0, foundSplit = false;
  for (let i = kStart + 6; i < kStart + 10000; i++) {
    const c = body[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === '(') parenDepth++;
    if (c === ')') { parenDepth--; if (foundSplit && parenDepth === 0) return body.substring(kStart, i + 1); }
    if (c === '.' && body.substring(i + 1, i + 6) === 'split') foundSplit = true;
  }
  return null;
};

const extractDispatchNTransform = (body, tceVarName) => {
  try {
    const kDef = extractKArray(body);
    if (!kDef) return null;

    // Find n-transform entry: look for rXi=[funcName] or similar array with n-transform
    // Pattern: someArray=[funcName]; ... someArray[0](n_value) with .set("n", ...)
    const nSetterMatch = body.match(
      /(\w+)\[0\]\((\w+)\)\s*,\s*\w+\[(?:\w+\[\d+\]|"set")]\((?:\w+\[\d+\]|"n")/
    );
    if (!nSetterMatch) return null;

    const transformArrayName = nSetterMatch[1];
    // Find: transformArrayName = [funcName]
    const escaped = transformArrayName.replace(/\$/g, '\\$');
    const arrayDefMatch = body.match(new RegExp(`${escaped}\\s*=\\s*\\[(\\w+)\\]`));
    if (!arrayDefMatch) return null;

    const entryFuncName = arrayDefMatch[1];
    const entryFunc = extractFuncFromBody(body, entryFuncName);
    if (!entryFunc) return null;

    // Find delegate: entryFunc calls dispatchFunc.call(this, NUMBER, d)
    const delegateMatch = entryFunc.match(/return\s+(\w+)\[(?:\w+\[\d+\]|"call")]\(this\s*,\s*(\d+)\s*,\s*\w+\)/);
    if (!delegateMatch) return null;

    const mainDispatchName = delegateMatch[1];
    const mainDispatchFunc = extractFuncFromBody(body, mainDispatchName);
    if (!mainDispatchFunc) return null;

    // Find all wrapper functions referenced in the H array of mainDispatchFunc
    // Note: \b doesn't work with $ in identifiers, so use a custom pattern
    const wrapperRefs = new Set();
    const hArrayMatch = mainDispatchFunc.match(/\[[-\d]+,.*?\];/s);
    if (hArrayMatch) {
      const refs = hArrayMatch[0].match(/(?<![a-zA-Z0-9_$])([a-zA-Z_$][a-zA-Z0-9_$]*)(?![a-zA-Z0-9_$])/g);
      if (refs) refs.forEach(r => {
        if (r !== 'K' && r !== 'b' && r !== 'null' && r.length > 1) wrapperRefs.add(r);
      });
    }

    // Extract all wrappers and find additional dispatch functions they reference
    const allFuncs = new Map();
    allFuncs.set(entryFuncName, entryFunc);
    allFuncs.set(mainDispatchName, mainDispatchFunc);

    const dispatchFuncs = new Set([mainDispatchName]);
    const toProcess = [...wrapperRefs];

    for (let iteration = 0; iteration < 3 && toProcess.length > 0; iteration++) {
      const batch = toProcess.splice(0, toProcess.length);
      for (const name of batch) {
        if (allFuncs.has(name)) continue;
        const code = extractFuncFromBody(body, name);
        if (!code) continue;
        allFuncs.set(name, code);
        // Check if this wrapper references another dispatch function
        const callMatch = code.match(/return\s+(\w+)\[(?:\w+\[\d+\]|"call")]\(this/);
        if (callMatch && !allFuncs.has(callMatch[1])) {
          const dispName = callMatch[1];
          if (!dispatchFuncs.has(dispName)) {
            dispatchFuncs.add(dispName);
            const dispCode = extractFuncFromBody(body, dispName);
            if (dispCode) {
              allFuncs.set(dispName, dispCode);
              // Find wrapper refs in this dispatch function too
              const innerRefs = dispCode.match(/(?<![a-zA-Z0-9_$])([a-zA-Z_$][a-zA-Z0-9_$]{2,})(?![a-zA-Z0-9_$])/g);
              if (innerRefs) innerRefs.forEach(r => {
                if (!allFuncs.has(r) && r !== 'K' && r !== 'function' && r !== 'return' &&
                    r !== 'var' && r !== 'typeof' && r !== 'null' && r !== 'undefined' &&
                    r !== 'this' && r !== 'Math' && r !== 'String' && r !== 'Object' &&
                    r !== 'Error' && r !== 'Number' && r !== 'Array') {
                  toProcess.push(r);
                }
              });
            }
          }
        }
      }
    }

    // Also extract po helper if it exists
    const poIdx = body.indexOf('po={');
    let poCode = '';
    if (poIdx >= 0) {
      let depth = 0;
      for (let i = poIdx; i < poIdx + 500; i++) {
        if (body[i] === '{') depth++;
        if (body[i] === '}') { depth--; if (depth === 0) { poCode = 'var ' + body.substring(poIdx, i + 1) + ';\n'; break; } }
      }
    }

    // Build the complete script
    let script = kDef + ';\n';
    script += 'var g={zV:function(){},U:function(){},GV:function(){},lQ:Error};\n';
    script += 'var xA0="";\n';
    script += poCode;
    for (const [, code] of allFuncs) {
      script += 'var ' + code + ';\n';
    }
    // Remove typeof short-circuit checks
    script = script.replace(/if\s*\(\s*typeof\s+\w+\s*===?\s*(?:K\[\d+\]|"undefined"|'undefined')\s*\)\s*\{[^}]*break\s+\w+[^}]*\}/g, '');
    script += N_TRANSFORM_FUNC_NAME + '=' + entryFuncName + ';\n';
    script += N_TRANSFORM_FUNC_NAME + '(' + N_ARGUMENT + ');';

    return new vm.Script(script);
  } catch (e) {
    return null;
  }
};

const extractDispatchDecipher = (body, tceVarName) => {
  try {
    const kDef = extractKArray(body);
    if (!kDef) return null;

    // Evaluate K to get the actual strings
    const K = new vm.Script(kDef + ';K;').runInNewContext({});

    // Find the helper object: has functions for splice, swap, and reverse using K refs
    // Pattern: XXX={name1:function(d,L){d[K[splice_idx]](0,L)}, name2:function(...){swap}, name3:function(d){d[K[reverse_idx]]()}}
    const spliceIdx = K.indexOf('splice');
    const reverseIdx = K.indexOf('reverse');
    if (spliceIdx < 0 || reverseIdx < 0) return null;

    // Find helper object by looking for pattern with both splice and reverse K references
    const helperRe = new RegExp(
      `(\\w+)=\\{(\\w+:function\\(\\w,?\\w?\\)\\{[^}]+\\}[,\\n]*){2,4}\\}`,
      'g'
    );
    let helperMatch;
    let helperName, helperCode;
    while ((helperMatch = helperRe.exec(body)) !== null) {
      const code = helperMatch[0];
      if (code.includes(`K[${spliceIdx}]`) && code.includes(`K[${reverseIdx}]`)) {
        helperName = helperMatch[1];
        helperCode = code;
        break;
      }
    }
    if (!helperCode) return null;

    // Find the decipher chain - function that calls helperName[K[xxx]](array, num) multiple times
    const helperEsc = helperName.replace(/\$/g, '\\$');
    const chainRe = new RegExp(
      `${helperEsc}\\[K\\[\\d+\\]\\]\\(\\w+,\\d+\\)`,
      'g'
    );
    // Find a code region with multiple chain calls
    let chainStart = -1, chainEnd = -1, callCount = 0;
    let cm;
    while ((cm = chainRe.exec(body)) !== null) {
      if (chainStart < 0 || cm.index - chainEnd > 200) {
        chainStart = cm.index;
        callCount = 1;
      } else {
        callCount++;
      }
      chainEnd = cm.index + cm[0].length;
      if (callCount >= 2) break;
    }
    if (callCount < 2) return null;

    // Extract the chain calls
    const chainRegion = body.substring(chainStart - 100, chainEnd + 50);
    const calls = [];
    const callRe = new RegExp(`${helperEsc}\\[K\\[(\\d+)\\]\\]\\(\\w+,(\\d+)\\)`, 'g');
    let callMatch;
    while ((callMatch = callRe.exec(chainRegion)) !== null) {
      const methodIdx = parseInt(callMatch[1]);
      const methodName = K[methodIdx];
      const arg = parseInt(callMatch[2]);
      calls.push({ method: methodName, arg });
    }

    if (calls.length === 0) return null;

    // Build standalone decipher function
    let decipherBody = 'var a = sig.split("");\n';
    for (const call of calls) {
      if (call.method === K[spliceIdx]) {
        decipherBody += `a.splice(0, ${call.arg});\n`;
      } else if (call.method === K[reverseIdx]) {
        decipherBody += `a.reverse();\n`;
      } else {
        // swap operation
        decipherBody += `var t=a[0];a[0]=a[${call.arg}%a.length];a[${call.arg}%a.length]=t;\n`;
      }
    }
    decipherBody += 'return a.join("");';

    const script = `var ${DECIPHER_FUNC_NAME}=function(sig){${decipherBody}};\n${DECIPHER_FUNC_NAME}(${DECIPHER_ARGUMENT});`;
    return new vm.Script(script);
  } catch (e) {
    return null;
  }
};

const getExtractFunction = (extractFunctions, body, name, code, postProcess = null) => {
  for (const extractFunction of extractFunctions) {
    try {
      const func = extractFunction(body, name, code);
      if (!func) continue;
      return new vm.Script(postProcess ? postProcess(func) : func);
    } catch (err) {
      console.error("Failed to extract function:", err);
      continue;
    }
  }
  return null;
};

const extractDecipher = (body, name, code) => {
  const decipherFunc = getExtractFunction([extractDecipherFunc], body, name, code);
  if (!decipherFunc && !decipherWarning) {
    console.warn(
      "\x1b[33mWARNING:\x1B[0m Could not parse decipher function.\n" +
      "Stream URLs will be missing.\n" +
      `Please report this issue by uploading the "${utils.saveDebugFile(
        "player-script.js",
        body,
      )}" file on https://github.com/distubejs/ytdl-core/issues/144.`
    );
    decipherWarning = true;
  }
  return decipherFunc;
};

const extractNTransform = (body, name, code) => {
  const nTransformFunc = getExtractFunction([extractNTransformFunc], body, name, code);

  if (!nTransformFunc && !nTransformWarning) {
    console.warn(
      "\x1b[33mWARNING:\x1B[0m Could not parse n transform function.\n" +
      `Please report this issue by uploading the "${utils.saveDebugFile(
        "player-script.js",
        body,
      )}" file on https://github.com/distubejs/ytdl-core/issues/144.`
    );
    nTransformWarning = true;
  }

  return nTransformFunc;
};

exports.extractFunctions = body => {
  const tce = extractTceFunc(body);
  const name = tce?.name;
  const code = tce?.code;

  // Try standard regex-based extraction first
  let decipherScript = extractDecipher(body, name, code);
  let nTransformScript = extractNTransform(body, name, code);

  // Fallback: dispatch-based extraction for newer player formats
  if (!decipherScript) {
    decipherScript = extractDispatchDecipher(body, name);
  }
  if (!nTransformScript) {
    nTransformScript = extractDispatchNTransform(body, name);
  }

  return [decipherScript, nTransformScript];
};


exports.setDownloadURL = (format, decipherScript, nTransformScript) => {
  if (!format) return;

  if (format.url && !format.signatureCipher && !format.cipher) {
    return;
  }

  const cipher = format.signatureCipher || format.cipher;
  if (!cipher) return;

  const args = querystring.parse(cipher);
  if (!args.url) return;

  let finalUrl = decodeURIComponent(args.url);
  if (args.s && decipherScript) {
    try {
      const context = { sig: decodeURIComponent(args.s) };
      const decipheredSig = decipherScript.runInNewContext(context);
      const u = new URL(finalUrl);
      u.searchParams.set(args.sp || "sig", decipheredSig);
      finalUrl = u.toString();
    } catch {
      // gagal decipher → pakai URL asli saja
    }
  }

  try {
    const u = new URL(finalUrl);
    const n = u.searchParams.get("n");

    if (n && nTransformScript) {
      const context = { ncode: n };
      const newN = nTransformScript.runInNewContext(context);
      if (newN) u.searchParams.set("n", newN);
      finalUrl = u.toString();
    }
  } catch { }

  format.url = finalUrl;
  delete format.signatureCipher;
  delete format.cipher;
};

exports.decipherFormats = async (formats, html5player, options) => {
  const decipheredFormats = {};

  let decipherScript = null;
  let nTransformScript = null;

  try {
    [decipherScript, nTransformScript] = await exports.getFunctions(html5player, options);
  } catch (err) {
    console.warn("Could not extract player functions:", err.message);
  }

  formats.forEach(format => {
    if (format.url && !format.signatureCipher && !format.cipher) {
      // Apply n-transform even to formats with plain URLs
      if (nTransformScript && format.url) {
        try {
          const u = new URL(format.url);
          const n = u.searchParams.get("n");
          if (n) {
            const newN = nTransformScript.runInNewContext({ ncode: n });
            if (newN) u.searchParams.set("n", newN);
            format.url = u.toString();
          }
        } catch { }
      }
      decipheredFormats[format.url] = format;
      return;
    }

    exports.setDownloadURL(format, decipherScript, nTransformScript);
    if (format.url) {
      decipheredFormats[format.url] = format;
    }
  });

  return decipheredFormats;
};
