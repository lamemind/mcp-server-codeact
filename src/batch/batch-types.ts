import { randomUUID } from "node:crypto";
import { AwaitResponse, BatchExecuteRequest, OperationResult } from "../types/tool-batch-schema.js";
import { ChildProcess } from "node:child_process";

// Batch state for internal management
export enum BatchStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  KILLED = 'killed',
  TIMEOUT = 'timeout'
}

export function mapBatchStatusToAwaitStatus(status: BatchStatus): AwaitResponse['status'] {
  switch (status) {
    case BatchStatus.COMPLETED: return 'completed';
    case BatchStatus.FAILED: return 'failed';
    case BatchStatus.RUNNING:
    case BatchStatus.QUEUED: return 'running';
    case BatchStatus.KILLED: return 'killed';
    case BatchStatus.TIMEOUT: return 'timeout';
  }
}

export interface BatchExecutionContext {
  // Core batch info
  id: string;
  status: BatchStatus;
  request: BatchExecuteRequest;
  operations: BatchExecuteRequest['operations'];
  workingDir: string;
  currentWorkingDir: string;

  // Execution tracking
  sync: boolean; // If true, this is a synchronous batch
  executionPromise?: Promise<OperationResult[]>;
  abortController: AbortController;

  // Single active process (quando presente)
  activeProcess?: ActiveProcess;

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

export interface ActiveProcess {
  pid: number;
  operationIndex: number;
  type: 'shell' | 'code';
  process: ChildProcess;
}

export function createBatchExecutionContext(request: BatchExecuteRequest, fallbackWorkdir: string): BatchExecutionContext {
  const workingDir = request.workdir || fallbackWorkdir;
  return {
    id: randomUUID(),
    status: BatchStatus.QUEUED,
    request,
    operations: request.operations,
    workingDir,
    currentWorkingDir: workingDir,

    sync: request.sync,
    executionPromise: undefined,
    abortController: new AbortController(),
    activeProcess: undefined,

    results: [],
    currentOperationIndex: 0,
    createdAt: new Date()
  };
}