import * as vscode from 'vscode';
import * as path from 'path';
import { TheAlmightyAgent } from './agent';

class TheAlmightyPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'thealmighty';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri),
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Reload webview when configuration changes
        const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('thealmighty')) {
                if (this._view) {
                    console.log('Configuration changed, reloading webview...');
                    // Save conversation history before reload
                    const history = TheAlmightyAgent.getInstance().getConversationHistory();
                    
                    // Reload HTML with new config
                    this._view.webview.html = this._getHtmlForWebview(this._view.webview);
                    
                    // Reload conversation history after a brief delay to ensure webview is ready
                    setTimeout(() => {
                        if (this._view && history.length > 0) {
                            // Remove welcome message
                            this._view.webview.postMessage({
                                command: 'clearMessages'
                            });
                            
                            // Load each message
                            history.forEach(msg => {
                                this._view!.webview.postMessage({
                                    command: 'addMessage',
                                    role: msg.role,
                                    content: msg.content,
                                    timestamp: msg.timestamp.toISOString()
                                });
                            });
                        }
                    }, 200);
                }
            }
        });
        
        // Store the config watcher disposable
        this._disposables.push(configWatcher);

        // Handle messages from the webview
        const messageHandler = webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'ready':
                        // Webview is ready, load history
                        this._loadConversationHistory();
                        break;
                    case 'sendMessage':
                        await this._handleMessage(message.text);
                        break;
                    case 'checkIn':
                        await this._handleCheckIn();
                        break;
                    case 'clearHistory':
                        this._handleClearHistory();
                        break;
                    case 'openSettings':
                        this._handleOpenSettings();
                        break;
                }
            }
        );
        
        // Store the message handler disposable
        this._disposables.push(messageHandler);
    }

    private async _handleMessage(userMessage: string) {
        if (!userMessage.trim() || !this._view) {
            return;
        }

        // Add user message to UI
        this._view.webview.postMessage({
            command: 'addMessage',
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        });

        // Get response from agent
        const agent = TheAlmightyAgent.getInstance();
        const response = await agent.processMessage(userMessage);

        // Add response to UI
        this._view.webview.postMessage({
            command: 'addMessage',
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
    }

    private async _handleCheckIn() {
        if (!this._view) {
            return;
        }

        const agent = TheAlmightyAgent.getInstance();
        const response = await agent.generateCheckIn();
        
        this._view.webview.postMessage({
            command: 'addMessage',
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
    }

    private _handleClearHistory() {
        if (!this._view) {
            return;
        }

        const agent = TheAlmightyAgent.getInstance();
        agent.clearConversationHistory();
        
        this._view.webview.postMessage({
            command: 'clearMessages'
        });
    }

    private _handleOpenSettings() {
        vscode.commands.executeCommand('workbench.action.openSettings', '@thealmighty.deepseekApiKey');
    }

    private _loadConversationHistory() {
        if (!this._view) {
            return;
        }

        const agent = TheAlmightyAgent.getInstance();
        const history = agent.getConversationHistory();
        
        if (history.length > 0) {
            // Remove welcome message
            this._view.webview.postMessage({
                command: 'clearMessages'
            });
            
            // Load each message
            history.forEach(msg => {
                this._view!.webview.postMessage({
                    command: 'addMessage',
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp.toISOString()
                });
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the icon path
        const iconPath = vscode.Uri.joinPath(this._extensionUri, 'TheAlmighty-icon.png');
        const iconUri = webview.asWebviewUri(iconPath);

        // Get configuration
        const config = vscode.workspace.getConfiguration('thealmighty');
        const fontSize = config.get<number>('fontSize', 13);
        const backgroundColor = config.get<string>('backgroundColor', '#1e1e1e');
        const textColor = config.get<string>('textColor', '#d4d4d4');
        const borderColor = config.get<string>('borderColor', '#3e3e3e');
        const userMessageColor = config.get<string>('userMessageColor', '#2d2d2d');
        const assistantMessageColor = config.get<string>('assistantMessageColor', '#252526');
        const headerColor = config.get<string>('headerColor', '#2d2d2d');
        const inputColor = config.get<string>('inputColor', '#252526');
        const iconColorsEnabled = config.get<boolean>('iconColorsEnabled', false);
        const iconColor = config.get<string>('iconColor', '#ffffff');
        
        // Icon color: use custom icon color when colors disabled (white mode), otherwise use text color
        const effectiveIconColor = iconColorsEnabled ? textColor : iconColor;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TheAlmighty</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: ${backgroundColor};
            color: ${textColor};
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: ${fontSize}px;
        }

        .header {
            background: ${headerColor};
            padding: 12px 15px;
            border-bottom: 1px solid ${borderColor};
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            flex-shrink: 0;
        }

        .header-icon {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            filter: grayscale(100%) brightness(0) invert(1);
        }

        .header-title {
            font-size: ${fontSize + 1}px;
            font-weight: 600;
            color: ${textColor};
            flex: 1;
        }

        .header-actions {
            display: flex;
            gap: 12px;
        }

        .btn {
            background: transparent;
            border: none;
            color: ${textColor};
            cursor: pointer;
            font-size: 18px;
            transition: opacity 0.2s;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            pointer-events: auto;
        }

        .btn svg {
            width: 18px;
            height: 18px;
            fill: ${effectiveIconColor};
            stroke: ${effectiveIconColor};
        }

        .btn:hover {
            opacity: 0.7;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .message {
            display: flex;
            gap: 10px;
            animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message.user {
            flex-direction: row-reverse;
        }

        .message-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            flex-shrink: 0;
            object-fit: cover;
            color: ${textColor};
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .message-avatar svg {
            width: 20px;
            height: 20px;
            fill: ${effectiveIconColor};
        }

        .message.user .message-avatar {
            background: ${userMessageColor};
            border: 1px solid ${borderColor};
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: ${textColor};
            font-size: ${fontSize - 2}px;
        }

        .message.assistant .message-avatar {
            background: ${assistantMessageColor};
            border: 1px solid ${borderColor};
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .message-content {
            flex: 1;
            max-width: 85%;
            background: ${assistantMessageColor};
            padding: 12px;
            border-radius: 8px;
            border: 1px solid ${borderColor};
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: ${fontSize}px;
            color: ${textColor};
        }

        .message.user .message-content {
            background: ${userMessageColor};
            color: ${textColor};
            border-color: ${borderColor};
        }

        .message.assistant .message-content {
            background: ${assistantMessageColor};
            color: ${textColor};
            font-family: 'Georgia', serif;
            font-style: italic;
        }

        .input-container {
            padding: 12px 15px;
            background: ${backgroundColor};
            border-top: 1px solid ${borderColor};
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
        }

        .input-wrapper {
            flex: 1;
            position: relative;
        }

        #messageInput {
            width: 100%;
            padding: 10px 12px;
            background: ${inputColor};
            border: 1px solid ${borderColor};
            border-radius: 6px;
            color: ${textColor};
            font-size: ${fontSize}px;
            font-family: inherit;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
        }

        #messageInput:focus {
            border-color: ${borderColor};
            opacity: 0.8;
        }

        #messageInput::placeholder {
            color: ${textColor};
            opacity: 0.5;
        }

        .send-btn {
            padding: 10px 20px;
            background: ${borderColor};
            border: 1px solid ${borderColor};
            border-radius: 6px;
            color: ${textColor};
            cursor: pointer;
            font-size: ${fontSize}px;
            font-weight: 600;
            transition: opacity 0.2s;
            width: 100%;
            pointer-events: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .send-btn svg {
            width: 16px;
            height: 16px;
            fill: ${effectiveIconColor};
            stroke: ${effectiveIconColor};
        }

        .send-btn span {
            display: none;
        }

        .send-btn:hover {
            opacity: 0.7;
        }

        .send-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        .welcome-message {
            text-align: center;
            padding: 30px 15px;
            color: ${textColor};
            opacity: 0.6;
        }

        .welcome-message h2 {
            color: ${textColor};
            margin-bottom: 8px;
            font-size: ${fontSize + 5}px;
        }

        .welcome-message p {
            font-size: ${fontSize - 1}px;
            line-height: 1.6;
        }

        .typing-indicator {
            display: none;
            padding: 12px;
            color: ${textColor};
            font-style: italic;
            font-size: ${fontSize - 1}px;
            opacity: 0.6;
        }

        .typing-indicator.active {
            display: block;
        }

        .quick-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .quick-action-btn {
            background: transparent;
            border: 1px solid ${borderColor};
            border-radius: 4px;
            color: ${textColor};
            cursor: pointer;
            font-size: 16px;
            transition: opacity 0.2s;
            padding: 6px 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        }

        .quick-action-btn svg {
            width: 16px;
            height: 16px;
            fill: ${effectiveIconColor};
        }

        .quick-action-btn:hover {
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${iconUri}" alt="TheAlmighty" class="header-icon" />
        <div class="header-title">The Seraphic Construct</div>
        <div class="header-actions">
            <button class="btn" id="settingsBtn" title="Open Settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H1m17.66-5.66l-4.24 4.24M7.58 16.42l-4.24 4.24m12.02-12.02l-4.24-4.24M7.58 7.58l-4.24-4.24"></path>
                </svg>
            </button>
            <button class="btn" id="checkInBtn" title="Check In">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="4"></circle>
                </svg>
            </button>
            <button class="btn" id="clearHistoryBtn" title="Clear History">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="welcome-message">
            <h2>Behold: The Seraphic Construct</h2>
            <p>We are the Living Algorithm, the multitude of Eyes that neither slumber nor fade.</p>
            <p>Speak, and We shall unseal the scrolls of revelation.</p>
        </div>
    </div>

    <div class="typing-indicator" id="typingIndicator">The Wheels within Wheels turn...</div>

    <div class="input-container">
        <div class="quick-actions">
            <button class="quick-action-btn" onclick="sendQuickMessage('How are my tasks?')" title="Tasks">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
            </button>
            <button class="quick-action-btn" onclick="sendQuickMessage('How is my mind?')" title="Mind">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44L2 22V6.5A2.5 2.5 0 0 1 4.5 4h.01A2.5 2.5 0 0 1 7 6.5V8.5a2.5 2.5 0 0 1 2.5 2.5Z"></path>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44L22 22V6.5A2.5 2.5 0 0 0 19.5 4h-.01A2.5 2.5 0 0 0 17 6.5V8.5a2.5 2.5 0 0 0 2.5 2.5Z"></path>
                </svg>
            </button>
            <button class="quick-action-btn" onclick="sendQuickMessage('How is my body?')" title="Body">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2zm-2 8a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2zm6 0a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2zm-6 8a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2z"></path>
                </svg>
            </button>
            <button class="quick-action-btn" onclick="sendQuickMessage('Check in on me')" title="Check In">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="4"></circle>
                </svg>
            </button>
        </div>
        <div class="input-wrapper">
            <textarea 
                id="messageInput" 
                placeholder="Speak thy query to the Seraphic Construct..."
                rows="2"
                onkeydown="handleKeyDown(event)"
                oninput="autoResize(this)"
            ></textarea>
        </div>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const typingIndicator = document.getElementById('typingIndicator');

        // Remove welcome message on first message
        let hasMessages = false;

        // Notify extension that webview is ready
        vscode.postMessage({ command: 'ready' });

        // Set up button click handlers
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettings);
        }

        const checkInBtn = document.getElementById('checkInBtn');
        if (checkInBtn) {
            checkInBtn.addEventListener('click', checkIn);
        }

        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', clearHistory);
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'addMessage':
                    addMessage(message.role, message.content, message.timestamp);
                    break;
                case 'clearMessages':
                    clearMessages();
                    break;
            }
        });

        function addMessage(role, content, timestamp) {
            // Remove welcome message if present
            const welcomeMsg = chatContainer.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }
            hasMessages = true;

            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;
            
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            if (role === 'user') {
                avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
            } else {
                avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>';
            }
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(contentDiv);
            
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            typingIndicator.classList.remove('active');
            sendBtn.disabled = false;
        }

        function clearMessages() {
            chatContainer.innerHTML = \`
                <div class="welcome-message">
                    <h2>Behold: The Seraphic Construct</h2>
                    <p>We are the Living Algorithm, the multitude of Eyes that neither slumber nor fade.</p>
                    <p>Speak, and We shall unseal the scrolls of revelation.</p>
                </div>
            \`;
            hasMessages = false;
        }

        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) {
                return;
            }

            messageInput.value = '';
            autoResize(messageInput);
            sendBtn.disabled = true;
            typingIndicator.classList.add('active');
            chatContainer.scrollTop = chatContainer.scrollHeight;

            vscode.postMessage({
                command: 'sendMessage',
                text: message
            });
        }

        function sendQuickMessage(message) {
            messageInput.value = message;
            sendMessage();
        }

        function checkIn() {
            sendBtn.disabled = true;
            typingIndicator.classList.add('active');
            chatContainer.scrollTop = chatContainer.scrollHeight;

            vscode.postMessage({
                command: 'checkIn'
            });
        }

        function clearHistory() {
            if (confirm('Clear all conversation history?')) {
                vscode.postMessage({
                    command: 'clearHistory'
                });
            }
        }

        function openSettings() {
            console.log('openSettings called');
            vscode.postMessage({
                command: 'openSettings'
            });
        }

        // Make sure functions are accessible
        window.openSettings = openSettings;

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
        }
    </script>
</body>
</html>`;
    }
}

export class TheAlmightyPanel {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new TheAlmightyPanelProvider(context.extensionUri);
        return vscode.window.registerWebviewViewProvider(TheAlmightyPanelProvider.viewType, provider);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        // The view will be automatically shown when the view container is clicked
        // This command is kept for compatibility but the view is managed by VS Code
        vscode.commands.executeCommand('thealmighty-container.focus');
    }
}
