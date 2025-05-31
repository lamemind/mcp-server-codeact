import { randomUUID } from 'crypto';
import { BatchState, BatchStatus } from '../types/internal-types.js';
import { ServerConfig } from '../server/server-config-schema.js';
import { AwaitRequestSchema, AwaitResponse, BatchExecuteRequest, BatchExecuteRequestSchema, BatchExecuteResponseAsync, BatchExecuteResponseSync } from '../types/tool-batch-schema.js';

export class BatchExecutor {
  private activeBatches: Map<string, BatchState> = new Map();
  private config: ServerConfig;
  private cleanupTimer: NodeJS.Timeout;

  constructor(config: ServerConfig) {
    this.config = config;
    
    // Setup cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedBatches();
    }, config.cleanupInterval * 1000);
  }

  async execute(args: any): Promise<BatchExecuteResponseSync | BatchExecuteResponseAsync> {
    const request = BatchExecuteRequestSchema.parse(args);
    
    // Validate batch size
    if (request.operations.length > this.config.security.maxBatchSize) {
      throw new Error(`Batch size exceeds maximum of ${this.config.security.maxBatchSize}`);
    }

    // Check concurrent batch limit
    const runningBatches = Array.from(this.activeBatches.values())
      .filter(batch => batch.status === BatchStatus.RUNNING || batch.status === BatchStatus.QUEUED);
    
    if (runningBatches.length >= this.config.security.maxConcurrentBatches) {
      throw new Error(`Maximum concurrent batches (${this.config.security.maxConcurrentBatches}) exceeded`);
    }

    if (request.sync) {
      // Synchronous execution
      return await this.executeSynchronous(request);
    } else {
      // Asynchronous execution
      return this.executeAsynchronous(request);
    }
  }

  async await(args: any): Promise<AwaitResponse> {
    const request = AwaitRequestSchema.parse(args);
    const batch = this.activeBatches.get(request.batchId);
    
    if (!batch) {
      throw new Error(`Batch not found: ${request.batchId}`);
    }

    // If timeout specified, wait for completion or timeout
    if (request.timeout !== undefined) {
      const startTime = Date.now();
      while (batch.status === BatchStatus.RUNNING || batch.status === BatchStatus.QUEUED) {
        if (Date.now() - startTime > request.timeout) {
          return {
            status: 'timeout',
            operations_completed: batch.results.length,
            operations_total: batch.operations.length,
          };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      status: this.mapBatchStatusToAwaitStatus(batch.status),
      results: batch.results,
      operations_completed: batch.results.length,
      operations_total: batch.operations.length,
    };
  }

  private async executeSynchronous(request: BatchExecuteRequest): Promise<BatchExecuteResponseSync> {
    const batch = this.createBatch(request);
    batch.status = BatchStatus.RUNNING;
    batch.startedAt = new Date();

    try {
      const results = await this.runOperations(batch);
      batch.results = results;
      batch.status = BatchStatus.COMPLETED;
      batch.completedAt = new Date();
      
      return { results };
    } catch (error) {
      batch.status = BatchStatus.FAILED;
      batch.error = error instanceof Error ? error.message : String(error);
      batch.completedAt = new Date();
      throw error;
    }
  }

  private executeAsynchronous(request: BatchExecuteRequest): BatchExecuteResponseAsync {
    const batch = this.createBatch(request);
    
    // Start execution in background
    setImmediate(async () => {
      batch.status = BatchStatus.RUNNING;
      batch.started_at = new Date(); 
      
      try {
        const results = await this.runOperations(batch);
        batch.results = results;
        batch.status = BatchStatus.COMPLETED;
        batch.completed_at = new Date();
      } catch (error) {
        batch.status = BatchStatus.FAILED;
        batch.error = error instanceof Error ? error.message : String(error);
        batch.completed_at = new Date();
      }
    });

    return {
      batch_id: batch.id,
      status: 'queued'
    };
  }

  private createBatch(request: BatchExecuteRequest): BatchState {
    const batch: BatchState = {
      id: randomUUID(),
      operations: request.operations,
      status: BatchStatus.QUEUED,
      results: [],
      created_at: new Date(),
      workdir: request.workdir,
    };

    this.activeBatches.set(batch.id, batch);
    return batch;
  }

  private async runOperations(batch: BatchState): Promise<OperationResult[]> {
    const results: OperationResult[] = [];

    for (let i = 0; i < batch.operations.length; i++) {
      const operation = batch.operations[i];
      
      try {
        // TODO: Implement actual operation execution
        const output = `Operation ${operation.type} completed successfully`;
        
        results.push({
          operation_index: i,
          status: 'success',
          output,
        });
      } catch (error) {
        results.push({
          operation_index: i,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private mapBatchStatusToAwaitStatus(status: BatchStatus): 'completed' | 'failed' | 'running' | 'timeout' {
    switch (status) {
      case BatchStatus.COMPLETED: return 'completed';
      case BatchStatus.FAILED: return 'failed';
      case BatchStatus.RUNNING:
      case BatchStatus.QUEUED: return 'running';
      case BatchStatus.TIMEOUT: return 'timeout';
    }
  }

  private cleanupCompletedBatches(): void {
    const cutoffTime = new Date(Date.now() - (this.config.cleanupInterval * 1000));
    
    for (const [id, batch] of this.activeBatches) {
      if (batch.completed_at && batch.completed_at < cutoffTime) {
        this.activeBatches.delete(id);
      }
    }

    // Keep only recent batches if history is too large
    if (this.activeBatches.size > this.config.maxBatchHistory) {
      const sortedBatches = Array.from(this.activeBatches.entries())
        .sort(([,a], [,b]) => b.created_at.getTime() - a.created_at.getTime());
      
      const toKeep = sortedBatches.slice(0, this.config.maxBatchHistory);
      this.activeBatches.clear();
      
      for (const [id, batch] of toKeep) {
        this.activeBatches.set(id, batch);
      }
    }
  }

  async cleanup(): Promise<void> {
    clearInterval(this.cleanupTimer);
    this.activeBatches.clear();
  }
}
