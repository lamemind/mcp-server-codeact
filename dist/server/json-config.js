import * as fs from "node:fs";
import { ServerConfigSchema } from "./server-config-schema.js";
import z from "zod";
function validateConfig(config) {
    console.error(`Validating configuration...`);
    return ServerConfigSchema.parse(config);
}
function readConfigFile(filePath) {
    console.error(`Reading config file from: ${filePath}`);
    const jsonContent = fs.readFileSync(filePath, 'utf8');
    const jsonRaw = JSON.parse(jsonContent);
    try {
        return validateConfig(jsonRaw);
    }
    catch (error) {
        if (error instanceof z.ZodError)
            console.error('Validation errors:', error.errors);
        throw error;
    }
}
const DEFAULT_CONFIG = {
    security: {
        maxBatchSize: 50,
        maxConcurrentBatches: 5,
        maxOperationTimeout: 30,
        maxBatchTimeout: 300,
        allowedPaths: ["C:/codeact-temp"],
        blockedCommands: ['rm', 'del', 'format', 'shutdown', 'regedit'],
        enableSandbox: true,
    },
    runtimes: {
        node: { enabled: false, command: 'node', timeout: 30 },
        php: { enabled: false, command: 'php', timeout: 30 },
        python: { enabled: false, command: 'python', timeout: 30 },
    },
    cleanupInterval: 300,
    maxBatchHistory: 100,
};
export { readConfigFile, DEFAULT_CONFIG };
