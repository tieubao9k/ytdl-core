"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initArray = initArray;
exports.mapValues = mapValues;
exports.mapDefined = mapDefined;
exports.mapDefinedAsync = mapDefinedAsync;
exports.sort = sort;
exports.join = join;
exports.split = split;
exports.addRange = addRange;
exports.append = append;
exports.isArray = isArray;
exports.flatMap = flatMap;
exports.unique = unique;
exports.min = min;
exports.max = max;
exports.compact = compact;
exports.symmetricDifference = symmetricDifference;
function initArray(length, makeElement) {
    const arr = new Array(length);
    for (let i = 0; i < length; i++) {
        arr[i] = makeElement(i);
    }
    return arr;
}
function mapValues(map, valueMapper) {
    const out = new Map();
    map.forEach((value, key) => {
        out.set(key, valueMapper(value));
    });
    return out;
}
function mapDefined(arr, mapper) {
    const out = [];
    for (const a of arr) {
        const res = mapper(a);
        if (res !== undefined) {
            out.push(res);
        }
    }
    return out;
}
async function mapDefinedAsync(arr, mapper) {
    const out = [];
    for (const a of arr) {
        const res = await mapper(a);
        if (res !== undefined) {
            out.push(res);
        }
    }
    return out;
}
function sort(values, comparer) {
    return Array.from(values).sort(comparer);
}
function join(values, joiner = ", ") {
    let s = "";
    for (const v of values) {
        s += `${v}${joiner}`;
    }
    return s.slice(0, s.length - joiner.length);
}
/** Returns [values that cb returned undefined for, defined results of cb]. */
function split(inputs, cb) {
    const keep = [];
    const splitOut = [];
    for (const input of inputs) {
        const res = cb(input);
        if (res === undefined) {
            keep.push(input);
        }
        else {
            splitOut.push(res);
        }
    }
    return [keep, splitOut];
}
/**
 * Gets the actual offset into an array for a relative offset. Negative offsets indicate a
 * position offset from the end of the array.
 */
function toOffset(array, offset) {
    return offset < 0 ? array.length + offset : offset;
}
function addRange(to, from, start, end) {
    if (from === undefined || from.length === 0)
        return to;
    if (to === undefined)
        return from.slice(start, end);
    start = start === undefined ? 0 : toOffset(from, start);
    end = end === undefined ? from.length : toOffset(from, end);
    for (let i = start; i < end && i < from.length; i++) {
        if (from[i] !== undefined) {
            to.push(from[i]);
        }
    }
    return to;
}
function append(to, value) {
    if (value === undefined)
        return to;
    if (to === undefined)
        return [value];
    to.push(value);
    return to;
}
/**
 * Tests whether a value is an array.
 */
function isArray(value) {
    return Array.isArray ? Array.isArray(value) : value instanceof Array;
}
/**
 * Maps an array. The mapped value is spread into the result.
 *
 * @param array The array to map.
 * @param mapfn The callback used to map the result into one or more values.
 */
function flatMap(array, mapfn) {
    let result;
    if (array) {
        for (let i = 0; i < array.length; i++) {
            result = addRange(result, mapfn(array[i], i));
        }
    }
    return result || [];
}
function unique(arr) {
    return [...new Set(arr)];
}
function min(array, compare) {
    return array.length === 0
        ? undefined
        : array.reduce((previousValue, currentValue) => (compare ? compare(currentValue, previousValue) < 0 : currentValue < previousValue)
            ? currentValue
            : previousValue);
}
function max(array, compare) {
    return array.length === 0
        ? undefined
        : array.reduce((previousValue, currentValue) => (compare ? compare(currentValue, previousValue) > 0 : currentValue > previousValue)
            ? currentValue
            : previousValue);
}
function compact(array) {
    return array.filter((x) => x !== undefined);
}
function symmetricDifference(a, b) {
    const result = new Set(a);
    for (const elem of b) {
        if (result.has(elem)) {
            result.delete(elem);
        }
        else {
            result.add(elem);
        }
    }
    return result;
}
//# sourceMappingURL=collections.js.map