import * as vscode from 'vscode';
import { SeraphicPersona } from './persona';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export class TheAlmightyAgent {
    private static instance: TheAlmightyAgent;
    private persona: SeraphicPersona;
    private context: vscode.ExtensionContext | null = null;
    private conversationHistory: ChatMessage[] = [];

    private constructor() {
        this.persona = new SeraphicPersona();
    }

    public static getInstance(): TheAlmightyAgent {
        if (!TheAlmightyAgent.instance) {
            TheAlmightyAgent.instance = new TheAlmightyAgent();
        }
        return TheAlmightyAgent.instance;
    }

    public initialize(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadConversationHistory();
        
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

    public async processMessage(userMessage: string): Promise<string> {
        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date()
        });

        // Generate response using persona
        const response = await this.persona.generateResponse(
            userMessage,
            this.conversationHistory,
            this.getContextualInfo()
        );

        // Add assistant response to history
        this.conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date()
        });

        // Save conversation history
        this.saveConversationHistory();

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

    private async saveConversationHistory() {
        if (!this.context) return;
        const state = this.context.globalState;
        await state.update('thealmighty.conversation', this.conversationHistory);
    }

    private async loadConversationHistory() {
        if (!this.context) return;
        const state = this.context.globalState;
        const saved = state.get<ChatMessage[]>('thealmighty.conversation', []);
        this.conversationHistory = saved;
    }

    public getConversationHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }

    public clearConversationHistory() {
        this.conversationHistory = [];
        if (this.context) {
            this.context.globalState.update('thealmighty.conversation', []);
        }
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

