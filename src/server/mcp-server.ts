import { ServerConfig } from "./server-config-schema.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BatchExecuteRequestSchema, BatchExecuteRequest, AwaitRequest, AwaitRequestSchema } from "../types/tool-batch-schema.js";
import { BatchExecutor } from "../batch/batch-executor.js";
import { formatToolOuput, validateAndParseInput } from "../utils/mcp-utils.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function startMcpServer(config: ServerConfig): Promise<void> {
    console.error(`Starting MCP Server CodeAct...`);

    const mcpServer = new Server({
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

    // mcpServer.prompt(
    //     `codeact_placeholder`, {},
    //     ({ }) => ({
    //         messages: [{
    //             role: "user",
    //             content: {
    //                 type: "text",
    //                 text: `this is a placeholder prompt to avoid error logs when no prompts are registered`
    //             }
    //         }]
    //     })
    // );
    // mcpServer.resource(
    //     `codeact_placeholder`,
    //     `placeholder://codeact`,
    //     async (uri) => ({
    //         contents: [{
    //             uri: uri.href,
    //             text: `This is a placeholder resource to avoid error logs when no resources are registered`
    //         }]
    //     })
    // );

    const executor = new BatchExecutor(config);

    const BatchExecuteToolDefinition = {
        name: 'batch-execute',
        description: 'Fetch economic calendar events for a specific date or range of dates.',
        inputSchema: zodToJsonSchema(BatchExecuteRequestSchema)
    };
    async function BatchExecuteMcpHandler(args: unknown): Promise<any> {
        const parsedArgs = validateAndParseInput<BatchExecuteRequest>(args, BatchExecuteRequestSchema);

        try {
            const result = await executor.executeBatch(parsedArgs);
            return formatToolOuput(result);
        } catch (error) {
            throw new McpError(ErrorCode.InternalError, `Error calling tool ${BatchExecuteToolDefinition.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const AwaitToolDefinition = {
        name: 'batch-await',
        description: 'Await the result of a batch execution.',
        inputSchema: zodToJsonSchema(AwaitRequestSchema)
    };
    async function AwaitToolDefinitionMcpHandler(args: unknown): Promise<any> {
        const parsedArgs = validateAndParseInput<AwaitRequest>(args, AwaitRequestSchema);

        try {
            const result = await executor.awaitBatch(parsedArgs.batchId, {
                timeout: parsedArgs.timeout,
                killOnTimeout: parsedArgs.killOnTimeout
            });
            return formatToolOuput(result);
        } catch (error) {
            throw new McpError(ErrorCode.InternalError, `Error calling tool ${AwaitToolDefinition.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const ListWorkspacesToolDefinition = {
        name: 'list-workspaces',
        description: 'List all configured workspaces.',
        inputSchema: {}
    };
    async function ListWorkspacesMcpHandler(): Promise<any> {
        try {
            return {
                workspaces: config.security.workspaces.map(ws => ({
                    workspaceId: ws.workspaceId,
                    fullpath: ws.fullpath,
                    default: ws.default
                }))
            };
        } catch (error) {
            throw new McpError(ErrorCode.InternalError, `Error calling tool ${ListWorkspacesToolDefinition.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            BatchExecuteToolDefinition,
            AwaitToolDefinition,
            ListWorkspacesToolDefinition
        ],
    }));

    const MCP_TOOL_HANDLERS = {
        [BatchExecuteToolDefinition.name]: BatchExecuteMcpHandler,
        [AwaitToolDefinition.name]: AwaitToolDefinitionMcpHandler,
        [ListWorkspacesToolDefinition.name]: ListWorkspacesMcpHandler
    };
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const handler = MCP_TOOL_HANDLERS[request.params.name];
        if (!handler)
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        return handler(request.params.arguments);
    });

    // const tcb: ToolCallback = async (name, args) => {
    //     console.error(`Tool callback invoked for tool: ${name} with args:`, args);
    //     return formatToolOuput("ok");
    // };
    // mcpServer.tool('test1', tcb);

    // @ts-ignore
    // mcpServer.tool(`batch-execute`, "description", BatchExecuteRequestSchema, async (args: any, args2: any) => {
    //     dump(args, "DUMP Received batch execute request arguments");
    //     dump(args2, "DUMP Received batch await request arguments");
    //     const parsedArgs = validateAndParseInput<BatchExecuteRequest>(args, BatchExecuteRequestSchema);

    //     console.error(`Received batch execute request:`, parsedArgs);
    //     const res = await executor.executeBatch(parsedArgs);
    //     console.error(`Batch execute result:`, res);
    //     return formatToolOuput(res);
    // });

    // @ts-ignore
    // mcpServer.tool(`batch-await`, "description", AwaitRequestSchema, async (args: any, args2: any) => {
    //     dump(args, "DUMP Received batch await request arguments");
    //     dump(args2, "DUMP Received batch await request arguments");
    //     const parsedArgs = validateAndParseInput<AwaitRequest>(args, AwaitRequestSchema);

    //     console.error(`Received batch await request:`, parsedArgs);
    //     const res = await executor.awaitBatch(parsedArgs.batchId, {
    //         timeout: parsedArgs.timeout!,
    //         killOnTimeout: parsedArgs.killOnTimeout!
    //     });
    //     console.error(`Batch await result:`, res);
    //     return formatToolOuput(res);
    // });

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    process.on('SIGINT', async () => {
        await executor.killAllBeforeShutdown();
        process.exit(0);
    });

    console.error("Server started successfully");
}

