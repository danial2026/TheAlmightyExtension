import * as vscode from 'vscode';
import { TheAlmightyPanel } from './panel';
import { TheAlmightyAgent } from './agent';

export function activate(context: vscode.ExtensionContext) {
    console.log('TheAlmighty extension is now active');

    // Register the webview view provider for the sidebar
    const provider = TheAlmightyPanel.register(context);
    context.subscriptions.push(provider);

    // Register the command to open TheAlmighty
    const openCommand = vscode.commands.registerCommand('thealmighty.open', () => {
        TheAlmightyPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(openCommand);

    // Initialize the agent
    TheAlmightyAgent.getInstance().initialize(context);
}

export function deactivate() {}

