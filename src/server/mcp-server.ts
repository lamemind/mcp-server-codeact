import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServerConfig } from "./server-config-schema.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BatchExecuteRequestSchema, BatchExecuteRequest, AwaitRequest } from "../types/tool-batch-schema.js";
import { BatchExecutor } from "../batch/batch-executor-2.js";

export async function startMainServer(config: ServerConfig): Promise<void> {
    console.error(`Starting MCP Server CodeAct...`);

    const mcpServer = new McpServer({
        name: `mcp-server-codeact`,
        serverName: `MCP Server CodeAct`,
        version: "1.0.0"
    }, {
        capabilities: {
            prompts: {},
            resources: {},
            tools: {}
        }
    });

    const executor = new BatchExecutor(config);

    // @ts-ignore
    mcpServer.tool(`batch-execute`, "description", BatchExecuteRequestSchema, async (args: BatchExecuteRequest) => {
        console.error(`Received batch execute request:`, args);
        return await executor.executeBatch(args);
    });

    // @ts-ignore
    mcpServer.tool(`batch-await`, "description", BatchExecuteRequestSchema, async (args: AwaitRequest) => {
        console.error(`Received batch execute request:`, args);
        return await executor.awaitBatch(args.batchId, {
            timeout: args.timeout,
            killOnTimeout: args.killOnTimeout
        });
    });

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    process.on('SIGINT', async () => {
        await executor.killAllBeofreShutdown();
        process.exit(0);
    });

    console.error("Server started successfully");
}

