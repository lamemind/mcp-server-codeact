import { z } from 'zod';
import { BatchOperationSchema } from './act-operations-schema.js';



// Single Operation result
export const OperationResultSchema = z.object({
  operationIndex: z.number(),
  status: z.enum(['success', 'error']),
  output: z.any().optional(),
  error: z.string().optional(),
  finalWorkingDir: z.string().optional(),
});


// Batch execute request
export const BatchExecuteRequestSchema = z.object({
  operations: z.array(BatchOperationSchema),
  sync: z.boolean()
    .optional().default(true),
  workspace: z.string()
    .optional()
    .describe("Workspace ID to execute the batch in, defaults to the server default workspace"),
});


// Await request
export const AwaitRequestSchema = z.object({
  batchId: z.string(),
  timeout: z.number()
    .optional().default(0)
    .describe("Timeout in seconds, 0 means no timeout"),
  killOnTimeout: z.boolean()
    .optional().default(false)
});


// `Batch execute async` response
export const BatchExecuteResponseAsyncSchema = z.object({
  batchId: z.string(),
  status: z.enum(['queued', 'running']),
});

// `Batch execute sync` and Await response
export const AwaitResponseSchema = z.object({
  batchId: z.string(),
  status: z.enum(['queued', 'completed', 'failed', 'running', 'timeout', 'killed']),
  results: z.array(OperationResultSchema).default([]),
  operationsCompleted: z.number(),
  operationsTotal: z.number(),
});


// TypeScript types
export type OperationResult = z.infer<typeof OperationResultSchema>;
export type BatchExecuteRequest = z.infer<typeof BatchExecuteRequestSchema>;
export type BatchExecuteResponseSync = z.infer<typeof AwaitResponseSchema>;
export type BatchExecuteResponseAsync = z.infer<typeof BatchExecuteResponseAsyncSchema>;
export type AwaitRequest = z.infer<typeof AwaitRequestSchema>;
export type AwaitResponse = z.infer<typeof AwaitResponseSchema>;
