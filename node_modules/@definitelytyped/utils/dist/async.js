"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nAtATime = nAtATime;
exports.filter = filter;
exports.filterNAtATimeOrdered = filterNAtATimeOrdered;
exports.logUncaughtErrors = logUncaughtErrors;
exports.retry = retry;
const progress_1 = require("./progress");
const collections_1 = require("./collections");
const miscellany_1 = require("./miscellany");
async function nAtATime(n, inputs, use, progressOptions) {
    const progress = progressOptions ? new progress_1.ProgressBar({ name: progressOptions.name }) : undefined;
    const results = new Array(inputs.length);
    // We have n "threads" which each run `continuouslyWork`.
    // They all share `nextIndex`, so each work item is done only once.
    let nextIndex = 0;
    await Promise.all((0, collections_1.initArray)(n, async () => {
        while (nextIndex !== inputs.length) {
            const index = nextIndex;
            nextIndex++;
            const input = inputs[index];
            const output = await use(input);
            results[index] = output;
            if (progress) {
                progress.update(index / inputs.length, progressOptions.flavor(input, output));
            }
        }
    }));
    if (progress) {
        progress.done();
    }
    return results;
}
function filter(iterable, predicate) {
    const iter = iterable[Symbol.iterator]();
    return {
        [Symbol.iterator]() {
            return this;
        },
        next() {
            while (true) {
                const res = iter.next();
                if (res.done || predicate(res.value)) {
                    return res;
                }
            }
        },
    };
}
async function filterNAtATimeOrdered(n, inputs, shouldKeep, progress) {
    const shouldKeeps = await nAtATime(n, inputs, shouldKeep, progress);
    return inputs.filter((_, idx) => shouldKeeps[idx]);
}
function logUncaughtErrors(promise) {
    return (typeof promise === "function" ? promise() : promise).catch((error) => {
        if (error && error.stack) {
            console.error(error.stack);
        }
        else {
            console.error(error);
        }
        process.exit(1);
    });
}
async function retry(fn, count, delaySeconds) {
    let lastError;
    for (let i = 0; i < count; i++) {
        try {
            return await fn();
        }
        catch (e) {
            await (0, miscellany_1.sleep)(delaySeconds);
            lastError = e;
        }
    }
    throw lastError;
}
//# sourceMappingURL=async.js.map