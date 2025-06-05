import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
const RUNTIME_CONFIGS = {
    node: {
        command: 'node',
        extension: '.js',
        timeout: 30000
    },
    php: {
        command: 'php',
        extension: '.php',
        timeout: 30000
    },
    python: {
        command: 'python',
        extension: '.py',
        timeout: 30000
    }
};
export async function executeCodeExec(operation, abortController, onProcessStart, startWorkingDir) {
    let tempFilePath = null;
    try {
        const runtime = RUNTIME_CONFIGS[operation.runtime];
        if (!runtime)
            throw new Error(`Unsupported runtime: ${operation.runtime}`);
        if (abortController?.signal.aborted) {
            return {
                operationIndex: -1,
                status: 'error',
                error: 'Operation was aborted before execution'
            };
        }
        // Create temporary file
        const tempFileName = `temp_${randomUUID()}${runtime.extension}`;
        tempFilePath = join(startWorkingDir, tempFileName);
        await writeFile(tempFilePath, operation.code, 'utf8');
        // Execute code
        const output = await executeCodeFile(runtime.command, tempFilePath, startWorkingDir, runtime.timeout, abortController, (process) => onProcessStart(process, 0));
        return {
            operationIndex: -1,
            status: 'success',
            output: output || 'Code executed successfully (no output)'
        };
    }
    catch (error) {
        return {
            operationIndex: -1,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
    finally {
        // Cleanup temporary file (anche in caso di abort)
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
            }
            catch (cleanupError) {
                console.error(`Failed to cleanup temp file: ${tempFilePath}`, cleanupError);
            }
        }
    }
}
function executeCodeFile(command, filePath, workdir, timeout, abortController, onProcessStart) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, [filePath], {
            cwd: workdir,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        onProcessStart(process);
        let stdout = '';
        let stderr = '';
        let isAborted = false;
        // Handle abort signal
        const onAbort = () => {
            isAborted = true;
            process.kill('SIGTERM');
            reject(new Error('Code execution was aborted'));
        };
        if (abortController.signal.aborted) {
            process.kill('SIGTERM');
            reject(new Error('Code execution was aborted'));
            return;
        }
        abortController.signal.addEventListener('abort', onAbort);
        process.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        process.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        process.on('close', (code) => {
            abortController.signal.removeEventListener('abort', onAbort);
            if (isAborted)
                return; // Promise già rejected in onAbort
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(`${command} execution failed with exit code ${code}:\n${stderr}`));
            }
        });
        process.on('error', (error) => {
            abortController.signal.removeEventListener('abort', onAbort);
            if (!isAborted)
                reject(new Error(`Failed to start ${command}: ${error.message}`));
        });
        // Timeout handling (manteniamo il comportamento esistente)
        const timeoutId = setTimeout(() => {
            if (!isAborted) {
                process.kill('SIGTERM');
                reject(new Error(`Code execution timeout after ${timeout}ms`));
            }
        }, timeout);
        // Clear timeout when process ends
        process.on('close', () => {
            clearTimeout(timeoutId);
        });
    });
}
