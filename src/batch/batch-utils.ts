import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";


export function validateOperation(config: ServerConfig, operation: BatchOperation, workdir: string): void {
    // Security validation based on config
    if (!isPathAllowed(config, workdir)) {
        throw new Error(`Working directory not allowed: ${workdir}`);
    }

    // Additional operation-specific validation could go here
}

function isPathAllowed(config: ServerConfig, testPath: string): boolean {
    return config.security.allowedPaths.some(allowedPath =>
        testPath.startsWith(allowedPath)
    );
}

export function resolveWorkdir(config: ServerConfig, workdir?: string): string {
    const resolved = workdir || process.cwd();

    if (!isPathAllowed(config, resolved)) {
        throw new Error(`Working directory not allowed: ${resolved}`);
    }

    return resolved;
}