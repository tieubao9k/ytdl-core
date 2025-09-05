import { AllTypeScriptVersion } from "@definitelytyped/typescript-versions";
export interface Header {
    readonly nonNpm: boolean | "conflict";
    readonly nonNpmDescription?: string;
    readonly name: string;
    readonly libraryMajorVersion: number;
    readonly libraryMinorVersion: number;
    readonly minimumTypeScriptVersion: AllTypeScriptVersion;
    readonly projects: readonly string[];
    readonly owners: readonly Owner[];
    readonly tsconfigs: readonly string[];
}
/** Standard package.json `contributor` */
export interface Contributor {
    readonly name: string;
    readonly url: string;
}
/** Additional github-specific form supported on DT. */
export type Owner = Contributor | {
    readonly name: string;
    readonly githubUsername: string;
    readonly url?: undefined;
};
export declare function makeTypesVersionsForPackageJson(typesVersions: readonly AllTypeScriptVersion[]): unknown;
export declare function validatePackageJson(typesDirectoryName: string, packageJson: Record<string, unknown>, typesVersions: readonly AllTypeScriptVersion[]): Header | string[];
export declare function getTypesVersions(dirPath: string): readonly AllTypeScriptVersion[];
export declare const enum License {
    MIT = "MIT",
    Apache20 = "Apache-2.0"
}
export declare function getLicenseFromPackageJson(packageJsonLicense: unknown): License | string[];
export declare function checkPackageJsonExportsAndAddPJsonEntry(exports: unknown, path: string): string | object | undefined;
export declare function checkPackageJsonImports(imports: unknown, path: string): object | string[] | undefined;
export declare function checkPackageJsonType(type: unknown, path: string): string[] | "module" | undefined;
/**
 * @param devDependencySelfName - pass the package name only for devDependencies
 */
export declare function checkPackageJsonDependencies(dependencies: unknown, path: string, allowedDependencies: ReadonlySet<string>, devDependencySelfName?: string): string[];
