import { randomUUID } from "node:crypto";
import { AwaitResponse, BatchExecuteRequest, OperationResult } from "../types/tool-batch-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";
import { ChildProcess } from "node:child_process";

// Batch state for internal management
export enum BatchStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

export function mapBatchStatusToAwaitStatus(status: BatchStatus): AwaitResponse['status'] {
  switch (status) {
    case BatchStatus.COMPLETED: return 'completed';
    case BatchStatus.FAILED: return 'failed';
    case BatchStatus.RUNNING:
    case BatchStatus.QUEUED: return 'running';
    case BatchStatus.TIMEOUT: return 'timeout';
  }
}

interface BatchExecutionContext {
  // Core batch info
  id: string;
  status: BatchStatus;
  request: BatchExecuteRequest;

  // Execution tracking  
  executionPromise?: Promise<OperationResult[]>;
  abortController: AbortController;

  // Single active process (quando presente)
  activeProcess?: {
    pid: number;
    operationIndex: number;
    type: 'shell' | 'code';
    process: ChildProcess;
  };

  // Results & progress
  results: OperationResult[];
  currentOperationIndex: number;
  error?: string;

  // Timing & cleanup
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  timeoutHandle?: NodeJS.Timeout;
}

export function createBatchExecutionContext(request: BatchExecuteRequest): BatchExecutionContext {
  return {
    id: randomUUID(),
    status: BatchStatus.QUEUED,
    request,

    executionPromise: undefined,
    abortController: new AbortController(),
    activeProcess: undefined,

    results: [],
    currentOperationIndex: 0,
    createdAt: new Date()
  };
}