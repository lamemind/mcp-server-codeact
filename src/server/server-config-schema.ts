import { z } from 'zod';

// Configuration schemas
export const WorkspaceConfigSchema = z.object({
  workspaceId: z.string().describe('Unique identifier for the workspace'),
  fullpath: z.string().describe('Full path to the workspace directory'),
  default: z.boolean().default(false)
    .describe('If true, this is the default workspace used when no specific workspace is set')
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export const SecurityConfigSchema = z.object({
  maxBatchSize: z.number().default(50),
  maxConcurrentBatches: z.number().default(5),
  maxOperationTimeout: z.number().default(30), // seconds
  maxBatchTimeout: z.number().default(300), // seconds
  workspaces: z.array(WorkspaceConfigSchema),
  blockedCommands: z.array(z.string()).default([]),
  enableSandbox: z.boolean().default(true),
});

export const RuntimeConfigSchema = z.object({
  node: z.object({
    enabled: z.boolean().default(false)
      .describe('Enable Node.js runtime'),
    command: z.string()
      .default('node')
      .describe('Command to run Node.js scripts'),
    timeout: z.number().default(30),
  }),
  php: z.object({
    enabled: z.boolean().default(false)
      .describe('Enable PHP runtime'),
    command: z.string()
      .default('php')
      .describe('Command to run PHP scripts'),
    timeout: z.number().default(30),
  }),
  python: z.object({
    enabled: z.boolean().default(false)
      .describe('Enable Python runtime'),
    command: z.string().default('python'),
    timeout: z.number().default(30),
  }),
});

export const ServerConfigSchema = z.object({
  security: SecurityConfigSchema,
  runtimes: RuntimeConfigSchema,
  cleanupInterval: z.number().default(3600), // seconds
  maxBatchHistory: z.number().default(1000),
});

// TypeScript types
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
