#!/usr/bin/env node

import { parseCliArguments } from "./server/cli-arguments.js";
import { DEFAULT_CONFIG, readConfigFile } from "./server/json-config.js";
import { startMcpServer } from "./server/mcp-server.js";


(async function () {
    console.error(`Starting MCP Server CodeAct...`);
    const cliArguments = await parseCliArguments();

    const serverConfig = cliArguments.configFile
        ? readConfigFile(cliArguments.configFile)
        : DEFAULT_CONFIG
    console.error(serverConfig);

    await startMcpServer(serverConfig);

})();



