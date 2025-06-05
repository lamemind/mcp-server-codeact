import { SessionShell, ShellType } from '../utils/session-shell.js';
// Mapping from schema shell types to SessionShell types
const SHELL_TYPE_MAPPING = {
    'cmd': ShellType.CMD,
    'powershell': ShellType.POWERSHELL,
    'gitbash': ShellType.BASH, // Use BASH for Git Bash
};
export async function executeShellExec(operation, abortController, onProcessStart) {
    let sessionShell = null;
    try {
        const shell = operation.shell || 'cmd';
        const shellType = SHELL_TYPE_MAPPING[shell];
        if (!shellType) {
            throw new Error(`Unsupported shell: ${shell}`);
        }
        if (abortController?.signal.aborted) {
            return {
                operationIndex: -1,
                status: 'error',
                error: 'Operation was aborted before execution'
            };
        }
        // Create SessionShell with 30 second timeout
        sessionShell = new SessionShell(shellType, 30000);
        // Handle abort signal by killing session shell
        const abortHandler = () => {
            if (sessionShell) {
                console.error('Aborting shell session due to batch abort signal');
                // SessionShell cleanup is handled internally
            }
        };
        if (abortController.signal.aborted) {
            return {
                operationIndex: -1,
                status: 'error',
                error: 'Operation was aborted before execution'
            };
        }
        abortController.signal.addEventListener('abort', abortHandler);
        try {
            // Set working directory by prepending cd command if needed
            const commands = [...operation.commands];
            if (operation.workingDir) {
                // Insert cd command at the beginning
                commands.unshift(`cd "${operation.workingDir}"`);
            }
            // Execute command sequence
            const sessionResult = await sessionShell.executeSequence(commands);
            if (!sessionResult.success) {
                return {
                    operationIndex: -1,
                    status: 'error',
                    error: sessionResult.error || 'Shell execution failed',
                    output: sessionResult.commands
                };
            }
            return {
                operationIndex: -1,
                status: 'success',
                output: sessionResult.commands,
                finalWorkingDir: sessionResult.finalWorkingDirectory || operation.workingDir
            };
        }
        finally {
            abortController.signal.removeEventListener('abort', abortHandler);
        }
    }
    catch (error) {
        return {
            operationIndex: -1,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
