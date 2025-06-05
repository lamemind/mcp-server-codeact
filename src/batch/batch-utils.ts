import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";


export function validateOperation(config: ServerConfig, operation: BatchOperation, workdir: string): void {
    // Security validation based on config
    if (!isPathAllowed(config, workdir)) {
        throw new Error(`Working directory not allowed: ${workdir}`);
    }

    // Additional operation-specific validation could go here
}

export function validatePath(config: ServerConfig, path: string): void {
    if (!isPathAllowed(config, path)) {
        throw new Error(`Path not allowed: ${path}`);
    }
}

function isPathAllowed(config: ServerConfig, testPath: string): boolean {
    return config.security.workspaces.some(ws =>
        testPath.startsWith(ws.fullpath)
    );
}
