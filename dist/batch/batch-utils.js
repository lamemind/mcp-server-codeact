export function validateOperation(config, operation, workdir) {
    // Security validation based on config
    if (!isPathAllowed(config, workdir)) {
        throw new Error(`Working directory not allowed: ${workdir}`);
    }
    // Additional operation-specific validation could go here
}
export function validatePath(config, path) {
    if (!isPathAllowed(config, path)) {
        throw new Error(`Path not allowed: ${path}`);
    }
}
function isPathAllowed(config, testPath) {
    return config.security.allowedPaths.some(allowedPath => testPath.startsWith(allowedPath));
}
