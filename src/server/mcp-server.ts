import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServerConfig } from "./server-config-schema.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BatchExecuteRequestSchema, BatchExecuteRequest, AwaitRequest, AwaitRequestSchema } from "../types/tool-batch-schema.js";
import { BatchExecutor } from "../batch/batch-executor.js";

export async function startMcpServer(config: ServerConfig): Promise<void> {
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
    
    mcpServer.prompt(
        `codeact_placeholder`, {},
        ({ }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `this is a placeholder prompt to avoid error logs when no prompts are registered`
                }
            }]
        })
    );

    mcpServer.resource(
        `codeact_placeholder`,
        `placeholder://codeact`,
        async (uri) => ({
            contents: [{
                uri: uri.href,
                text: `This is a placeholder resource to avoid error logs when no resources are registered`
            }]
        })
    );

    const executor = new BatchExecutor(config);

    // @ts-ignore
    mcpServer.tool(`batch-execute`, "description", BatchExecuteRequestSchema, async (args: BatchExecuteRequest) => {
        console.error(`Received batch execute request:`, args);
        return await executor.executeBatch(args);
    });

    // @ts-ignore
    mcpServer.tool(`batch-await`, "description", AwaitRequestSchema, async (args: AwaitRequest) => {
        console.error(`Received batch await request:`, args);
        return await executor.awaitBatch(args.batchId, {
            timeout: args.timeout!,
            killOnTimeout: args.killOnTimeout!
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

