import * as vscode from 'vscode';
import { SeraphicPersona } from './persona';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
}

export class TheAlmightyAgent {
    private static instance: TheAlmightyAgent;
    private persona: SeraphicPersona;
    private context: vscode.ExtensionContext | null = null;
    private conversationHistory: ChatMessage[] = [];
    private currentSessionId: string | null = null;
    private sessions: ChatSession[] = [];

    private constructor() {
        this.persona = new SeraphicPersona();
    }

    public static getInstance(): TheAlmightyAgent {
        if (!TheAlmightyAgent.instance) {
            TheAlmightyAgent.instance = new TheAlmightyAgent();
        }
        return TheAlmightyAgent.instance;
    }

    public async initialize(context: vscode.ExtensionContext) {
        this.context = context;
        await this.loadSessions();
        await this.loadCurrentSession();

        // Check on user periodically
        this.schedulePeriodicCheck();
    }

    private schedulePeriodicCheck() {
        // Check every 2 hours
        setInterval(() => {
            this.performPeriodicCheck();
        }, 2 * 60 * 60 * 1000);
    }

    private async performPeriodicCheck() {
        const checkIn = await this.generateCheckIn();
        // This will be sent to the panel if it's open
        vscode.commands.executeCommand('thealmighty.showCheckIn', checkIn);
    }

    public async processMessage(userMessage: string, sessionId?: string, conversationHistory?: Array<{role: string, content: string}>): Promise<string> {
        // Get or create session
        let isNewSession = false;
        if (sessionId) {
            this.switchSession(sessionId);
        } else if (!this.currentSessionId) {
            this.createNewSession('New Chat');
            isNewSession = true;
        }

        // Check if this is the first message in the session
        const session = this.currentSessionId ? this.sessions.find(s => s.id === this.currentSessionId) : null;
        const isFirstMessage = isNewSession || (session && session.messages.length === 0);

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date()
        });

        // Generate response using persona
        // Use provided history or fall back to stored history
        const historyToUse = conversationHistory ? conversationHistory.map(h => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
            timestamp: new Date() // Add timestamp for compatibility
        })) : this.conversationHistory;

        const response = await this.persona.generateResponse(
            userMessage,
            historyToUse,
            this.getContextualInfo()
        );

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date()
        });

        // Update session title if it's the first message
        if (isFirstMessage && session) {
            // Generate a title from the first user message
            const title = this.generateSessionTitle(userMessage);
            session.title = title;
        }

        // Save conversation history
        this.saveCurrentSession();

        return response;
    }


    private getContextualInfo(): ContextualInfo {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const activeEditor = vscode.window.activeTextEditor;
        const timeOfDay = this.getTimeOfDay();

        return {
            workspaceName: workspaceFolders?.[0]?.name || 'No workspace',
            activeFile: activeEditor?.document.fileName || 'No file open',
            language: activeEditor?.document.languageId || 'unknown',
            timeOfDay: timeOfDay,
            lineCount: activeEditor?.document.lineCount || 0,
            cursorPosition: activeEditor?.selection.active || null
        };
    }

    private getTimeOfDay(): string {
        const hour = new Date().getHours();
        if (hour < 6) return 'deep night';
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        if (hour < 22) return 'evening';
        return 'night';
    }

    private generateSessionTitle(firstMessage: string): string {
        // Generate a title from the first message (first 50 chars)
        const maxLength = 50;
        if (firstMessage.length <= maxLength) {
            return firstMessage;
        }
        return firstMessage.substring(0, maxLength) + '...';
    }

    public createNewSession(title: string = 'New Chat'): string {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date();
        const newSession: ChatSession = {
            id: sessionId,
            title,
            messages: [],
            createdAt: now,
            updatedAt: now
        };
        this.sessions.push(newSession);
        this.currentSessionId = sessionId;
        this.conversationHistory = [];
        this.saveSessions();
        return sessionId;
    }

    public switchSession(sessionId: string): boolean {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSessionId = sessionId;
            this.conversationHistory = [...session.messages];
            return true;
        }
        return false;
    }


    public updateSessionTitle(sessionId: string, title: string): boolean {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.title = title;
            session.updatedAt = new Date();
            this.saveSessions();
            return true;
        }
        return false;
    }

    public deleteCurrentSession(): boolean {
        if (!this.currentSessionId) {
            return false;
        }

        // Remove the session from the sessions array
        const sessionIndex = this.sessions.findIndex(s => s.id === this.currentSessionId);
        if (sessionIndex === -1) {
            return false;
        }

        this.sessions.splice(sessionIndex, 1);

        // If there are other sessions, switch to the most recent one
        if (this.sessions.length > 0) {
            // Sort by updatedAt descending and switch to the first one
            const sortedSessions = [...this.sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            this.switchSession(sortedSessions[0].id);
        } else {
            // No sessions left, create a new one
            this.createNewSession('New Chat');
        }

        this.saveSessions();
        return true;
    }

    public getSessions(): ChatSession[] {
        return [...this.sessions];
    }

    public getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }

    private async saveCurrentSession() {
        if (!this.context || !this.currentSessionId) return;
        
        const session = this.sessions.find(s => s.id === this.currentSessionId);
        if (session) {
            session.messages = [...this.conversationHistory];
            session.updatedAt = new Date();
            await this.saveSessions();
        }
    }

    private async saveSessions() {
        if (!this.context) return;
        const state = this.context.globalState;
        await state.update('thealmighty.sessions', this.sessions);
        await state.update('thealmighty.currentSessionId', this.currentSessionId);
    }

    private async loadSessions() {
        if (!this.context) return;
        const state = this.context.globalState;
        const saved = state.get<ChatSession[]>('thealmighty.sessions', []);
        this.sessions = saved.map(s => ({
            ...s,
            messages: s.messages.map(m => ({
                ...m,
                timestamp: new Date(m.timestamp)
            })),
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt)
        }));
    }

    private async loadCurrentSession() {
        if (!this.context) return;
        const state = this.context.globalState;
        this.currentSessionId = state.get<string | null>('thealmighty.currentSessionId', null);
        
        if (this.currentSessionId) {
            const session = this.sessions.find(s => s.id === this.currentSessionId);
            if (session) {
                this.conversationHistory = [...session.messages];
            } else {
                this.currentSessionId = null;
            }
        }
        
        // If no sessions exist, create a default one
        if (this.sessions.length === 0) {
            this.createNewSession('New Chat');
        }
    }

    public getConversationHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }

    public clearConversationHistory() {
        if (this.currentSessionId) {
            const session = this.sessions.find(s => s.id === this.currentSessionId);
            if (session) {
                session.messages = [];
            }
        }
        this.conversationHistory = [];
        this.saveCurrentSession();
    }

    public getPersona(): SeraphicPersona {
        return this.persona;
    }

    public async generateCheckIn(): Promise<string> {
        const contextualInfo = this.getContextualInfo();
        return await this.persona.generateCheckIn(contextualInfo);
    }
}

export interface ContextualInfo {
    workspaceName: string;
    activeFile: string;
    language: string;
    timeOfDay: string;
    lineCount: number;
    cursorPosition: vscode.Position | null;
}

