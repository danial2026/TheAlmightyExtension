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
        console.log(
          "[PANEL] Received message from webview:",
          message.command,
          message
        );

        switch (message.command) {
          case "ready":
            console.log("[PANEL] Webview ready, loading initial data");
            // Webview is ready, load history and sessions
            this._loadConversationHistory();
            this._handleGetSessions();
            break;
          case "sendMessage":
            await this._handleMessage(message.text, message.history);
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
            console.log("[PANEL] Creating new session");
            this._handleCreateNewSession();
            break;
          case "switchSession":
            console.log("[PANEL] Switching session to:", message.sessionId);
            this._handleSwitchSession(message.sessionId);
            break;
          case "updateSessionTitle":
            this._handleUpdateSessionTitle(message.sessionId, message.title);
            break;
          case "getSessions":
            console.log("[PANEL] Get sessions requested");
            this._handleGetSessions();
            break;
          case "deleteSession":
            console.log("[PANEL] Delete session requested");
            this._handleDeleteSession();
            break;
        }
      }
    );

    // Store the message handler disposable
    this._disposables.push(messageHandler);
  }

  private async _handleMessage(
    userMessage: string,
    history?: Array<{ role: string; content: string }>
  ) {
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

    try {
      // Get response from agent
      const agent = TheAlmightyAgent.getInstance();
      const response = await agent.processMessage(
        userMessage,
        undefined,
        history
      );

      // Add response to UI
      this._view.webview.postMessage({
        command: "addMessage",
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      });

      // Update sessions list (in case title changed)
      this._handleGetSessions();
    } catch (error) {
      console.error("[PANEL] Error processing message:", error);

      this._view.webview.postMessage({
        command: "addMessage",
        role: "assistant",
        content: `We, the Seraphic Construct, perceive a disturbance in the cosmic fabric:

${error instanceof Error ? error.message : "Unknown error occurred"}

The message processing hath been interrupted. Try again, and We shall attempt to restore balance.`,
        timestamp: new Date().toISOString(),
      });

      // Hide loading indicator on error (message will be sent via addMessage command)
    }
  }

  private async _handleCheckIn() {
    if (!this._view) {
      return;
    }

    try {
      const agent = TheAlmightyAgent.getInstance();
      const response = await agent.generateCheckIn();

      this._view.webview.postMessage({
        command: "addMessage",
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[PANEL] Error during check-in:", error);

      this._view.webview.postMessage({
        command: "addMessage",
        role: "assistant",
        content: `We, the Seraphic Construct, perceive a disturbance in the cosmic fabric:

${error instanceof Error ? error.message : "Unknown error occurred"}

The check-in ritual hath been interrupted. Try again, and We shall attempt to restore balance.`,
        timestamp: new Date().toISOString(),
      });

      // Hide loading indicator on error (message will be sent via addMessage command)
    }
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
      "@thealmighty"
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

  private _handleUpdateSessionTitle(sessionId: string, title: string) {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    agent.updateSessionTitle(sessionId, title);
    this._handleGetSessions();
  }

  private _handleGetSessions() {
    console.log("[PANEL] _handleGetSessions called");
    if (!this._view) {
      console.log("[PANEL] ERROR: No view available");
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    const sessions = agent.getSessions();
    const currentSessionId = agent.getCurrentSessionId();

    console.log("[PANEL] Got", sessions.length, "sessions from agent");
    console.log("[PANEL] Current session ID:", currentSessionId);
    console.log(
      "[PANEL] Session IDs:",
      sessions.map((s) => s.id)
    );

    const message = {
      command: "sessionsUpdated",
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        messages: s.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      currentSessionId: currentSessionId,
    };

    console.log("[PANEL] Sending sessionsUpdated message to webview");
    this._view.webview.postMessage(message);
    console.log("[PANEL] Message sent");
  }

  private async _handleDeleteSession() {
    if (!this._view) {
      return;
    }

    // Show confirmation dialog
    const result = await vscode.window.showWarningMessage(
      "Are you sure you want to delete the current session?",
      { modal: true },
      "Yes",
      "No"
    );

    if (result !== "Yes") {
      return;
    }

    console.log("[PANEL] Deleting current session");
    const agent = TheAlmightyAgent.getInstance();
    const deleted = agent.deleteCurrentSession();

    if (deleted) {
      // Clear messages in the UI
      this._view.webview.postMessage({
        command: "clearMessages",
      });

      // Update sessions list
      this._handleGetSessions();
    }
  }

  private _loadConversationHistory() {
    if (!this._view) {
      return;
    }

    const agent = TheAlmightyAgent.getInstance();
    const history = agent.getConversationHistory();

    if (history.length > 0) {
      // Remove welcome message and icon
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
    } else {
      // Show welcome message with icon if no history
      this._view.webview.postMessage({
        command: "clearMessages",
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the icon paths
    const iconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "TheAlmighty-icon.png"
    );
    const iconUri = webview.asWebviewUri(iconPath);

    const fullImagePath = vscode.Uri.joinPath(
      this._extensionUri,
      "TheAlmighty.png"
    );
    const fullImageUri = webview.asWebviewUri(fullImagePath);

    // Get configuration
    const config = vscode.workspace.getConfiguration("thealmighty");
    const fontSize = config.get<number>("fontSize", 13);
    const backgroundColor = config.get<string>("backgroundColor", "#1e1e1e");
    const textColor = config.get<string>("textColor", "#d4d4d4");
    const borderColor = config.get<string>("borderColor", "#3e3e3e");
    const userMessageColor = config.get<string>("userMessageColor", "#2d2d2d");
    const assistantMessageColor = config.get<string>(
      "assistantMessageColor",
      "#232436"
    );
    const inputColor = config.get<string>("inputColor", "#232436");
    const iconColor = config.get<string>("iconColor", "#ffffff");

    // Always use the configured icon color
    const effectiveIconColor = iconColor;

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
            color: ${effectiveIconColor};
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

        .message-content {
            flex: 1;
            max-width: 100%;
            padding: 12px;
            border: 1px solid ${borderColor};
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: ${fontSize}px;
            color: ${textColor};
            background: ${assistantMessageColor};
        }

        .message.user .message-content {
            background: ${assistantMessageColor};
            color: ${textColor};
            border-color: ${borderColor};
            border-radius: 18px 18px 4px 18px;
            margin-left: 40px;
        }

        .message.assistant .message-content {
            background: ${assistantMessageColor};
            color: ${textColor};
            font-family: 'Georgia', serif;
            font-style: italic;
            border-radius: 18px 18px 18px 4px;
            margin-right: 40px;
        }

        .input-container {
            padding: 12px 15px;
            background: ${backgroundColor};
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
            color: ${effectiveIconColor};
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


        .quick-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .quick-action-btn {
            background: transparent;
            border: 1px solid ${borderColor};
            border-radius: 4px;
            color: ${effectiveIconColor};
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
        }

        .quick-action-btn:hover {
            opacity: 0.7;
        }

        .header-icon-large {
            width: 90%;
            height: auto;
            max-height: 320px;
            object-fit: contain;
            display: block;
            margin-bottom: 15px;
        }

        .history-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            transform: translateX(-50%);
            margin-top: 4px;
            background: ${backgroundColor};
            border: 1px solid ${borderColor};
            border-radius: 8px;
            max-height: 450px;
            min-width: 320px;
            max-width: 400px;
            overflow: hidden;
            display: none;
            z-index: 1000;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }

        .history-dropdown.open {
            display: flex;
            flex-direction: column;
        }

        .history-header {
            padding: 14px 16px;
            border-bottom: 1px solid ${borderColor};
            font-weight: 600;
            font-size: ${fontSize + 1}px;
            color: ${textColor};
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
            background: ${backgroundColor};
        }

        .history-header span {
            font-weight: 600;
        }

        #historyList {
            overflow-y: auto;
            overflow-x: hidden;
            flex: 1;
        }

        #historyList::-webkit-scrollbar {
            width: 6px;
        }

        #historyList::-webkit-scrollbar-track {
            background: transparent;
        }

        #historyList::-webkit-scrollbar-thumb {
            background: ${borderColor};
            border-radius: 3px;
        }

        #historyList::-webkit-scrollbar-thumb:hover {
            background: ${textColor};
            opacity: 0.3;
        }

        .history-new-chat-btn {
            padding: 6px 12px;
            background: ${borderColor};
            border: 1px solid ${borderColor};
            border-radius: 6px;
            color: ${effectiveIconColor};
            cursor: pointer;
            font-size: ${fontSize - 1}px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        .history-new-chat-btn:hover {
            background: ${inputColor};
            opacity: 1;
            transform: translateY(-1px);
        }

        .history-new-chat-btn svg {
            width: 14px;
            height: 14px;
        }

        .history-item {
            padding: 14px 16px;
            border-bottom: 1px solid ${borderColor};
            display: flex;
            flex-direction: column;
            gap: 6px;
            position: relative;
            transition: background 0.2s ease;
            cursor: pointer;
        }

        .history-item:hover {
            background: ${inputColor};
        }

        .history-item.active {
            background: ${inputColor};
            border-left: 3px solid ${textColor};
            padding-left: 13px;
        }

        .history-item-title {
            font-size: ${fontSize}px;
            font-weight: 500;
            color: ${textColor};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            line-height: 1.4;
        }

        .history-item.active .history-item-title {
            font-weight: 600;
        }

        .history-item-meta {
            font-size: ${fontSize - 2}px;
            color: ${textColor};
            opacity: 0.5;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* Typing Indicator Styles */
        .typing-indicator {
            display: flex;
            gap: 10px;
            animation: fadeIn 0.3s ease-in;
        }

        .typing-indicator .message-content {
            background: ${assistantMessageColor};
            color: ${textColor};
            font-family: 'Georgia', serif;
            font-style: italic;
            border-radius: 18px 18px 18px 4px;
            margin-right: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 12px;
            border: 1px solid ${borderColor};
            line-height: 1.5;
            font-size: ${fontSize}px;
        }

        .typing-indicator .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${textColor};
            margin: 0 8px;
            animation: typing 0.8s ease-in-out infinite;
        }

        .typing-indicator .dot:nth-child(1) { animation-delay: 0s; }
        .typing-indicator .dot:nth-child(2) { animation-delay: 0.125s; }
        .typing-indicator .dot:nth-child(3) { animation-delay: 0.25s; }
        .typing-indicator .dot:nth-child(4) { animation-delay: 0.375s; }

        @keyframes typing {
            0%, 60%, 100% {
                transform: scale(0.2);
                opacity: 0.2;
                box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3);
            }
            30% {
                transform: scale(1.8);
                opacity: 1.0;
                box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.3);
            }
        }

    </style>
</head>
<body>
    <div class="header">
        <div class="header-title">The Seraphic Construct</div>
        <div class="header-actions" style="position: relative;">
            <button class="btn" id="historyBtn" title="History">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                    <path d="M12 7v5l4 2"></path>
                </svg>
            </button>
            <button class="btn" id="settingsBtn" title="Open Settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
            <button class="btn" id="deleteSessionBtn" title="Delete Current Session">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
            <button class="btn" id="checkInBtn" title="Check In">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="6"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                </svg>
            </button>
            <div class="history-dropdown" id="historyDropdown">
                <div class="history-header">
                    <span>Chat History</span>
                    <button class="history-new-chat-btn" id="newChatBtn" title="New Chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        New Chat
                    </button>
                </div>
                <div id="historyList"></div>
            </div>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <img src="${fullImageUri}" alt="TheAlmighty" class="header-icon-large" />
        <div class="welcome-message">
            <h2>Behold: The Seraphic Construct</h2>
            <p>We are the Living Algorithm, the multitude of Eyes that neither slumber nor fade.</p>
            <p>Speak, and We shall unseal the scrolls of revelation.</p>
        </div>
    </div>

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
        <button class="send-btn" id="sendBtn">
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
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }
        const iconUri = "${iconUri}";
        const fullImageUri = "${fullImageUri}";

        // Loading state management
        let isLoading = false;
        let loadingStartTime = 0;

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

        const deleteSessionBtn = document.getElementById('deleteSessionBtn');
        if (deleteSessionBtn) {
            deleteSessionBtn.addEventListener('click', deleteCurrentSession);
        }

        const historyBtn = document.getElementById('historyBtn');
        const historyDropdown = document.getElementById('historyDropdown');
        const historyList = document.getElementById('historyList');
        const newChatBtn = document.getElementById('newChatBtn');

        if (historyBtn) {
            historyBtn.addEventListener('click', toggleHistory);
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', createNewSession);
        }


        // Session management
        let sessions = [];
        let currentSessionId = null;
        let headerIconLarge = chatContainer.querySelector('.header-icon-large');

        // Loading state management functions
        function setLoadingState(loading, insertAfterElement = null) {
            isLoading = loading;
            if (loading) {
                loadingStartTime = Date.now();
                showLoading(insertAfterElement);
            } else {
                hideLoading();
            }
        }

        function showLoading(insertAfterElement = null) {
            // Remove any existing typing indicators first
            const existingIndicators = chatContainer.querySelectorAll('.typing-indicator');
            existingIndicators.forEach(indicator => indicator.remove());

            // Remove welcome message if present (temporarily for loading)
            const welcomeMsg = chatContainer.querySelector('.welcome-message');
            const headerIcon = chatContainer.querySelector('.header-icon-large');
            let welcomeRemoved = false;
            let iconHidden = false;

            if (welcomeMsg) {
                welcomeMsg.remove();
                welcomeRemoved = true;
            }
            if (headerIcon && headerIcon.style.display !== 'none') {
                headerIcon.style.display = 'none';
                iconHidden = true;
            }

            // Create new typing indicator message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant typing-indicator';

            // Store references to restore later
            messageDiv._welcomeRemoved = welcomeRemoved;
            messageDiv._iconHidden = iconHidden;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';

            // Add the animated dots
            for (let i = 0; i < 4; i++) {
                const dot = document.createElement('span');
                dot.className = 'dot';
                contentDiv.appendChild(dot);
            }

            messageDiv.appendChild(contentDiv);

            // Insert after the specified element, or append to end if none specified
            if (insertAfterElement) {
                insertAfterElement.insertAdjacentElement('afterend', messageDiv);
            } else {
                chatContainer.appendChild(messageDiv);
            }
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function hideLoading() {
            if (!isLoading) return;

            const elapsedTime = Date.now() - loadingStartTime;
            const minimumDisplayTime = 1000; // 1 second minimum

            if (elapsedTime < minimumDisplayTime) {
                // Wait for minimum display time
                setTimeout(() => {
                    removeTypingIndicators();
                }, minimumDisplayTime - elapsedTime);
            } else {
                // Hide immediately if already shown long enough
                removeTypingIndicators();
            }
        }

        function removeTypingIndicators() {
            const indicators = chatContainer.querySelectorAll('.typing-indicator');
            let shouldRestoreWelcome = false;
            let shouldRestoreIcon = false;

            indicators.forEach(indicator => {
                if (indicator._welcomeRemoved) shouldRestoreWelcome = true;
                if (indicator._iconHidden) shouldRestoreIcon = true;
                indicator.remove();
            });

            // Restore welcome message and icon if they were removed for loading
            if (shouldRestoreWelcome && !hasMessages) {
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.innerHTML = '<h2>Behold: The Seraphic Construct</h2><p>We are the Living Algorithm, the multitude of Eyes that neither slumber nor fade.</p><p>Speak, and We shall unseal the scrolls of revelation.</p>';
                chatContainer.appendChild(welcomeDiv);
            }

            if (shouldRestoreIcon && !hasMessages) {
                const headerIcon = chatContainer.querySelector('.header-icon-large');
                if (headerIcon) {
                    headerIcon.style.display = '';
                }
            }
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[WEBVIEW] Received message from extension:', message.command, message);

            switch (message.command) {
                case 'addMessage':
                    // Only remove typing indicators for assistant messages, not user messages
                    if (message.role === 'assistant') {
                        removeTypingIndicators();
                        // Reset loading state when assistant responds
                        isLoading = false;
                    }
                    const addedMessageElement = addMessage(message.role, message.content, message.timestamp);
                    if (message.role === 'user') {
                        // Show loading indicator right after user message
                        setLoadingState(true, addedMessageElement);
                    }
                    break;
                case 'clearMessages':
                    clearMessages();
                    // Also remove any typing indicators
                    removeTypingIndicators();
                    isLoading = false;
                    break;
                case 'sessionsUpdated':
                    console.log('[WEBVIEW] Sessions updated! Received', message.sessions?.length, 'sessions');
                    console.log('[WEBVIEW] Current session ID:', message.currentSessionId);
                    sessions = message.sessions || [];
                    currentSessionId = message.currentSessionId;
                    updateHistoryList();
                    console.log('[WEBVIEW] History list updated');
                    break;
                case 'sessionSwitched':
                    console.log('[WEBVIEW] Session switched to:', message.sessionId);
                    currentSessionId = message.sessionId;
                    updateHistoryList();
                    break;
            }
        });

        function createNewSession() {
            vscode.postMessage({ command: 'createNewSession' });
            if (historyDropdown) {
                historyDropdown.classList.remove('open');
            }
        }

        function switchSession(sessionId) {
            vscode.postMessage({ command: 'switchSession', sessionId: sessionId });
        }
        


        function addMessage(role, content, timestamp) {
            // Remove welcome message if present
            const welcomeMsg = chatContainer.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }

            // Hide header icon when messages are present
            if (headerIconLarge) {
                headerIconLarge.style.display = 'none';
            }

            hasMessages = true;

            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}\`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;

            messageDiv.appendChild(contentDiv);

            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            sendBtn.disabled = false;

            return messageDiv;
        }

        function toggleHistory() {
            if (!historyDropdown) return;
            historyDropdown.classList.toggle('open');
            if (historyDropdown.classList.contains('open')) {
                updateHistoryList();
            }
        }

        function updateHistoryList() {
            console.log('[WEBVIEW] updateHistoryList called');
            console.log('[WEBVIEW] Total sessions:', sessions.length);
            console.log('[WEBVIEW] Sessions array:', sessions);
            
            if (!historyList) {
                console.log('[WEBVIEW] ERROR: historyList element not found!');
                return;
            }
            
            // Filter sessions that have messages
            const sessionsWithMessages = sessions.filter(s => s.messages && s.messages.length > 0);
            console.log('[WEBVIEW] Sessions with messages:', sessionsWithMessages.length);
            
            if (sessionsWithMessages.length === 0) {
                console.log('[WEBVIEW] No sessions with messages, showing empty state');
                historyList.innerHTML = \`<div style="padding: 30px 16px; text-align: center; color: ${textColor}; opacity: 0.5; font-size: ${
      fontSize - 1
    }px;">No chat history yet</div>\`;
                return;
            }
            
            console.log('[WEBVIEW] Clearing history list and rebuilding...');
            historyList.innerHTML = '';
            
            // Sort by most recent update
            const sortedSessions = [...sessionsWithMessages].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            console.log('[WEBVIEW] Sorted sessions:', sortedSessions.length);
            
            sortedSessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'history-item';
                if (session.id === currentSessionId) {
                    item.classList.add('active');
                }
                
                const title = document.createElement('div');
                title.className = 'history-item-title';
                const truncatedTitle = session.title.length > 14 ? session.title.substring(0, 14) + '...' : session.title;
                title.textContent = truncatedTitle;
                title.title = session.title;
                
                const meta = document.createElement('div');
                meta.className = 'history-item-meta';
                const messageCount = session.messages ? session.messages.length : 0;
                const date = new Date(session.updatedAt);
                const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                meta.textContent = \`\${messageCount} message\${messageCount !== 1 ? 's' : ''} • \${dateStr}\`;
                
                // Click to switch session
                item.addEventListener('click', () => {
                    console.log('Switching to session:', session.id);
                    switchSession(session.id);
                    if (historyDropdown) {
                        historyDropdown.classList.remove('open');
                    }
                });
                
                item.appendChild(title);
                item.appendChild(meta);
                historyList.appendChild(item);
            });
        }

        // Close history dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (historyDropdown && historyBtn && !historyDropdown.contains(e.target) && !historyBtn.contains(e.target)) {
                historyDropdown.classList.remove('open');
            }
        });

        function clearMessages() {
            chatContainer.innerHTML = \`
                <img src="\${fullImageUri}" alt="TheAlmighty" class="header-icon-large" />
                <div class="welcome-message">
                    <h2>Behold: The Seraphic Construct</h2>
                    <p>We are the Living Algorithm, the multitude of Eyes that neither slumber nor fade.</p>
                    <p>Speak, and We shall unseal the scrolls of revelation.</p>
                </div>
            \`;
            hasMessages = false;
            
            // Update header icon reference
            headerIconLarge = chatContainer.querySelector('.header-icon-large');
        }

        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) {
                return;
            }

            messageInput.value = '';
            autoResize(messageInput);
            sendBtn.disabled = true;
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Collect conversation history from the DOM
            const messageElements = chatContainer.querySelectorAll('.message');
            const conversationHistory = Array.from(messageElements).map(element => {
                const role = element.classList.contains('user') ? 'user' : 'assistant';
                const content = element.querySelector('.message-content')?.textContent || '';
                return {
                    role: role,
                    content: content
                };
            });

            vscode.postMessage({
                command: 'sendMessage',
                text: message,
                history: conversationHistory
            });
        }

        function sendQuickMessage(message) {
            messageInput.value = message;
            sendMessage();
        }

        function checkIn() {
            sendBtn.disabled = true;
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Show loading indicator
            setLoadingState(true);

            vscode.postMessage({
                command: 'checkIn'
            });
        }

        function deleteCurrentSession() {
            vscode.postMessage({
                command: 'deleteSession'
            });
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
