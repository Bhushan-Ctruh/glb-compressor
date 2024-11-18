import * as vscode from 'vscode';

import { compressGLBFiles } from './compressGlb';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('VSCodeExtensionBoilerplate.compressGLB', () =>
            compressGLBFiles(),
        ),
    );
}
