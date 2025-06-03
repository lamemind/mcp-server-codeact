import { executeCodeExec } from "../operations/operation-code-exec.js";
import { executeDirCreate } from "../operations/operation-dir-create.js";
import { executeFileWrite } from "../operations/operation-file-write.js";
import { executeShellExec } from "../operations/operation-shell-exec.js";
import { ServerConfig } from "../server/server-config-schema.js";
import { BatchOperation } from "../types/act-operations-schema.js";
import { BatchExecuteRequest, BatchExecuteResponseAsync, BatchExecuteResponseSync, OperationResult } from "../types/tool-batch-schema.js";
import { validateOperation, validatePath } from "./batch-utils.js";
import { BatchExecutionContext, createBatchExecutionContext } from "./batch-types.js";

export class BatchExecutor {


    private config: ServerConfig;

    constructor(config: ServerConfig) {
        this.config = config;
    }

    public async executeBatch(request: BatchExecuteRequest): Promise<BatchExecuteResponseSync | BatchExecuteResponseAsync> {
        const batchContext = createBatchExecutionContext(request);
        validatePath(this.config, batchContext.workingDir);
        if (batchContext.sync) {
            return await this.executeBatchSync(batchContext);
        } else {
            return await this.executeBatchAsync(batchContext);
        }
    }

    public async executeBatchSync(batch: BatchExecutionContext): Promise<BatchExecuteResponseSync> {
        const batchResult: BatchExecuteResponseSync = {
            batchId: batch.id,
            status: 'running',
            operationsTotal: batch.operations.length,
            operationsCompleted: 0,
            results: []
        };

        for (let i = 0; i < batch.operations.length; i++) {
            const operation = batch.operations[i];
            operation.workingDir = operation.workingDir || batch.workingDir;

            try {
                validateOperation(this.config, operation, operation.workingDir);
                const result = await this.executeOperation(operation);

                result.operationIndex = i;
                batchResult.results.push(result);
                if (result.status === 'error')
                    break;

            } catch (error) {
                const errorResult: OperationResult = {
                    operationIndex: i,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error)
                };
                batchResult.results.push(errorResult);
            }
        }

        batchResult.operationsCompleted = batchResult.results.filter(r => r.status !== 'error').length;
        batchResult.status = batchResult.operationsCompleted === batch.operations.length ? 'completed' : 'failed';
        return batchResult;
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