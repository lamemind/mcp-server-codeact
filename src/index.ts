#!/usr/bin/env node

import { parseCliArguments } from "./server/cli-arguments.js";
import { readConfigFile } from "./server/json-config.js";
import { startMcpServer } from "./server/mcp-server.js";


(async function () {
    console.error(`Starting MCP Server Wrapper...`);
    const cliArguments = await parseCliArguments();

    const serverConfig = readConfigFile(cliArguments.configFile);
    console.error(serverConfig);

    await startMcpServer(serverConfig);

})();



