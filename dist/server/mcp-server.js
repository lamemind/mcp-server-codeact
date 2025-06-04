import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BatchExecuteRequestSchema, AwaitRequestSchema } from "../types/tool-batch-schema.js";
import { BatchExecutor } from "../batch/batch-executor.js";
export async function startMcpServer(config) {
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
    mcpServer.tool(`batch-execute`, "description", BatchExecuteRequestSchema, async (args) => {
        console.error(`Received batch execute request:`, args);
        return await executor.executeBatch(args);
    });
    // @ts-ignore
    mcpServer.tool(`batch-await`, "description", AwaitRequestSchema, async (args) => {
        console.error(`Received batch await request:`, args);
        return await executor.awaitBatch(args.batchId, {
            timeout: args.timeout,
            killOnTimeout: args.killOnTimeout
        });
    });
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    process.on('SIGINT', async () => {
        await executor.killAllBeforeShutdown();
        process.exit(0);
    });
    console.error("Server started successfully");
}
