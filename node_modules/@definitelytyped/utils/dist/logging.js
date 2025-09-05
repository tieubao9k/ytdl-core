"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consoleLogger = void 0;
exports.quietLogger = quietLogger;
exports.logger = logger;
exports.quietLoggerWithErrors = quietLoggerWithErrors;
exports.loggerWithErrors = loggerWithErrors;
exports.moveLogs = moveLogs;
exports.moveLogsWithErrors = moveLogsWithErrors;
exports.logPath = logPath;
exports.writeLog = writeLog;
exports.joinLogWithErrors = joinLogWithErrors;
exports.cleanLogDirectory = cleanLogDirectory;
const fs_1 = __importDefault(require("fs"));
const settings_1 = require("./lib/settings");
const fs_2 = require("./fs");
const io_1 = require("./io");
/** Logger that *just* outputs to the console and does not save anything. */
exports.consoleLogger = {
    info: console.log,
    error: console.error,
};
/** Logger that *just* records writes and does not output to console. */
function quietLogger() {
    const logged = [];
    return [(message) => logged.push(message), () => logged];
}
/** Performs a side-effect and also records all logs. */
function alsoConsoleLogger(consoleLog) {
    const [log, logResult] = quietLogger();
    return [
        (message) => {
            consoleLog(message);
            log(message);
        },
        logResult,
    ];
}
/** Logger that writes to console in addition to recording a result. */
function logger() {
    return alsoConsoleLogger(exports.consoleLogger.info);
}
/** Helper for creating `info` and `error` loggers together. */
function loggerWithErrorsHelper(loggerOrQuietLogger) {
    const [info, infoResult] = loggerOrQuietLogger();
    const [error, errorResult] = loggerOrQuietLogger();
    return [{ info, error }, () => ({ infos: infoResult(), errors: errorResult() })];
}
/** Records `info` and `error` messages without writing to console. */
function quietLoggerWithErrors() {
    return loggerWithErrorsHelper(quietLogger);
}
/** Records `info` and `error` messages, calling appropriate console methods as well. */
function loggerWithErrors() {
    return loggerWithErrorsHelper(logger);
}
/**
 * Move everything from one Log to another logger.
 * This is useful for performing several tasks in parallel, but outputting their logs in sequence.
 */
function moveLogs(dest, src, mapper) {
    for (const line of src) {
        dest(mapper ? mapper(line) : line);
    }
}
/** Perform `moveLogs` for both parts of a LogWithErrors. */
function moveLogsWithErrors(dest, { infos, errors }, mapper) {
    moveLogs(dest.info, infos, mapper);
    moveLogs(dest.error, errors, mapper);
}
function logPath(logName) {
    return (0, fs_2.joinPaths)(settings_1.logDir, logName);
}
async function writeLog(logName, contents) {
    await fs_1.default.promises.mkdir(settings_1.logDir, { recursive: true });
    await (0, io_1.writeFile)(logPath(logName), contents.join("\r\n"));
}
function joinLogWithErrors({ infos, errors }) {
    return errors.length ? infos.concat(["", "=== ERRORS ===", ""], errors) : infos;
}
function cleanLogDirectory() {
    fs_1.default.rmSync(settings_1.logDir, { recursive: true, force: true });
}
//# sourceMappingURL=logging.js.map