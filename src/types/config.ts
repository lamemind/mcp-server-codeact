import { z } from 'zod';
import { BatchOperation } from './operations.js';
import { OperationResult } from './batch.js';

// Batch state for internal management
export enum BatchStatus {
  QUEUED = 'queued',
  RUNNING = 'running', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

export interface BatchState {
  id: string;
  operations: BatchOperation[];
  status: BatchStatus;
  results: OperationResult[];
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  error?: string;
  workdir?: string;
}

// Configuration schemas
export const SecurityConfigSchema = z.object({
  maxBatchSize: z.number().default(50),
  maxConcurrentBatches: z.number().default(5),
  maxOperationTimeout: z.number().default(30), // seconds
  maxBatchTimeout: z.number().default(300), // seconds
  allowedPaths: z.array(z.string()),
  restrictWorkingDirectory: z.boolean().default(true),
  blockedCommands: z.array(z.string()).default([]),
  enableSandbox: z.boolean().default(true),
});

export const RuntimeConfigSchema = z.object({
  node: z.object({
    command: z.string().default('node'),
    timeout: z.number().default(30),
  }),
  php: z.object({
    command: z.string().default('php'),
    timeout: z.number().default(30),
  }),
  python: z.object({
    command: z.string().default('python'),
    timeout: z.number().default(30),
  }),
});

export const ServerConfigSchema = z.object({
  security: SecurityConfigSchema,
  runtimes: RuntimeConfigSchema,
  cleanup_interval: z.number().default(300), // seconds
  max_batch_history: z.number().default(1000),
});

// TypeScript types
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
