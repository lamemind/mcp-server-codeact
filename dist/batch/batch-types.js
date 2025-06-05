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
export function createBatchExecutionContext(request, config) {
    const defaultWorkspace = config.security.workspaces.find(ws => ws.default);
    const workspaceId = request.workspace || defaultWorkspace.workspaceId;
    const workspace = config.security.workspaces.find(ws => ws.workspaceId === workspaceId);
    return {
        id: randomUUID(),
        status: BatchStatus.QUEUED,
        request,
        operations: request.operations,
        workspace,
        currentWorkingDir: workspace.fullpath,
        sync: request.sync,
        executionPromise: undefined,
        abortController: new AbortController(),
        activeProcess: undefined,
        results: [],
        currentOperationIndex: 0,
        createdAt: new Date()
    };
}
