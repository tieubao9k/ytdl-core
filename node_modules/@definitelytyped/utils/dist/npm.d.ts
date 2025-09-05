import { Logger } from "./logging";
export declare const npmRegistryHostName = "registry.npmjs.org";
export declare const npmRegistry = "https://registry.npmjs.org/";
export declare const cacheDir: string;
type NeedToFixNpmRegistryClientTypings = any;
export declare class NpmPublishClient {
    private readonly client;
    private readonly auth;
    private readonly registry;
    static create(token: string, config?: NeedToFixNpmRegistryClientTypings): Promise<NpmPublishClient>;
    private constructor();
    publish(publishedDirectory: string, packageJson: {}, dry: boolean, log: Logger): Promise<void>;
    tag(packageName: string, version: string, distTag: string, dry: boolean, log: Logger): Promise<void>;
    deprecate(packageName: string, version: string, message: string): Promise<void>;
}
export {};
