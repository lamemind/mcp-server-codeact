import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { CodeExecOperation } from '../types/act-operations-schema.js';
import { OperationResult } from '../types/tool-batch-schema.js';

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

export async function executeCodeExec(operation: CodeExecOperation): Promise<OperationResult> {
  let tempFilePath: string | null = null;

  try {
    const runtime = RUNTIME_CONFIGS[operation.runtime];
    if (!runtime) {
      throw new Error(`Unsupported runtime: ${operation.runtime}`);
    }

    // Create temporary file
    const tempFileName = `temp_${randomUUID()}${runtime.extension}`;
    tempFilePath = join(operation.workingDir!, tempFileName);

    await writeFile(tempFilePath, operation.code, 'utf8');

    // Execute code
    const output = await executeCodeFile(
      runtime.command,
      tempFilePath,
      operation.workingDir!,
      runtime.timeout
    );

    return {
      operationIndex: -1,
      status: 'success',
      output: output || 'Code executed successfully (no output)'
    };

  } catch (error) {
    return {
      operationIndex: -1,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Cleanup temporary file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.error(`Failed to cleanup temp file: ${tempFilePath}`, cleanupError);
      }
    }
  }
}

function executeCodeFile(
  command: string,
  filePath: string,
  workdir: string,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, [filePath], {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

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
        resolve(stdout);
      } else {
        reject(new Error(`${command} execution failed with exit code ${code}:\n${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });

    // Timeout handling
    const timeoutId = setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error(`Code execution timeout after ${timeout}ms`));
    }, timeout);

    process.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}
