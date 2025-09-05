"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.atTypesSlash = void 0;
exports.tryParseJson = tryParseJson;
exports.parseJson = parseJson;
exports.identity = identity;
exports.isObject = isObject;
exports.withoutStart = withoutStart;
exports.computeHash = computeHash;
exports.isScopedPackage = isScopedPackage;
exports.unmangleScopedPackage = unmangleScopedPackage;
exports.mangleScopedPackage = mangleScopedPackage;
exports.isTypesPackageName = isTypesPackageName;
exports.trimAtTypesPrefixIfPresent = trimAtTypesPrefixIfPresent;
exports.mustTrimAtTypesPrefix = mustTrimAtTypesPrefix;
exports.typesPackageNameToRealName = typesPackageNameToRealName;
exports.sleep = sleep;
exports.isDeclarationPath = isDeclarationPath;
const crypto_1 = __importDefault(require("crypto"));
const minimatch_1 = require("minimatch");
function tryParseJson(text, predicate) {
    try {
        return parseJson(text, predicate);
    }
    catch {
        return undefined;
    }
}
function parseJson(text, predicate = (_) => true) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (err) {
        throw new Error(`${err.message} due to JSON: ${text}`);
    }
    if (!predicate(parsed)) {
        throw new Error("Parsed JSON did not match required form");
    }
    return parsed;
}
function identity(t) {
    return t;
}
function isObject(value) {
    return !!value && typeof value === "object";
}
function withoutStart(s, start) {
    return s.startsWith(start) ? s.slice(start.length) : undefined;
}
function computeHash(content) {
    // Normalize line endings
    const normalContent = content.replace(/\r\n?/g, "\n");
    const h = crypto_1.default.createHash("sha256");
    h.update(normalContent, "utf8");
    return h.digest("hex");
}
function isScopedPackage(packageName) {
    return packageName.startsWith("@");
}
// Based on `getPackageNameFromAtTypesDirectory` in TypeScript.
function unmangleScopedPackage(packageName) {
    const separator = "__";
    return packageName.includes(separator) ? `@${packageName.replace(separator, "/")}` : undefined;
}
// Reverts unmangleScopedPackage.
function mangleScopedPackage(packageName) {
    return isScopedPackage(packageName) ? packageName.replace(/\//, "__").replace("@", "") : packageName;
}
exports.atTypesSlash = "@types/";
function isTypesPackageName(packageName) {
    return packageName.startsWith(exports.atTypesSlash);
}
function trimAtTypesPrefix(packageName) {
    return packageName.slice(exports.atTypesSlash.length);
}
function trimAtTypesPrefixIfPresent(packageName) {
    if (isTypesPackageName(packageName)) {
        return trimAtTypesPrefix(packageName);
    }
    return packageName;
}
function mustTrimAtTypesPrefix(packageName) {
    if (!isTypesPackageName(packageName)) {
        throw new Error(`Not a types package name: ${packageName}`);
    }
    return trimAtTypesPrefix(packageName);
}
function typesPackageNameToRealName(typesPackageName) {
    const name = mustTrimAtTypesPrefix(typesPackageName);
    return unmangleScopedPackage(name) ?? name;
}
async function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
const declarationMatcher = new minimatch_1.Minimatch("**/*.d.{ts,cts,mts,*.ts}", { optimizationLevel: 2 });
function isDeclarationPath(path) {
    if (process.platform === "win32") {
        path = path.replace(/\\/g, "/");
    }
    return declarationMatcher.match(path);
}
//# sourceMappingURL=miscellany.js.map