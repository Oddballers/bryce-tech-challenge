# Dev Container for ARIES Coding Challenge

This repository is ready to use with [GitHub Codespaces](https://github.com/features/codespaces) or locally with [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers).

## Features

- Node.js 20 (with Bun)
- Firebase CLI & Functions
- GitHub CLI
- Docker-in-Docker (for local emulators)
- Pre-installed VS Code extensions for JS/TS, Firebase, Docker, GitHub, ESLint, Prettier, and Copilot
- Ports 5173 (Vite), 5001 (Firebase Functions), 4000 (Firebase Emulator UI) forwarded

## Getting Started

1. **Open in Codespaces or VS Code with Dev Containers**
   - Click "Code" > "Open with Codespaces" (recommended)
   - Or, open locally in VS Code and "Reopen in Container"

2. **Install dependencies**

   ```sh
   bun install
   cd functions && bun install
   ```

3. **Run the app**
   - Start Vite frontend:

     ```sh
     bun run dev
     ```

   - In a new terminal, start Firebase emulators:

     ```sh
     firebase emulators:start --only functions,hosting
     ```

4. **Develop!**
   - All recommended extensions are pre-installed.
   - Code as if you were in the cloud.

## Notes

- Secrets (API keys, etc.) are not included. Use `.env` files or VS Code secrets for local dev.
- For cloud deployment, see the `README.md`.
