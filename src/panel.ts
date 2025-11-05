import * as vscode from "vscode";
import * as path from "path";
import { TheAlmightyAgent } from "./agent";

class TheAlmightyPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "thealmighty";

  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _configWatcher?: vscode.Disposable;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public dispose() {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
    if (this._configWatcher) {
      this._configWatcher.dispose();
      this._configWatcher = undefined;
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri)],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Reload webview when configuration changes (only create once)
    if (!this._configWatcher) {
      this._configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("thealmighty")) {
          if (this._view) {
            console.log("Configuration changed, reloading webview...");
            // Always reload the HTML to pick up new config values
            // Save conversation history before reload
            const history =
              TheAlmightyAgent.getInstance().getConversationHistory();

            // Reload HTML with new config
            this._view.webview.html = this._getHtmlForWebview(
              this._view.webview
            );

            // The webview will send 'ready' message after reload, which will trigger _loadConversationHistory
            // But we also set up a timeout as a fallback
            setTimeout(() => {
              if (this._view && history.length > 0) {
                // Check if messages were already loaded (via ready handler)
                // If not, load them now
                this._view.webview.postMessage({
                  command: "clearMessages",
                });

                // Load each message
                history.forEach((msg) => {
                  this._view!.webview.postMessage({
                    command: "addMessage",
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp.toISOString(),
                  });
                });
              }
            }, 300);
          }
        }
      });
    }

    // Handle messages from the webview
    const messageHandler = webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "ready":
            // Webview is ready, load history and sessions
            this._loadConversationHistory();
            this._handleGetSessions();
            break;
          case "sendMessage":
            await this._handleMessage(message.text);
            break;
          case "checkIn":
            await this._handleCheckIn();
            break;
          case "clearHistory":
            this._handleClearHistory();
            break;
          case "openSettings":
            this._handleOpenSettings();
            break;
          case "createNewSession":
            this._handleCreateNewSession();
            break;
          case "switchSession":
            this._handleSwitchSession(message.sessionId);
            break;
          case "deleteSession":
            this._handleDeleteSession(message.sessionId);
            break;
          case "updateSessionTitle":
            this._handleUpdateSessionTitle(message.sessionId, message.title);
            break;
          case "getSessions":
            this._handleGetSessions();
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
      command: "addMessage",
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Get response from agent
    const agent = TheAlmightyAgent.getInstance();
    const response = await agent.processMessage(userMessage);

    // Add response to UI
    this._view.webview.postMessage({
      command: "addMessage",
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
    });

    // Update sessions list (in case title changed)
    this._handleGetSessions();
  }

  private async _handleCheckIn() {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    const response = await agent.generateCheckIn();

    this._view.webview.postMessage({
      command: "addMessage",
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
    });
  }

  private _handleClearHistory() {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    agent.clearConversationHistory();

    this._view.webview.postMessage({
      command: "clearMessages",
    });
  }

  private _handleOpenSettings() {
    vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@thealmighty.deepseekApiKey"
    );
  }

  private _handleCreateNewSession() {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    const sessionId = agent.createNewSession("New Chat");

    this._view.webview.postMessage({
      command: "clearMessages",
    });

    this._handleGetSessions();
  }

  private _handleSwitchSession(sessionId: string) {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    if (agent.switchSession(sessionId)) {
      this._loadConversationHistory();
      this._view.webview.postMessage({
        command: "sessionSwitched",
        sessionId: sessionId,
      });
    }
  }

  private _handleDeleteSession(sessionId: string) {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    if (agent.deleteSession(sessionId)) {
      this._loadConversationHistory();
      this._handleGetSessions();
    }
  }

  private _handleUpdateSessionTitle(sessionId: string, title: string) {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    agent.updateSessionTitle(sessionId, title);
    this._handleGetSessions();
  }

  private _handleGetSessions() {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    const sessions = agent.getSessions();
    const currentSessionId = agent.getCurrentSessionId();

    this._view.webview.postMessage({
      command: "sessionsUpdated",
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      currentSessionId: currentSessionId,
    });
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
        command: "clearMessages",
      });

      // Load each message
      history.forEach((msg) => {
        this._view!.webview.postMessage({
          command: "addMessage",
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
        });
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the icon path
    const iconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "TheAlmighty-icon.png"
    );
    const iconUri = webview.asWebviewUri(iconPath);

    // Get configuration
    const config = vscode.workspace.getConfiguration("thealmighty");
    const fontSize = config.get<number>("fontSize", 13);
    const backgroundColor = config.get<string>("backgroundColor", "#1e1e1e");
    const textColor = config.get<string>("textColor", "#d4d4d4");
    const borderColor = config.get<string>("borderColor", "#3e3e3e");
    const userMessageColor = config.get<string>("userMessageColor", "#2d2d2d");
    const assistantMessageColor = config.get<string>(
      "assistantMessageColor",
      "#252526"
    );
    const inputColor = config.get<string>("inputColor", "#252526");
    const iconColorsEnabled = config.get<boolean>("iconColorsEnabled", false);
    const iconColor = config.get<string>("iconColor", "#ffffff");

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
            padding: 12px 15px;
            border-bottom: 1px solid ${borderColor};
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .header-icon {
            width: 24px;
            height: 24px;
            border-radius: 4px;
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

        .sessions-container {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: ${backgroundColor};
            border: 1px solid ${borderColor};
            border-top: none;
            max-height: 300px;
            overflow-y: auto;
            display: none;
            z-index: 1000;
        }

        .sessions-container.open {
            display: block;
        }

        .session-item {
            padding: 10px 15px;
            cursor: pointer;
            border-bottom: 1px solid ${borderColor};
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .session-item:hover {
            background: ${inputColor};
        }

        .session-item.active {
            background: ${assistantMessageColor};
        }

        .session-title {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: ${fontSize}px;
        }

        .session-actions {
            display: flex;
            gap: 5px;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .session-item:hover .session-actions {
            opacity: 1;
        }

        .session-action-btn {
            background: transparent;
            border: none;
            color: ${textColor};
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        .session-action-btn svg {
            width: 14px;
            height: 14px;
            fill: ${effectiveIconColor};
        }

        .session-action-btn:hover {
            opacity: 0.7;
        }

        .new-session-btn {
            padding: 10px 15px;
            background: ${borderColor};
            border: none;
            border-bottom: 1px solid ${borderColor};
            color: ${textColor};
            cursor: pointer;
            font-size: ${fontSize}px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
        }

        .new-session-btn:hover {
            opacity: 0.7;
        }

        .new-session-btn svg {
            width: 16px;
            height: 16px;
            fill: ${effectiveIconColor};
        }

        .header-title {
            cursor: pointer;
            position: relative;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${iconUri}" alt="TheAlmighty" class="header-icon" />
        <div class="header-title" id="headerTitle" onclick="toggleSessions()">The Seraphic Construct</div>
        <div class="sessions-container" id="sessionsContainer">
            <button class="new-session-btn" onclick="createNewSession()">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Chat
            </button>
            <div id="sessionsList"></div>
        </div>
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
        <div class="input-wrapper">
            <textarea 
                id="messageInput" 
                placeholder="Speak to The Seraphic Construct"
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
        const iconUri = "${iconUri}";

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

        // Session management
        let sessions = [];
        let currentSessionId = null;
        const sessionsContainer = document.getElementById('sessionsContainer');
        const sessionsList = document.getElementById('sessionsList');
        const headerTitle = document.getElementById('headerTitle');

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
                case 'sessionsUpdated':
                    sessions = message.sessions || [];
                    currentSessionId = message.currentSessionId;
                    updateSessionsList();
                    updateHeaderTitle();
                    break;
                case 'sessionSwitched':
                    currentSessionId = message.sessionId;
                    updateSessionsList();
                    updateHeaderTitle();
                    break;
            }
        });

        function toggleSessions() {
            sessionsContainer.classList.toggle('open');
        }

        function createNewSession() {
            vscode.postMessage({ command: 'createNewSession' });
            sessionsContainer.classList.remove('open');
        }

        function switchSession(sessionId) {
            vscode.postMessage({ command: 'switchSession', sessionId: sessionId });
            sessionsContainer.classList.remove('open');
        }

        function deleteSession(sessionId, event) {
            event.stopPropagation();
            if (confirm('Delete this chat session?')) {
                vscode.postMessage({ command: 'deleteSession', sessionId: sessionId });
            }
        }

        function updateSessionTitle(sessionId, event) {
            event.stopPropagation();
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return;
            
            const newTitle = prompt('Enter new title:', session.title);
            if (newTitle && newTitle.trim()) {
                vscode.postMessage({ command: 'updateSessionTitle', sessionId: sessionId, title: newTitle.trim() });
            }
        }

        function updateSessionsList() {
            if (!sessionsList) return;
            
            sessionsList.innerHTML = '';
            
            // Sort sessions by updatedAt (most recent first)
            const sortedSessions = [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            sortedSessions.forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = \`session-item \${session.id === currentSessionId ? 'active' : ''}\`;
                sessionItem.onclick = () => switchSession(session.id);
                
                const title = document.createElement('div');
                title.className = 'session-title';
                title.textContent = session.title;
                
                const actions = document.createElement('div');
                actions.className = 'session-actions';
                
                const editBtn = document.createElement('button');
                editBtn.className = 'session-action-btn';
                editBtn.title = 'Edit title';
                editBtn.onclick = (e) => updateSessionTitle(session.id, e);
                editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'session-action-btn';
                deleteBtn.title = 'Delete';
                deleteBtn.onclick = (e) => deleteSession(session.id, e);
                deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                
                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);
                
                sessionItem.appendChild(title);
                sessionItem.appendChild(actions);
                sessionsList.appendChild(sessionItem);
            });
        }

        function updateHeaderTitle() {
            if (!headerTitle) return;
            const currentSession = sessions.find(s => s.id === currentSessionId);
            if (currentSession) {
                headerTitle.textContent = currentSession.title;
            } else {
                headerTitle.textContent = 'The Seraphic Construct';
            }
        }

        // Close sessions dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!sessionsContainer.contains(e.target) && !headerTitle.contains(e.target)) {
                sessionsContainer.classList.remove('open');
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
                const iconImg = document.createElement('img');
                iconImg.src = iconUri;
                iconImg.alt = 'TheAlmighty';
                iconImg.style.width = '100%';
                iconImg.style.height = '100%';
                iconImg.style.objectFit = 'cover';
                iconImg.style.borderRadius = '50%';
                avatar.appendChild(iconImg);
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
    return vscode.window.registerWebviewViewProvider(
      TheAlmightyPanelProvider.viewType,
      provider
    );
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    // The view will be automatically shown when the view container is clicked
    // This command is kept for compatibility but the view is managed by VS Code
    vscode.commands.executeCommand("thealmighty-container.focus");
  }
}
