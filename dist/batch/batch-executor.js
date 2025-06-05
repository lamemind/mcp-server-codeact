import { executeCodeExec } from "../operations/operation-code-exec.js";
import { executeDirCreate } from "../operations/operation-dir-create.js";
import { executeFileWrite } from "../operations/operation-file-write.js";
import { executeShellExec } from "../operations/operation-shell-exec.js";
import { validateOperation, validatePath } from "./batch-utils.js";
import { BatchStatus, createBatchExecutionContext, mapBatchStatusToAwaitStatus } from "./batch-types.js";
import * as fs from "node:fs";
export class BatchExecutor {
    constructor(config) {
        this.activeBatches = new Map();
        this.config = config;
        // this.startCleanupTimer();
        config.security.allowedPaths.forEach(path => {
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path, { recursive: true });
                console.error(`Created allowed path: ${path}`);
            }
        });
    }
    registerBatch(batch) {
        if (this.activeBatches.has(batch.id))
            throw new Error(`Batch with ID ${batch.id} is already registered.`);
        this.activeBatches.set(batch.id, batch);
        console.error(`Registered batch ${batch.id} (${batch.sync ? 'sync' : 'async'})`);
    }
    unregisterBatch(batchId) {
        if (!this.activeBatches.delete(batchId))
            throw new Error(`Batch with ID ${batchId} is not registered.`);
        console.error(`Unregistered batch ${batchId}`);
    }
    getBatch(batchId) {
        if (!this.activeBatches.has(batchId))
            throw new Error(`Batch with ID ${batchId} is not registered.`);
        return this.activeBatches.get(batchId);
    }
    getActiveBatchCount_forDebug() {
        return this.activeBatches.size;
    }
    // Process registration infrastructure
    registerActiveProcess(batch, process, operationIndex, type) {
        if (batch.activeProcess)
            console.error(`Batch ${batch.id} already has an active process. Replacing.`);
        batch.activeProcess = {
            pid: process.pid,
            operationIndex,
            type,
            process
        };
        console.error(`Registered active process PID ${process.pid} for batch ${batch.id} operation ${operationIndex}`);
    }
    getActiveProcessInfo_forDebug(batchId) {
        const batch = this.activeBatches.get(batchId);
        if (!batch)
            throw new Error(`Batch with ID ${batchId} is not registered.`);
        if (!batch.activeProcess)
            return null;
        return batch.activeProcess;
    }
    async executeBatch(request) {
        const batchContext = createBatchExecutionContext(request, this.config.security.allowedPaths[0]);
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
            };
        }
        else {
            // Async: batch remains registered for later await
            return await this.executeBatchAsync(batchContext);
        }
    }
    async executeBatchSync(batch) {
        try {
            batch.status = BatchStatus.RUNNING;
            batch.startedAt = new Date();
            let lastResult = null;
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
                }
                catch (error) {
                    lastResult = {
                        operationIndex: i, status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    };
                    break;
                }
                finally {
                    if (lastResult)
                        batch.results.push(lastResult);
                    batch.activeProcess = undefined;
                }
            }
            batch.status = (lastResult?.status === 'success' && batch.currentOperationIndex === batch.operations.length) ? BatchStatus.COMPLETED : BatchStatus.FAILED;
            batch.completedAt = new Date();
        }
        finally {
            this.unregisterBatch(batch.id);
        }
    }
    async executeBatchAsync(batch) {
        // Start background execution
        batch.executionPromise = this.executeAsyncBackground(batch);
        // Return immediately
        batch.status = BatchStatus.QUEUED;
        return {
            batchId: batch.id,
            status: 'queued'
        };
    }
    async executeAsyncBackground(batch) {
        try {
            batch.status = BatchStatus.RUNNING;
            batch.startedAt = new Date();
            console.error(`Started async execution for batch ${batch.id}`);
            let lastResult = null;
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
                }
                catch (error) {
                    lastResult = {
                        operationIndex: i,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    };
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
        }
        catch (error) {
            // Unexpected error in batch execution
            batch.status = BatchStatus.FAILED;
            batch.error = error instanceof Error ? error.message : String(error);
            batch.completedAt = new Date();
            batch.activeProcess = undefined;
            console.error(`Batch ${batch.id} failed with unexpected error:`, error);
            return batch.results;
        }
    }
    async awaitBatch(batchId, options) {
        const batch = this.getBatch(batchId);
        // If already completed, return immediately
        const terminalStatuses = new Set([BatchStatus.COMPLETED, BatchStatus.FAILED, BatchStatus.KILLED, BatchStatus.TIMEOUT]);
        if (terminalStatuses.has(batch.status)) {
            return {
                batchId: batch.id,
                status: mapBatchStatusToAwaitStatus(batch.status),
                operationsTotal: batch.operations.length,
                operationsCompleted: batch.currentOperationIndex,
                results: batch.results
            };
        }
        // Wait for execution promise to complete with optional timeout
        if (batch.executionPromise) {
            const timeout = options.timeout && options.timeout > 0 ? options.timeout * 1000 : undefined;
            if (timeout) {
                // Race between batch completion and timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Batch await timeout after ${options.timeout} seconds`));
                    }, timeout);
                });
                try {
                    await Promise.race([batch.executionPromise, timeoutPromise]);
                }
                catch (error) {
                    // Handle timeout
                    if (error instanceof Error && error.message.includes('Batch await timeout')) {
                        console.error(`Batch ${batchId} await timed out after ${options.timeout} seconds`);
                        if (options.killOnTimeout) {
                            console.error(`Killing batch ${batchId} due to timeout`);
                            await this.killBatch(batchId);
                            // Update batch status to timeout
                            batch.status = BatchStatus.TIMEOUT;
                            batch.error = `Batch killed due to await timeout (${options.timeout}s)`;
                            batch.completedAt = new Date();
                        }
                        else {
                            // Just return timeout status without killing
                            return {
                                batchId: batch.id,
                                status: 'running',
                                operationsTotal: batch.operations.length,
                                operationsCompleted: batch.currentOperationIndex,
                                results: batch.results
                            };
                        }
                    }
                    else {
                        throw error; // Re-throw non-timeout errors
                    }
                }
            }
            else {
                // No timeout, wait indefinitely
                await batch.executionPromise;
            }
        }
        // Return final result
        return {
            batchId: batch.id,
            status: mapBatchStatusToAwaitStatus(batch.status),
            operationsTotal: batch.operations.length,
            operationsCompleted: batch.currentOperationIndex,
            results: batch.results
        };
    }
    /**
     * Kill a specific batch by ID
     * @param batchId The ID of the batch to kill
     * @returns true if batch was killed, false if not found or already terminated
     */
    async killBatch(batchId) {
        const batch = this.getBatch(batchId);
        const terminalStatuses = new Set([BatchStatus.COMPLETED, BatchStatus.FAILED, BatchStatus.KILLED]);
        if (terminalStatuses.has(batch.status)) {
            console.error(`Cannot kill batch ${batchId}: already in terminal state ${batch.status}`);
            return true; // Already terminated, nothing to do
        }
        console.error(`Killing batch ${batchId}...`);
        // Kill active process if exists
        if (batch.activeProcess) {
            console.error(`Killing active process PID ${batch.activeProcess.pid} for batch ${batchId}`);
            batch.activeProcess.process.kill('SIGTERM');
            setTimeout(() => {
                if (batch.activeProcess && !batch.activeProcess.process.killed) {
                    console.error(`Force killing process PID ${batch.activeProcess.pid}`);
                    batch.activeProcess.process.kill('SIGKILL');
                }
            }, 2000);
        }
        // Trigger abort signal
        batch.abortController.abort();
        // Update batch status
        batch.status = BatchStatus.KILLED;
        batch.error = 'Batch was manually killed';
        batch.completedAt = new Date();
        console.error(`Batch ${batchId} killed successfully`);
        return true;
    }
    /**
     * Start the cleanup timer for old batches
     */
    startCleanupTimer() {
        const intervalMs = this.config.cleanupInterval * 1000; // Convert to milliseconds
        console.error(`Starting batch cleanup timer with interval: ${this.config.cleanupInterval}s`);
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldBatches();
        }, intervalMs);
    }
    /**
     * Cleanup old completed batches to prevent memory leaks
     */
    cleanupOldBatches() {
        const now = new Date();
        const maxAge = this.config.cleanupInterval * 2 * 1000; // Keep batches for 2x cleanup interval
        const terminalStatuses = new Set([BatchStatus.COMPLETED, BatchStatus.FAILED, BatchStatus.KILLED, BatchStatus.TIMEOUT]);
        let cleanedCount = 0;
        const toDelete = [];
        for (const [batchId, batch] of this.activeBatches.entries()) {
            // Only cleanup terminal batches
            if (!terminalStatuses.has(batch.status)) {
                continue;
            }
            // Check age
            const completedTime = batch.completedAt || batch.createdAt;
            const ageMs = now.getTime() - completedTime.getTime();
            if (ageMs > maxAge) {
                toDelete.push(batchId);
            }
        }
        // Delete old batches
        for (const batchId of toDelete) {
            this.activeBatches.delete(batchId);
            cleanedCount++;
        }
        if (cleanedCount > 0) {
            console.error(`Cleaned up ${cleanedCount} old batches. Active batches: ${this.activeBatches.size}`);
        }
        // Also check if we exceed max history limit
        const completedBatches = Array.from(this.activeBatches.values())
            .filter(batch => terminalStatuses.has(batch.status))
            .sort((a, b) => (b.completedAt || b.createdAt).getTime() - (a.completedAt || a.createdAt).getTime());
        if (completedBatches.length > this.config.maxBatchHistory) {
            const excessCount = completedBatches.length - this.config.maxBatchHistory;
            const toDeleteByLimit = completedBatches.slice(-excessCount);
            for (const batch of toDeleteByLimit) {
                this.activeBatches.delete(batch.id);
                cleanedCount++;
            }
            if (excessCount > 0) {
                console.error(`Removed ${excessCount} batches due to history limit. Active batches: ${this.activeBatches.size}`);
            }
        }
    }
    /**
     * Stop the cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            console.error('Stopped batch cleanup timer');
        }
    }
    /**
     * Kill all active batches before server shutdown
     */
    async killAllBeforeShutdown() {
        console.error(`Killing all active batches before shutdown (${this.activeBatches.size} active)...`);
        // Stop cleanup timer
        this.stopCleanupTimer();
        const killPromises = [];
        // Collect all batch IDs to avoid modification during iteration
        const activeBatchIds = Array.from(this.activeBatches.keys());
        // Kill each batch
        for (const batchId of activeBatchIds) {
            killPromises.push(this.killBatch(batchId));
        }
        // Wait for all kills to complete
        await Promise.allSettled(killPromises);
        // Clear the map
        this.activeBatches.clear();
        console.error('All batches killed and cleaned up');
    }
    async executeOperation(operation, batch, operationIndex) {
        switch (operation.type) {
            case 'file_write':
                return await executeFileWrite(operation);
            case 'dir_create':
                return await executeDirCreate(operation);
            case 'shell_exec':
                return await executeShellExec(operation, batch.abortController, (process, opIndex) => {
                    this.registerActiveProcess(batch, process, operationIndex, 'shell');
                });
            case 'code_exec':
                return await executeCodeExec(operation, batch.abortController, (process, opIndex) => {
                    this.registerActiveProcess(batch, process, operationIndex, 'code');
                });
            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }
}
