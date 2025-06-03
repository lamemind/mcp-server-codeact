import { spawn } from 'child_process';
import { ShellExecOperation } from '../types/act-operations-schema.js';
import { OperationResult } from '../types/tool-batch-schema.js';

const SHELL_COMMANDS = {
  powershell: { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] },
  cmd: { cmd: 'cmd.exe', args: ['/c'] },
  gitbash: { cmd: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-c'] }
};

export async function executeShellExec(operation: ShellExecOperation): Promise<OperationResult> {
  try {
    const shell = operation.shell || 'cmd';
    const shellConfig = SHELL_COMMANDS[shell];

    if (!shellConfig) {
      throw new Error(`Unsupported shell: ${shell}`);
    }

    const results: string[] = [];
    let allSuccessful = true;

    // Execute commands sequentially
    for (const [index, command] of operation.commands.entries()) {
      try {
        const output = await executeCommand(shellConfig, command, operation.workingDir!);
        results.push(`Command ${index + 1}: ${output}`);
      } catch (error) {
        allSuccessful = false;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push(`Command ${index + 1} FAILED: ${errorMsg}`);
      }
    }

    return {
      operationIndex: -1,
      status: allSuccessful ? 'success' : 'error',
      output: results.join('\n'),
      error: allSuccessful ? undefined : 'One or more commands failed'
    };

  } catch (error) {
    return {
      operationIndex: -1,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function executeCommand(
  shellConfig: { cmd: string; args: string[] },
  command: string,
  workdir: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      shellConfig.cmd,
      [...shellConfig.args, command],
      { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout || 'Command completed successfully (no output)');
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Process error: ${error.message}`));
    });

    // 30 second timeout
    setTimeout(() => {
      process.kill();
      reject(new Error('Command execution timeout'));
    }, 30000);
  });
}
