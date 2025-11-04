import * as vscode from 'vscode';
import { TheAlmightyPanel } from './panel';
import { TheAlmightyAgent } from './agent';

export function activate(context: vscode.ExtensionContext) {
    console.log('TheAlmighty extension is now active');

    // Register the command to open TheAlmighty
    const openCommand = vscode.commands.registerCommand('thealmighty.open', () => {
        TheAlmightyPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(openCommand);

    // Auto-open on startup (optional - can be removed if not desired)
    // TheAlmightyPanel.createOrShow(context.extensionUri);

    // Initialize the agent
    TheAlmightyAgent.getInstance().initialize(context);
}

export function deactivate() {}

