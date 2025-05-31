import * as fs from "node:fs";
import { ServerConfig, ServerConfigSchema } from "./server-config-schema.js";
import z from "zod";


function validateConfig(config: unknown): ServerConfig {
    console.error(`Validating configuration...`);
    return ServerConfigSchema.parse(config);
}

function readConfigFile(filePath: string): ServerConfig {
    console.error(`Reading config file from: ${filePath}`);
    const jsonContent = fs.readFileSync(filePath, 'utf8');
    const jsonRaw = JSON.parse(jsonContent);

    try {
        return validateConfig(jsonRaw);
    } catch (error) {
        if (error instanceof z.ZodError)
            console.error('Validation errors:', error.errors);
        throw error;
    }
}

export { readConfigFile };
