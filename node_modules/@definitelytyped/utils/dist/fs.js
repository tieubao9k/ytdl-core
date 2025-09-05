"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskFS = exports.InMemoryFS = exports.Dir = exports.suggestionsDir = void 0;
exports.normalizeSlashes = normalizeSlashes;
exports.hasWindowsSlashes = hasWindowsSlashes;
exports.joinPaths = joinPaths;
const assert_1 = __importDefault(require("assert"));
const path_1 = __importStar(require("path"));
const getCacheDir = require("cachedir");
const assertions_1 = require("./assertions");
const fs_1 = __importDefault(require("fs"));
const io_1 = require("./io");
/** The directory to read/write suggestsions from */
exports.suggestionsDir = path_1.default.join(getCacheDir("dts"), "suggestions");
/** Convert a path to use "/" instead of "\\" for consistency. (This affects content hash.) */
function normalizeSlashes(path) {
    return path.replace(/\\/g, "/");
}
function hasWindowsSlashes(path) {
    return path.includes("\\");
}
/** Always use "/" for consistency. (This affects package content hash.) */
function joinPaths(...paths) {
    return paths.join("/");
}
// Map entries are Dir for directory and string for file.
class Dir extends Map {
    parent;
    constructor(parent) {
        super();
        this.parent = parent;
    }
    subdir(name) {
        const x = this.get(name);
        if (x !== undefined) {
            if (typeof x === "string") {
                throw new Error(`File ${name} has same name as a directory?`);
            }
            return x;
        }
        const res = new Dir(this);
        this.set(name, res);
        return res;
    }
    finish() {
        const out = new Dir(this.parent);
        for (const key of Array.from(this.keys()).sort()) {
            const subDirOrFile = this.get(key);
            out.set(key, typeof subDirOrFile === "string" ? subDirOrFile : subDirOrFile.finish());
        }
        return out;
    }
}
exports.Dir = Dir;
function ensureTrailingSlash(dir) {
    return dir.endsWith("/") ? dir : dir + "/";
}
class InMemoryFS {
    curDir;
    rootPrefix;
    constructor(curDir, rootPrefix) {
        this.curDir = curDir;
        this.rootPrefix = rootPrefix;
        this.rootPrefix = ensureTrailingSlash(rootPrefix);
        (0, assert_1.default)(rootPrefix[0] === "/", `rootPrefix must be absolute: ${rootPrefix}`);
    }
    tryGetEntry(path) {
        if (path[0] === "/") {
            path = path_1.posix.relative(this.rootPrefix, path);
        }
        if (path === "") {
            return this.curDir;
        }
        const needsDir = path.endsWith("/");
        if (needsDir) {
            path = path.slice(0, -1);
        }
        const components = path.split("/");
        const baseName = (0, assertions_1.assertDefined)(components.pop());
        let dir = this.curDir;
        for (const component of components) {
            const entry = component === ".." ? dir.parent : dir.get(component);
            if (entry === undefined) {
                return undefined;
            }
            if (!(entry instanceof Dir)) {
                throw new Error(`No file system entry at ${this.rootPrefix}/${path}. Siblings are: ${Array.from(dir.keys()).toString()}`);
            }
            dir = entry;
        }
        const res = dir.get(baseName);
        return needsDir ? (res instanceof Dir ? res : undefined) : res;
    }
    getEntry(path) {
        const entry = this.tryGetEntry(path);
        if (entry === undefined) {
            throw new Error(`No file system entry at ${this.rootPrefix}/${path}`);
        }
        return entry;
    }
    getDir(dirPath) {
        const res = this.getEntry(dirPath);
        if (!(res instanceof Dir)) {
            throw new Error(`${this.rootPrefix}/${dirPath} is a file, not a directory.`);
        }
        return res;
    }
    readFile(filePath) {
        const res = this.getEntry(filePath);
        if (typeof res !== "string") {
            throw new Error(`${this.rootPrefix}/${filePath} is a directory, not a file.`);
        }
        return res;
    }
    readdir(dirPath) {
        return Array.from((dirPath === undefined ? this.curDir : this.getDir(dirPath)).keys());
    }
    readJson(path) {
        return JSON.parse(this.readFile(path));
    }
    isDirectory(path) {
        return typeof this.getEntry(path) !== "string";
    }
    exists(path) {
        return this.tryGetEntry(path) !== undefined;
    }
    subDir(path) {
        (0, assert_1.default)(path[0] !== "/", "Cannot use absolute paths with InMemoryFS.subDir");
        return new InMemoryFS(this.getDir(path), path_1.posix.join(this.rootPrefix, path));
    }
    debugPath() {
        return this.rootPrefix;
    }
    realPath(path) {
        if (this.exists(path)) {
            return path;
        }
        throw new Error(`No file system entry at ${this.rootPrefix}/${path}`);
    }
}
exports.InMemoryFS = InMemoryFS;
class DiskFS {
    rootPrefix;
    constructor(rootPrefix) {
        this.rootPrefix = rootPrefix;
        (0, assert_1.default)(path_1.default.isAbsolute(rootPrefix), "DiskFS must use absolute paths");
        this.rootPrefix = ensureTrailingSlash(rootPrefix);
    }
    getPath(path) {
        return path_1.default.resolve(this.rootPrefix, path ?? "");
    }
    readdir(dirPath) {
        return fs_1.default
            .readdirSync(this.getPath(dirPath))
            .sort()
            .filter((name) => name !== ".DS_Store");
    }
    isDirectory(dirPath) {
        return fs_1.default.statSync(this.getPath(dirPath)).isDirectory();
    }
    readJson(path) {
        return (0, io_1.readJsonSync)(this.getPath(path));
    }
    readFile(path) {
        return (0, io_1.readFileSync)(this.getPath(path));
    }
    exists(path) {
        return fs_1.default.existsSync(this.getPath(path));
    }
    subDir(path) {
        return new DiskFS(`${this.rootPrefix}${path}/`);
    }
    debugPath() {
        return this.rootPrefix.slice(0, this.rootPrefix.length - 1); // remove trailing '/'
    }
    realPath(path) {
        return fs_1.default.realpathSync(this.getPath(path));
    }
}
exports.DiskFS = DiskFS;
//# sourceMappingURL=fs.js.map