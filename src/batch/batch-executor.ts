import { executeCodeExec } from "../operations/operation-code-exec.js";
import { executeDirCreate } from "../operations/operation-dir-create.js";
import { executeFileWrite } from "../operations/operation-file-write.js";
import { executeShellExec } from "../operations/operation-shell-exec.js";
import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";
import { BatchExecuteRequest, BatchExecuteResponseAsync, BatchExecuteResponseSync, OperationResult } from "../types/tool-batch-schema.js";
import { validateOperation, validatePath } from "./batch-utils.js";
import { ActiveProcess, BatchExecutionContext, BatchStatus, createBatchExecutionContext, mapBatchStatusToAwaitStatus } from "./batch-types.js";
import { ChildProcess } from "node:child_process";

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

    public getActiveBatchCount_forDebug(): number {
        return this.activeBatches.size;
    }

    // Process registration infrastructure
    private registerActiveProcess(
        batch: BatchExecutionContext,
        process: ChildProcess,
        operationIndex: number,
        type: 'shell' | 'code'
    ): void {
        if (batch.activeProcess)
            console.error(`Batch ${batch.id} already has an active process. Replacing.`);

        batch.activeProcess = {
            pid: process.pid!,
            operationIndex,
            type,
            process
        };

        console.error(`Registered active process PID ${process.pid} for batch ${batch.id} operation ${operationIndex}`);
    }

    public getActiveProcessInfo_forDebug(batchId: string): ActiveProcess | null {
        const batch = this.activeBatches.get(batchId);
        if (!batch)
            throw new Error(`Batch with ID ${batchId} is not registered.`);
        if (!batch.activeProcess)
            return null;

        return batch.activeProcess;
    }

    public async executeBatch(request: BatchExecuteRequest): Promise<BatchExecuteResponseSync | BatchExecuteResponseAsync> {
        const batchContext = createBatchExecutionContext(request);
        validatePath(this.config, batchContext.workingDir);
        this.registerBatch(batchContext);
        
        if (batchContext.sync) {
            await this.executeBatchSync(batchContext);
            // Note: executeBatchSync unregisters the batch at the end
            return {
                batchId: batchContext.id,
                status: mapBatchStatusToAwaitStatus(batchContext.status),
                operationsTotal: batchContext.operations.length,
                operationsCompleted: batchContext.currentOperationIndex,
                results: batchContext.results
            } as BatchExecuteResponseSync;
        } else {
            // Async: batch remains registered for later await
            return await this.executeBatchAsync(batchContext);
        }
    }

    public async executeBatchSync(batch: BatchExecutionContext): Promise<void> {
        try {
            batch.status = BatchStatus.RUNNING;
            batch.startedAt = new Date();

            let lastResult: OperationResult | null = null;

            for (let i = 0; i < batch.operations.length; i++) {
                const operation = batch.operations[i];
                operation.workingDir = operation.workingDir || batch.workingDir;

                try {
                    validateOperation(this.config, operation, operation.workingDir);
                    lastResult = await this.executeOperation(operation, batch, i);

                    lastResult.operationIndex = i;
                    batch.currentOperationIndex = i + 1;
                    batch.activeProcess = undefined;

                    console.error(`Batch ${batch.id}: completed operation ${i + 1}/${batch.operations.length}`);

                    if (lastResult.status === 'error') {
                        console.error(`Batch ${batch.id}: operation ${i} failed, stopping batch`);
                        break;
                    }

                } catch (error) {
                    lastResult = {
                        operationIndex: i, status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    } as OperationResult;
                    break;
                } finally {
                    batch.results.push(lastResult!);
                    batch.activeProcess = undefined;
                }
            }

            batch.status = (lastResult?.status === 'success' && batch.currentOperationIndex === batch.operations.length) ? BatchStatus.COMPLETED : BatchStatus.FAILED;
            batch.completedAt = new Date();

        } finally {
            this.unregisterBatch(batch.id);
        }
    }

    public async executeBatchAsync(batch: BatchExecutionContext): Promise<BatchExecuteResponseAsync> {
        // Start background execution
        batch.executionPromise = this.executeAsyncBackground(batch);
        
        // Return immediately
        batch.status = BatchStatus.QUEUED;
        return {
            batchId: batch.id,
            status: 'queued'
        };
    }

    private async executeAsyncBackground(batch: BatchExecutionContext): Promise<OperationResult[]> {
        try {
            batch.status = BatchStatus.RUNNING;
            batch.startedAt = new Date();
            console.error(`Started async execution for batch ${batch.id}`);

            let lastResult: OperationResult | null = null;

            for (let i = 0; i < batch.operations.length; i++) {
                // Check if batch was aborted
                if (batch.abortController.signal.aborted) {
                    console.error(`Batch ${batch.id} was aborted at operation ${i}`);
                    batch.status = BatchStatus.KILLED;
                    batch.error = 'Batch execution was aborted';
                    break;
                }

                const operation = batch.operations[i];
                operation.workingDir = operation.workingDir || batch.workingDir;

                try {
                    validateOperation(this.config, operation, operation.workingDir);
                    lastResult = await this.executeOperation(operation, batch, i);

                    lastResult.operationIndex = i;
                    batch.currentOperationIndex = i + 1;
                    batch.results.push(lastResult);
                    batch.activeProcess = undefined;
                    
                    console.error(`Batch ${batch.id}: completed operation ${i + 1}/${batch.operations.length}`);

                    if (lastResult.status === 'error') {
                        console.error(`Batch ${batch.id}: operation ${i} failed, stopping batch`);
                        break;
                    }

                } catch (error) {
                    lastResult = {
                        operationIndex: i,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    } as OperationResult;
                    batch.results.push(lastResult);
                    batch.activeProcess = undefined;
                    console.error(`Batch ${batch.id}: operation ${i} threw exception:`, error);
                    break;
                }
            }

            // Update final status
            if (batch.status !== BatchStatus.KILLED) { // Not already set by abort
                batch.status = (lastResult?.status === 'success' && batch.currentOperationIndex === batch.operations.length) ? BatchStatus.COMPLETED : BatchStatus.FAILED;
            }
            batch.completedAt = new Date();
            
            console.error(`Batch ${batch.id} finished with status: ${batch.status}`);
            return batch.results;

        } catch (error) {
            // Unexpected error in batch execution
            batch.status = BatchStatus.FAILED;
            batch.error = error instanceof Error ? error.message : String(error);
            batch.completedAt = new Date();
            batch.activeProcess = undefined;
            
            console.error(`Batch ${batch.id} failed with unexpected error:`, error);
            return batch.results;
        }
    }

    public async awaitBatch(batchId: string, options: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async killAllBeofreShutdown() {
        throw new Error("Method not implemented.");
    }

    private async executeOperation(
        operation: BatchOperation,
        batch: BatchExecutionContext,
        operationIndex: number
    ): Promise<OperationResult> {
        
        switch (operation.type) {
            case 'file_write':
                return await executeFileWrite(operation);
            case 'dir_create':
                return await executeDirCreate(operation);
            case 'shell_exec':
                return await executeShellExec(
                    operation,
                    batch.abortController,
                    (process: ChildProcess, opIndex: number) => {
                        this.registerActiveProcess(batch, process, operationIndex, 'shell');
                    }
                );
            case 'code_exec':
                return await executeCodeExec(
                    operation,
                    batch.abortController,
                    (process: ChildProcess, opIndex: number) => {
                        this.registerActiveProcess(batch, process, operationIndex, 'code');
                    }
                );
            default:
                throw new Error(`Unknown operation type: ${(operation as any).type}`);
        }
    }

}