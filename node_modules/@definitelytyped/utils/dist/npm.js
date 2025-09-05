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
exports.NpmPublishClient = exports.cacheDir = exports.npmRegistry = exports.npmRegistryHostName = void 0;
const os = __importStar(require("os"));
const process_1 = __importDefault(require("process"));
const fs_1 = __importDefault(require("fs"));
const npm_registry_client_1 = __importDefault(require("@qiwi/npm-registry-client"));
const url_1 = require("url");
const fs_2 = require("./fs");
const io_1 = require("./io");
exports.npmRegistryHostName = "registry.npmjs.org";
exports.npmRegistry = `https://${exports.npmRegistryHostName}/`;
exports.cacheDir = (0, fs_2.joinPaths)(process_1.default.env.GITHUB_ACTIONS ? (0, fs_2.joinPaths)(__dirname, "../../..") : os.tmpdir(), "cache");
class NpmPublishClient {
    client;
    auth;
    registry;
    static async create(token, config) {
        return new NpmPublishClient(new npm_registry_client_1.default(config), { token }, exports.npmRegistry);
    }
    constructor(client, auth, registry) {
        this.client = client;
        this.auth = auth;
        this.registry = registry;
    }
    async publish(publishedDirectory, packageJson, dry, log) {
        const readme = await fs_1.default.promises.readFile((0, fs_2.joinPaths)(publishedDirectory, "README.md"));
        return new Promise((resolve, reject) => {
            const body = (0, io_1.createTgz)(publishedDirectory, reject);
            const metadata = { readme, ...packageJson };
            if (dry) {
                log(`(dry) Skip publish of ${publishedDirectory} to ${this.registry}`);
            }
            resolve(dry
                ? undefined
                : promisifyVoid((cb) => {
                    this.client.publish(this.registry, {
                        access: "public",
                        auth: this.auth,
                        metadata: metadata,
                        body: body,
                    }, cb);
                }));
        });
    }
    tag(packageName, version, distTag, dry, log) {
        if (dry) {
            log(`(dry) Skip tag of ${packageName}@${distTag} as ${version}`);
            return Promise.resolve();
        }
        return promisifyVoid((cb) => {
            this.client.distTags.add(this.registry, { package: packageName, version, distTag, auth: this.auth }, cb);
        });
    }
    deprecate(packageName, version, message) {
        const url = (0, url_1.resolve)(exports.npmRegistry, packageName);
        const params = {
            message,
            version,
            auth: this.auth,
        };
        return promisifyVoid((cb) => {
            this.client.deprecate(url, params, cb);
        });
    }
}
exports.NpmPublishClient = NpmPublishClient;
function promisifyVoid(callsBack) {
    return new Promise((resolve, reject) => {
        callsBack((error) => {
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
//# sourceMappingURL=npm.js.map