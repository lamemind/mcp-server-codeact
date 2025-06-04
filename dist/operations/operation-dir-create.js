import { mkdir } from 'fs/promises';
import { resolve } from 'path';
export async function executeDirCreate(operation) {
    try {
        const rootPath = operation.workingDir;
        const directoriesToCreate = [];
        collectDirectories(operation.structure, rootPath, directoriesToCreate);
        // Create all directories
        for (const dirPath of directoriesToCreate)
            await mkdir(dirPath, { recursive: true });
        return {
            operationIndex: -1,
            status: 'success',
            output: `Created ${directoriesToCreate.length} directories: ${directoriesToCreate.map(d => d.replace(rootPath, '')).join(', ')}`
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
function collectDirectories(structure, currentPath, collector) {
    for (const [dirName, subStructure] of Object.entries(structure)) {
        const dirPath = resolve(currentPath, dirName);
        collector.push(dirPath);
        // Recursively process subdirectories
        if (subStructure && typeof subStructure === 'object')
            collectDirectories(subStructure, dirPath, collector);
    }
}
