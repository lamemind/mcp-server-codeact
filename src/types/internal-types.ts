import { randomUUID } from "node:crypto";
import { AwaitResponse, BatchExecuteRequest, OperationResult } from "./tool-batch-schema.js";
import { BatchOperation } from "./act-operations-schema.js";

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

export interface BatchState {
  id: string;
  status: BatchStatus;
  sync: boolean;
  operations: BatchOperation[];
  results: OperationResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  workdir?: string;
}

export function createBatch(request: BatchExecuteRequest): BatchState {
  const batch: BatchState = {
    id: randomUUID(),
    sync: request.sync ?? false,
    operations: request.operations,
    status: BatchStatus.QUEUED,
    results: [],
    createdAt: new Date(),
    workdir: request.workdir,
  };

  return batch;
}