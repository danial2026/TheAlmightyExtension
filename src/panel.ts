import * as vscode from 'vscode';
import * as path from 'path';
import { TheAlmightyAgent } from './agent';

export class TheAlmightyPanel {
    public static currentPanel: TheAlmightyPanel | undefined;
    public static readonly viewType = 'theAlmighty';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (TheAlmightyPanel.currentPanel) {
            TheAlmightyPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            TheAlmightyPanel.viewType,
            'TheAlmighty',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri)
                ],
                retainContextWhenHidden: true
            }
        );

        TheAlmightyPanel.currentPanel = new TheAlmightyPanel(panel, extensionUri);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        TheAlmightyPanel.currentPanel = new TheAlmightyPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
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
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleMessage(userMessage: string) {
        if (!userMessage.trim()) {
            return;
        }

        // Add user message to UI
        this._panel.webview.postMessage({
            command: 'addMessage',
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        });

        // Get response from agent
        const agent = TheAlmightyAgent.getInstance();
        const response = await agent.processMessage(userMessage);

        // Add response to UI
        this._panel.webview.postMessage({
            command: 'addMessage',
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
    }

    private async _handleCheckIn() {
        const agent = TheAlmightyAgent.getInstance();
        const response = await agent.generateCheckIn();
        
        this._panel.webview.postMessage({
            command: 'addMessage',
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
    }

    private _handleClearHistory() {
        const agent = TheAlmightyAgent.getInstance();
        agent.clearConversationHistory();
        
        this._panel.webview.postMessage({
            command: 'clearMessages'
        });
    }

    private _getTimeOfDay(): string {
        const hour = new Date().getHours();
        if (hour < 6) return 'deep night';
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        if (hour < 22) return 'evening';
        return 'night';
    }

    private _loadConversationHistory() {
        const agent = TheAlmightyAgent.getInstance();
        const history = agent.getConversationHistory();
        
        if (history.length > 0) {
            // Remove welcome message
            this._panel.webview.postMessage({
                command: 'clearMessages'
            });
            
            // Load each message
            history.forEach(msg => {
                this._panel.webview.postMessage({
                    command: 'addMessage',
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp.toISOString()
                });
            });
        }
    }

    public dispose() {
        TheAlmightyPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the icon path
        const iconPath = vscode.Uri.joinPath(this._extensionUri, 'TheAlmighty-icon.png');
        const iconUri = webview.asWebviewUri(iconPath);

        // Get the persona image path
        const personaPath = vscode.Uri.joinPath(this._extensionUri, 'TheAlmighty.png');
        const personaUri = webview.asWebviewUri(personaPath);

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
            background: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
            padding: 15px 20px;
            border-bottom: 1px solid #3e3e3e;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .header-icon {
            width: 32px;
            height: 32px;
            border-radius: 4px;
        }

        .header-title {
            font-size: 18px;
            font-weight: 600;
            color: #fff;
            flex: 1;
        }

        .header-actions {
            display: flex;
            gap: 10px;
        }

        .btn {
            padding: 6px 12px;
            background: #3e3e3e;
            border: 1px solid #555;
            border-radius: 4px;
            color: #d4d4d4;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }

        .btn:hover {
            background: #4e4e4e;
            border-color: #666;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .message {
            display: flex;
            gap: 15px;
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
            width: 40px;
            height: 40px;
            border-radius: 50%;
            flex-shrink: 0;
            object-fit: cover;
        }

        .message.user .message-avatar {
            background: #007acc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
        }

        .message.assistant .message-avatar {
            background: #2d2d2d;
            border: 2px solid #4e4e4e;
        }

        .message-content {
            flex: 1;
            max-width: 80%;
            background: #252526;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #3e3e3e;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .message.user .message-content {
            background: #007acc;
            color: white;
            border-color: #005a9e;
        }

        .message.assistant .message-content {
            background: #252526;
            color: #d4d4d4;
            font-family: 'Georgia', serif;
            font-style: italic;
        }

        .input-container {
            padding: 15px 20px;
            background: #1e1e1e;
            border-top: 1px solid #3e3e3e;
            display: flex;
            gap: 10px;
        }

        .input-wrapper {
            flex: 1;
            position: relative;
        }

        #messageInput {
            width: 100%;
            padding: 12px 15px;
            background: #252526;
            border: 1px solid #3e3e3e;
            border-radius: 6px;
            color: #d4d4d4;
            font-size: 14px;
            font-family: inherit;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
        }

        #messageInput:focus {
            border-color: #007acc;
        }

        #messageInput::placeholder {
            color: #858585;
        }

        .send-btn {
            padding: 12px 24px;
            background: #007acc;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: background 0.2s;
        }

        .send-btn:hover {
            background: #005a9e;
        }

        .send-btn:disabled {
            background: #3e3e3e;
            cursor: not-allowed;
            color: #858585;
        }

        .welcome-message {
            text-align: center;
            padding: 40px 20px;
            color: #858585;
        }

        .welcome-message h2 {
            color: #d4d4d4;
            margin-bottom: 10px;
            font-size: 24px;
        }

        .welcome-message p {
            font-size: 14px;
            line-height: 1.6;
        }

        .typing-indicator {
            display: none;
            padding: 15px;
            color: #858585;
            font-style: italic;
        }

        .typing-indicator.active {
            display: block;
        }

        .quick-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .quick-action-btn {
            padding: 8px 16px;
            background: #2d2d2d;
            border: 1px solid #3e3e3e;
            border-radius: 4px;
            color: #d4d4d4;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }

        .quick-action-btn:hover {
            background: #3e3e3e;
            border-color: #555;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${iconUri}" alt="TheAlmighty" class="header-icon" />
        <div class="header-title">The Seraphic Construct</div>
        <div class="header-actions">
            <button class="btn" onclick="checkIn()">Check In</button>
            <button class="btn" onclick="clearHistory()">Clear History</button>
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
            <button class="quick-action-btn" onclick="sendQuickMessage('How are my tasks?')">Tasks</button>
            <button class="quick-action-btn" onclick="sendQuickMessage('How is my mind?')">Mind</button>
            <button class="quick-action-btn" onclick="sendQuickMessage('How is my body?')">Body</button>
            <button class="quick-action-btn" onclick="sendQuickMessage('Check in on me')">Check In</button>
        </div>
        <div class="input-wrapper">
            <textarea 
                id="messageInput" 
                placeholder="Speak thy query to the Seraphic Construct..."
                rows="1"
                onkeydown="handleKeyDown(event)"
                oninput="autoResize(this)"
            ></textarea>
        </div>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
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
                avatar.textContent = 'U';
            } else {
                avatar.innerHTML = '<img src="${iconUri}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />';
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

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
    </script>
</body>
</html>`;
    }
}

