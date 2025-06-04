import { executeCodeExec } from "../operations/operation-code-exec.js";
import { executeDirCreate } from "../operations/operation-dir-create.js";
import { executeFileWrite } from "../operations/operation-file-write.js";
import { executeShellExec } from "../operations/operation-shell-exec.js";
import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";
import { BatchExecuteRequest, BatchExecuteResponseAsync, BatchExecuteResponseSync, OperationResult } from "../types/tool-batch-schema.js";
import { validateOperation, validatePath } from "./batch-utils.js";
import { BatchExecutionContext, BatchStatus, createBatchExecutionContext } from "./batch-types.js";

export class BatchExecutor {

    private config: ServerConfig;
    private activeBatches: Map<string, BatchExecutionContext> = new Map();

    constructor(config: ServerConfig) {
        this.config = config;
    }

    private registerBatch(batch: BatchExecutionContext): void {
        if (this.activeBatches.has(batch.id))
            throw new Error(`Batch with ID ${batch.id} is already registered.`);

        this.activeBatches.set(batch.id, batch);
        console.error(`Registered batch ${batch.id} (${batch.sync ? 'sync' : 'async'})`);
    }

    private unregisterBatch(batchId: string): void {
        if (!this.activeBatches.delete(batchId))
            throw new Error(`Batch with ID ${batchId} is not registered.`);

        console.error(`Unregistered batch ${batchId}`);
    }

    private getBatch(batchId: string): BatchExecutionContext {
        if (!this.activeBatches.has(batchId))
            throw new Error(`Batch with ID ${batchId} is not registered.`);

        return this.activeBatches.get(batchId)!;
    }

    // Debug method to see active batches
    public getActiveBatchCount(): number {
        return this.activeBatches.size;
    }

    public async executeBatch(request: BatchExecuteRequest): Promise<BatchExecuteResponseSync | BatchExecuteResponseAsync> {
        const batchContext = createBatchExecutionContext(request);
        validatePath(this.config, batchContext.workingDir);
        this.registerBatch(batchContext);
        if (batchContext.sync) {
            await this.executeBatchSync(batchContext);
            return {
                batchId: batchContext.id,
                status: batchContext.status,
                operationsTotal: batchContext.operations.length,
                operationsCompleted: batchContext.currentOperationIndex,
                results: batchContext.results
            } as BatchExecuteResponseSync;
        } else {
            return await this.executeBatchAsync(batchContext);
        }
    }

    public async executeBatchSync(batch: BatchExecutionContext): Promise<void> {
        try {
            batch.status = BatchStatus.RUNNING;
            batch.startedAt = new Date();

            // const batchResult: BatchExecuteResponseSync = {
            //     batchId: batch.id,
            //     status: 'running',
            //     operationsTotal: batch.operations.length,
            //     operationsCompleted: 0,
            //     results: []
            // };

            let lastResult: OperationResult | null = null;

            for (let i = 0; i < batch.operations.length; i++) {
                const operation = batch.operations[i];
                operation.workingDir = operation.workingDir || batch.workingDir;

                try {
                    validateOperation(this.config, operation, operation.workingDir);
                    lastResult = await this.executeOperation(operation);

                    lastResult.operationIndex = i;
                    // batchResult.results.push(result);
                    batch.results.push(lastResult);
                    batch.currentOperationIndex = i + 1;

                    if (lastResult.status === 'error')
                        break;

                } catch (error) {
                    lastResult = {
                        operationIndex: i,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    } as OperationResult;
                    // batchResult.results.push(errorResult);
                    batch.results.push(lastResult);
                    // batch.currentOperationIndex = i + 1;
                    break;
                }
            }

            // batchResult.operationsCompleted = batchResult.results.filter(r => r.status !== 'error').length;
            // batchResult.status = batchResult.operationsCompleted === batch.operations.length ? 'completed' : 'failed';

            batch.status = lastResult?.status === 'success' ? BatchStatus.COMPLETED : BatchStatus.FAILED;
            batch.completedAt = new Date();

        } finally {
            this.unregisterBatch(batch.id);
        }
    }

    public async executeBatchAsync(batch: BatchExecutionContext): Promise<BatchExecuteResponseAsync> {
        throw new Error("Method not implemented.");
    }

    public async awaitBatch(batchId: string, options: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async killAllBeofreShutdown() {
        throw new Error("Method not implemented.");
    }

    private async executeOperation(operation: BatchOperation): Promise<OperationResult> {
        switch (operation.type) {
            case 'file_write':
                return await executeFileWrite(operation);
            case 'dir_create':
                return await executeDirCreate(operation);
            case 'shell_exec':
                return await executeShellExec(operation);
            case 'code_exec':
                return await executeCodeExec(operation);
            default:
                throw new Error(`Unknown operation type: ${(operation as any).type}`);
        }
    }

}