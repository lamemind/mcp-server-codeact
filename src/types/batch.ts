import { z } from 'zod';
import { BatchOperationSchema } from './operations.js';

// Batch execute request
export const BatchExecuteRequestSchema = z.object({
  operations: z.array(BatchOperationSchema),
  sync: z.boolean()
    .optional().default(false),
  workdir: z.string().optional(),
});

// Operation result
export const OperationResultSchema = z.object({
  operation_index: z.number(),
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
});

// Batch execute response (sync)
export const BatchExecuteResponseSyncSchema = z.object({
  results: z.array(OperationResultSchema),
});

// Batch execute response (async)
export const BatchExecuteResponseAsyncSchema = z.object({
  batch_id: z.string(),
  status: z.enum(['queued', 'running']),
});

// Await request
export const AwaitRequestSchema = z.object({
  batch_id: z.string(),
  timeout: z.number().optional(),
});

// Await response
export const AwaitResponseSchema = z.object({
  status: z.enum(['completed', 'failed', 'running', 'timeout']),
  results: z.array(OperationResultSchema).optional(),
  operations_completed: z.number(),
  operations_total: z.number(),
});

// TypeScript types
export type BatchExecuteRequest = z.infer<typeof BatchExecuteRequestSchema>;
export type OperationResult = z.infer<typeof OperationResultSchema>;
export type BatchExecuteResponseSync = z.infer<typeof BatchExecuteResponseSyncSchema>;
export type BatchExecuteResponseAsync = z.infer<typeof BatchExecuteResponseAsyncSchema>;
export type AwaitRequest = z.infer<typeof AwaitRequestSchema>;
export type AwaitResponse = z.infer<typeof AwaitResponseSchema>;
