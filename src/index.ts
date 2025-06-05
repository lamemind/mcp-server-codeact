#!/usr/bin/env node

import { isAbsolute, resolve } from "path";
import { parseCliArguments } from "./server/cli-arguments.js";
import { DEFAULT_CONFIG, readConfigFile } from "./server/json-config.js";
import { startMcpServer } from "./server/mcp-server.js";
import { dump } from "./utils/regular-utils.js";


(async function () {
    console.error(`Starting MCP Server CodeAct...`);
    const cliArguments = await parseCliArguments();

    const serverConfig = cliArguments.configFile
        ? readConfigFile(cliArguments.configFile)
        : DEFAULT_CONFIG
    serverConfig.security.workspaces.forEach(ws => {
        if (!isAbsolute(ws.fullpath))
            throw new Error(`Workspace path must be absolute: ${ws.fullpath}`);
        ws.fullpath = resolve(ws.fullpath);
    });
    dump(serverConfig);

    await startMcpServer(serverConfig);

})();



