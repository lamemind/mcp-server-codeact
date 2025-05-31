#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { BatchExecutor } from './batch/executor.js';
import { ServerConfig, ServerConfigSchema } from './types/index.js';
import { program } from 'commander';
import { readFileSync } from 'fs';

// Default configuration
const DEFAULT_CONFIG: ServerConfig = {
  security: {
    maxBatchSize: 50,
    maxConcurrentBatches: 5,
    maxOperationTimeout: 30,
    maxBatchTimeout: 300,
    allowedPaths: [process.cwd()],
    restrictWorkingDirectory: true,
    blockedCommands: ['rm', 'del', 'format', 'shutdown', 'regedit'],
    enableSandbox: true,
  },
  runtimes: {
    node: { command: 'node', timeout: 30 },
    php: { command: 'php', timeout: 30 },
    python: { command: 'python', timeout: 30 },
  },
  cleanup_interval: 300,
  max_batch_history: 1000,
};

class CodeActServer {
  private server: Server;
  private executor: BatchExecutor;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server({
      name: "mcp-server-codeact",
      version: "1.0.0",
    }, {
      capabilities: { tools: {} }
    });

    this.executor = new BatchExecutor(config);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "batch_execute",
          description: "Execute batch of operations in parallel or sequence",
          inputSchema: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                items: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        type: { const: "file_write" },
                        files: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              path: { type: "string" },
                              content: { type: "string" }
                            },
                            required: ["path", "content"]
                          }
                        }
                      },
                      required: ["type", "files"]
                    },
                    {
                      type: "object", 
                      properties: {
                        type: { const: "dir_create" },
                        paths: { type: "array", items: { type: "string" } }
                      },
                      required: ["type", "paths"]
                    },
                    {
                      type: "object",
                      properties: {
                        type: { const: "shell_exec" },
                        commands: { type: "array", items: { type: "string" } },
                        shell: { enum: ["powershell", "cmd", "gitbash"] },
                        workingDir: { type: "string" }
                      },
                      required: ["type", "commands"]
                    },
                    {
                      type: "object",
                      properties: {
                        type: { const: "code_exec" },
                        runtime: { enum: ["node", "php", "python"] },
                        code: { type: "string" },
                        workingDir: { type: "string" }
                      },
                      required: ["type", "runtime", "code"]
                    }
                  ]
                }
              },
              sync: { type: "boolean", default: false },
              workdir: { type: "string" }
            },
            required: ["operations"]
          }
        },
        {
          name: "await",
          description: "Check status or wait for batch completion",
          inputSchema: {
            type: "object",
            properties: {
              batch_id: { type: "string" },
              timeout: { type: "number" }
            },
            required: ["batch_id"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "batch_execute": {
            const result = await this.executor.execute(request.params.arguments);
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
              }]
            };
          }

          case "await": {
            const result = await this.executor.await(request.params.arguments);
            return {
              content: [{
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    
    process.on('SIGINT', async () => {
      await this.executor.cleanup();
      process.exit(0);
    });
    
    await this.server.connect(transport);
    console.error("Code Act MCP Server running on stdio");
  }
}

// CLI setup
program
  .option('-c, --config <path>', 'Configuration file path')
  .parse();

const main = async () => {
  try {
    let config = DEFAULT_CONFIG;
    
    if (program.opts().config) {
      const configFile = readFileSync(program.opts().config, 'utf8');
      const userConfig = JSON.parse(configFile);
      config = ServerConfigSchema.parse({ ...DEFAULT_CONFIG, ...userConfig });
    }

    const server = new CodeActServer(config);
    await server.run();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

main();
