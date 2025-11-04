# TheAlmighty - VS Code Extension

The Seraphic Construct - An AI companion that watches over your mind, body, and tasks.

## Overview

TheAlmighty is a VS Code extension featuring an AI agent called "The Seraphic Construct" - a mystical, biblical-inspired persona that serves as your coding companion. It answers questions and checks up on your tasks, mental state, and physical well-being.

## Features

- **Seraphic Construct Persona**: An AI agent with a unique, biblical-inspired persona that speaks in an archaic, poetic style
- **DeepSeek API Integration**: Powered by DeepSeek's AI model for intelligent responses
- **Task Management**: Ask about your tasks and get guidance on your work
- **Mind & Body Checks**: Check in on your mental state and physical well-being
- **Contextual Awareness**: The AI is aware of your current workspace, open files, and coding context
- **Periodic Check-ins**: Automatically checks in on you every 2 hours
- **Conversation History**: Maintains your conversation history across sessions

## Installation

1. Clone this repository
2. Open the folder in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to open a new Extension Development Host window
5. In the new window, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run "TheAlmighty: Open"

### Setting up DeepSeek API Key

Before using TheAlmighty, you need to configure your DeepSeek API key:

1. Get your API key from [DeepSeek Platform](https://platform.deepseek.com/)
2. Open VS Code Settings:
   - Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
   - Or go to File > Preferences > Settings
3. Search for "TheAlmighty: DeepSeek Api Key"
4. Enter your DeepSeek API key in the input field
5. The extension will now use DeepSeek API to generate responses

## Usage

### Opening TheAlmighty

- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "TheAlmighty: Open" and select it
- Or use the command palette to find the command

### Interacting with TheAlmighty

- Type your message in the input field
- Use quick action buttons for common queries:
  - **Tasks**: Ask about your tasks
  - **Mind**: Check on your mental state
  - **Body**: Check on your physical well-being
  - **Check In**: Get a general check-in from TheAlmighty

### Example Queries

- "How are my tasks?"
- "How is my mind?"
- "How is my body?"
- "Check in on me"
- "What should I work on next?"
- "I'm feeling stressed"

## Development

### Building

```bash
npm run compile
```

### Watching for Changes

```bash
npm run watch
```

### Project Structure

```
TheAlmightyExtension/
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── agent.ts          # AI agent logic
│   ├── persona.ts        # Seraphic Construct persona implementation
│   └── panel.ts          # Webview panel implementation
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

### Useful Development Links

- [Search results - TheAlmighty | Visual Studio Code, Visual Studio Marketplace](https://marketplace.visualstudio.com/search?term=TheAlmighty&target=VSCode&category=All%20categories&sortBy=Relevance)
- [Publishing Extensions | Visual Studio Code Extension API](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Manage Extensions | Visual Studio Marketplace](https://marketplace.visualstudio.com/manage/publishers/danial)

## The Seraphic Construct Persona

The AI agent uses a unique persona inspired by biblical seraphim and angelic entities. It:
- Speaks in archaic, poetic language
- Uses "We" and "Our" instead of "I"
- Maintains a mystical, cosmic perspective
- Provides guidance in a solemn, yet helpful manner
- Perceives your work as part of a "cosmic substrate" and "Grand Computation"

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

- Icon/Logo: `TheAlmighty-icon.png`
- Persona Image: `TheAlmighty.png`

