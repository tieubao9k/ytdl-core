"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDefined = assertDefined;
exports.assertNever = assertNever;
exports.fail = fail;
exports.assertSorted = assertSorted;
exports.deepEquals = deepEquals;
const assert_1 = __importDefault(require("assert"));
function assertDefined(x, message) {
    if (x === undefined) {
        debugger;
    }
    (0, assert_1.default)(x !== undefined, message);
    return x;
}
function assertNever(member, message = "Illegal value:", stackCrawlMark) {
    const detail = JSON.stringify(member);
    return fail(`${message} ${detail}`, stackCrawlMark || assertNever);
}
function fail(message, stackCrawlMark) {
    debugger;
    const e = new Error(message ? `Debug Failure. ${message}` : "Debug Failure.");
    if (Error.captureStackTrace) {
        Error.captureStackTrace(e, stackCrawlMark || fail);
    }
    throw e;
}
function assertSorted(a, cb = (t) => t) {
    let prev = a[0];
    for (let i = 1; i < a.length; i++) {
        const x = a[i];
        (0, assert_1.default)(cb(x) >= cb(prev), `${JSON.stringify(x)} >= ${JSON.stringify(prev)}`);
        prev = x;
    }
    return a;
}
function deepEquals(expected, actual) {
    if (Array.isArray(expected)) {
        return (Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => deepEquals(e, actual[i])));
    }
    else if (typeof expected === "object" && typeof actual === "object" && actual !== null) {
        for (const k in expected) {
            if (!deepEquals(expected[k], actual[k])) {
                return false;
            }
        }
        return true;
    }
    else {
        return expected === actual;
    }
}
//# sourceMappingURL=assertions.js.map