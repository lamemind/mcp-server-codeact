import { spawn } from 'child_process';
const SHELL_COMMANDS = {
    powershell: { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] },
    cmd: { cmd: 'cmd.exe', args: ['/c'] },
    gitbash: { cmd: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-c'] }
};
export async function executeShellExec(operation, abortController, onProcessStart) {
    try {
        const shell = operation.shell || 'cmd';
        const shellConfig = SHELL_COMMANDS[shell];
        if (!shellConfig)
            throw new Error(`Unsupported shell: ${shell}`);
        if (abortController?.signal.aborted)
            // TODO Ma non sarebbe meglio tirare un'eccezione?
            return {
                operationIndex: -1,
                status: 'error',
                error: 'Operation was aborted before execution'
            };
        const results = [];
        let allSuccessful = true;
        // Execute commands sequentially
        for (const [index, command] of operation.commands.entries()) {
            try {
                const output = await executeCommand(shellConfig, command, operation.workingDir, abortController, (process) => onProcessStart(process, index));
                results.push(`Command ${index + 1}: ${output}`);
            }
            catch (error) {
                allSuccessful = false;
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push(`Command ${index + 1} FAILED: ${errorMsg}`);
                if (abortController?.signal.aborted)
                    break;
            }
        }
        return {
            operationIndex: -1,
            status: allSuccessful ? 'success' : 'error',
            output: results.join('\n'),
            error: allSuccessful ? undefined : 'One or more commands failed'
        };
    }
    catch (error) {
        return {
            operationIndex: -1,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
function executeCommand(shellConfig, command, workdir, abortController, onProcessStart) {
    return new Promise((resolve, reject) => {
        const process = spawn(shellConfig.cmd, [...shellConfig.args, command], { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] });
        onProcessStart(process);
        let stdout = '';
        let stderr = '';
        let isAborted = false;
        // Handle abort signal
        const onAbort = () => {
            isAborted = true;
            process.kill('SIGTERM');
            reject(new Error('Command execution was aborted'));
        };
        if (abortController.signal.aborted) {
            process.kill('SIGTERM');
            reject(new Error('Command execution was aborted'));
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
                resolve(stdout || 'Command completed successfully (no output)');
            }
            else {
                reject(new Error(stderr || `Command failed with exit code ${code}`));
            }
        });
        process.on('error', (error) => {
            abortController.signal.removeEventListener('abort', onAbort);
            if (!isAborted)
                reject(new Error(`Process error: ${error.message}`));
        });
        // 30 second timeout (manteniamo il comportamento esistente)
        const timeoutId = setTimeout(() => {
            if (!isAborted) {
                process.kill('SIGTERM');
                reject(new Error('Command execution timeout'));
            }
        }, 30000);
        // Clear timeout when process ends
        process.on('close', () => {
            clearTimeout(timeoutId);
        });
    });
}
