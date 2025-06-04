import { z } from 'zod';
// File write operation
export const FileWriteOperationSchema = z.object({
    type: z.literal('file_write'),
    files: z.array(z.object({
        path: z.string(),
        content: z.string(),
    })),
    workingDir: z.string()
        .optional()
        .describe("Working directory for the file write operation, defaults to the batch working directory")
});
const DirectoryStructureSchema = z.lazy(() => z.record(z.string(), // chiave = nome directory  
DirectoryStructureSchema // valore = sottostruttura (ricorsivo)
));
export const DirCreateOperationSchema = z.object({
    type: z.literal('dir_create'),
    structure: DirectoryStructureSchema,
    workingDir: z.string()
        .optional()
        .describe("Root directory for the structure, defaults to the batch working directory")
});
// Shell execute operation
export const ShellExecOperationSchema = z.object({
    type: z.literal('shell_exec'),
    commands: z.array(z.string()),
    shell: z.enum(['powershell', 'cmd', 'gitbash'])
        .default('cmd')
        .optional(),
    workingDir: z.string()
        .optional()
        .describe("Working directory for the shell commands, defaults to the batch working directory")
});
// Code execute operation
export const CodeExecOperationSchema = z.object({
    type: z.literal('code_exec'),
    runtime: z.enum(['node', 'php', 'python']),
    code: z.string(),
    workingDir: z.string()
        .optional()
        .describe("Working directory for the code execution, defaults to the batch working directory")
});
// Union of all operations
export const BatchOperationSchema = z.discriminatedUnion('type', [
    FileWriteOperationSchema,
    DirCreateOperationSchema,
    ShellExecOperationSchema,
    CodeExecOperationSchema,
]);
