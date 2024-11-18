import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vscode from 'vscode';

function checkGltfTransformInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
        exec('gltf-transform --version', (error) => {
            resolve(!error);
        });
    });
}

function runCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            if (stderr) {
                console.warn(`Warning: ${stderr}`);
            }
            resolve();
        });
    });
}

async function compressGLB(inputFile: string, etc1sFile: string) {
    const fileName = inputFile.split(/[/\\]/).pop() || inputFile;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Compressing ${fileName}`,
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Compressing with etc1s...' });
                await runCommand(`gltf-transform etc1s "${inputFile}" "${etc1sFile}"`);

                progress.report({ message: 'Deleting original file...' });
                fs.unlinkSync(inputFile);

                progress.report({ message: 'Compressing with draco...' });
                await runCommand(`gltf-transform draco "${etc1sFile}" "${inputFile}"`);

                progress.report({ message: 'Deleting intermediate file...' });
                fs.unlinkSync(etc1sFile);
            },
        );
    } catch (error) {
        //@ts-expect-error: error as unknown type
        throw new Error(`Failed to compress ${fileName}: ${error?.message}`);
    }
}

function getGLBFilesInFolderRecursive(
    folderPath: string,
    maxDepth: number,
    currentDepth = 0,
): string[] {
    let glbFiles: string[] = [];

    if (currentDepth > maxDepth) {
        return glbFiles;
    }

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
            glbFiles = [
                ...glbFiles,
                ...getGLBFilesInFolderRecursive(entryPath, maxDepth, currentDepth + 1),
            ];
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
            // Store the full path of the file
            glbFiles.push(entryPath);
        }
    }

    //get relative paths to  instead of absolute paths
    // glbFiles = glbFiles.map((file) => path.relative(folderPath, file));

    return glbFiles;
}

async function selectGLBFiles(
    glbFiles: string[],
    workspaceFolderPath: string,
): Promise<string[] | undefined> {
    const normalizedWorkspacePath = path.resolve(workspaceFolderPath);

    // Map file paths to QuickPick items
    const fileItems = glbFiles.map((filePath) => {
        const normalizedFilePath = path.resolve(filePath);
        const relativeFilePath = path.relative(normalizedWorkspacePath, normalizedFilePath);
        console.log(`Workspace Folder Path: ${normalizedWorkspacePath}`);
        console.log(`Absolute Path: ${normalizedFilePath}`);
        console.log(`Relative Path: ${relativeFilePath}`);
        return {
            label: relativeFilePath,
            description: '',
            picked: true, // Pre-select all files by default
            fullPath: normalizedFilePath,
        };
    });

    const selected = await vscode.window.showQuickPick(fileItems, {
        canPickMany: true,
        title: 'Select GLB files to compress',
    });

    if (!selected || selected.length === 0) {
        vscode.window.showInformationMessage('No files selected.');
        return;
    }

    // Return the full paths of the selected files
    return selected.map((item) => item.fullPath);
}

export async function compressGLBFiles() {
    try {
        const isInstalled = await checkGltfTransformInstalled();
        if (!isInstalled) {
            vscode.window.showErrorMessage(
                'gltf-transform CLI is not installed. Please install it by running "npm install -g @gltf-transform/cli".',
            );
            return;
        }

        // Get the current folder path (Option A: Workspace folder)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }
        const workspaceFolderPath = workspaceFolders[0].uri.fsPath;

        // Define the maximum depth
        const maxDepth = 4; // Adjust this value as needed

        // List GLB files in the current folder
        const glbFiles = getGLBFilesInFolderRecursive(workspaceFolderPath, maxDepth);

        if (glbFiles.length === 0) {
            vscode.window.showInformationMessage('No GLB files found in the current folder.');
            return;
        }

        glbFiles.forEach((file) => console.log('glbFile', file));

        // Let the user select files to compress
        const selectedFiles = await selectGLBFiles(glbFiles, workspaceFolderPath);
        if (!selectedFiles) {
            return; // User canceled the selection
        }

        selectedFiles.forEach((file) => console.log('SelectedFile', file));

        // Process each selected file
        for (const inputFile of selectedFiles) {
            const etc1sFile = inputFile.replace(/\.glb$/, '-etc1s.glb');
            await compressGLB(inputFile, etc1sFile);
        }

        vscode.window.showInformationMessage('Compression completed successfully!');
    } catch (error) {
        //@ts-expect-error: error has unknown type
        vscode.window.showErrorMessage(`An error occurred: ${error?.message}`);
    }
}
