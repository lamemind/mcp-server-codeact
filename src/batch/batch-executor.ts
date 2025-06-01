import { ServerConfig } from "../server/server-config-schema.js";
import { BatchState } from "../types/internal-types.js";

export class BatchExecutor {

    private activeBatches: Map<string, BatchState> = new Map();
    private config: ServerConfig;

    constructor(config: ServerConfig) {
        this.config = config;
    }

    public async executeBatchAsync(operations: any, workdir: string | undefined): Promise<any> {
        throw new Error("Method not implemented.");
    }
    public async executeBatchSync(operations: any, workdir: string | undefined): Promise<any> {
        throw new Error("Method not implemented.");
    }
    
    public async awaitBatch(batchId: string, options: any): Promise<any> {
        throw new Error("Method not implemented.");
    }
    
    public async killAllBeofreShutdown() {
        throw new Error("Method not implemented.");
    }

    // Mantieni la struttura base dall'old, ma implementa:
    // - executeFileWrite(operation)
    // - executeDirCreate(operation) 
    // - executeShellExec(operation)
    // - executeCodeExec(operation)

}