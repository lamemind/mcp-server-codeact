#!/usr/bin/env node

import {parseCliArguments} from "./server/cli-arguments.js";
import {readConfigFile} from "./server/json-config.js";
import {startMainServer} from "./server/main-mcp-server.js";


(async function () {
    console.error(`Starting MCP Server Wrapper...`);
    const cliArguments = await parseCliArguments();

    const wrapperConfig = readConfigFile(cliArguments.configFile);
    console.error(wrapperConfig);

    await startMainServer(wrapperConfig);

})();



