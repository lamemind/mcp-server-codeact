import { OperationResult } from "./tool-batch-schema.js";

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
  status: BatchStatus;
  results: OperationResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  workdir?: string;
}