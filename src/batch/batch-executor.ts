import { executeCodeExec } from "../operations/operation-code-exec.js";
import { executeDirCreate } from "../operations/operation-dir-create.js";
import { executeFileWrite } from "../operations/operation-file-write.js";
import { executeShellExec } from "../operations/operation-shell-exec.js";
import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";
import { BatchExecuteRequest, BatchExecuteResponseAsync, BatchExecuteResponseSync, OperationResult } from "../types/tool-batch-schema.js";
import { validateOperation, validatePath } from "./batch-utils.js";
import { ActiveProcess, BatchExecutionContext, BatchStatus, createBatchExecutionContext } from "./batch-types.js";
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

            let lastResult: OperationResult | null = null;

            for (let i = 0; i < batch.operations.length; i++) {
                const operation = batch.operations[i];
                operation.workingDir = operation.workingDir || batch.workingDir;

                try {
                    validateOperation(this.config, operation, operation.workingDir);
                    lastResult = await this.executeOperation(operation);

                    lastResult.operationIndex = i;
                    batch.currentOperationIndex = i + 1;
                    batch.activeProcess = undefined;
                    if (lastResult.status === 'error')
                        break;

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
                const abortController = new AbortController();
                const tempEmptyCallback = (process: ChildProcess, operationIndex: number) => {
                    console.error(`Process started for operation ${operationIndex}`);
                };
                return await executeShellExec(operation, abortController, tempEmptyCallback);
            case 'code_exec':
                return await executeCodeExec(operation);
            default:
                throw new Error(`Unknown operation type: ${(operation as any).type}`);
        }
    }

}