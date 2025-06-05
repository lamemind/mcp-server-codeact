import { randomUUID } from "node:crypto";
// Batch state for internal management
export var BatchStatus;
(function (BatchStatus) {
    BatchStatus["QUEUED"] = "queued";
    BatchStatus["RUNNING"] = "running";
    BatchStatus["COMPLETED"] = "completed";
    BatchStatus["FAILED"] = "failed";
    BatchStatus["KILLED"] = "killed";
    BatchStatus["TIMEOUT"] = "timeout";
})(BatchStatus || (BatchStatus = {}));
export function mapBatchStatusToAwaitStatus(status) {
    switch (status) {
        case BatchStatus.COMPLETED: return 'completed';
        case BatchStatus.FAILED: return 'failed';
        case BatchStatus.RUNNING:
        case BatchStatus.QUEUED: return 'running';
        case BatchStatus.KILLED: return 'killed';
        case BatchStatus.TIMEOUT: return 'timeout';
    }
}
export function createBatchExecutionContext(request, fallbackWorkdir) {
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
