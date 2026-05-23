# Code Sandbox

This is my browser-based coding sandbox for the assessment. The goal was to build a small IDE-like environment where someone can create a project, manage files, write code, run commands, and preview the result without opening VS Code or setting anything up locally.

It is built with the MERN stack:

- MongoDB for persisted projects and files
- Express + Node for the API, code execution, terminal commands, package installs, and preview server control
- React + Vite for the browser IDE
- Monaco Editor for the code editor experience

## What Works

- Create, rename, edit, and delete files/folders
- Create files inside nested folders from the Explorer
- Monaco editor with tabs and autosave
- MongoDB-backed project persistence
- Built-in terminal with safe project commands like `cd`, `pwd`, `cwd`, `ls`, `dir`, `touch`, `mkdir`, `cat`, `echo`, plus `npm`, `node`, and `python`
- Persistent terminal working directory per project
- HTML/CSS/JS live preview
- Project preview for projects that have a `package.json` `dev` script
- npm package install support
- `package.json`, `package-lock.json`, and a shallow `node_modules` marker sync back into the Explorer
- Resizable Explorer and Preview panels, similar to VS Code
- Lightweight local session ownership using a browser-generated session id

## Architecture

The app is split into a React client and an Express server.

```txt
client/
  src/components/       Editor UI pieces like FileTree, CodeEditor, Terminal, Preview
  src/pages/            Dashboard and Editor screens
  src/services/api.js   Axios API client

server/
  models/               Mongoose Project and File schemas
  controllers/          Main business logic
  routes/               API routes
  config/               MongoDB connection
```

MongoDB is the source of truth for project files. Each file/folder is stored with a `projectId`, `path`, `type`, and `content`. The frontend rebuilds the Explorer tree from those flat records.

For commands and npm installs, the backend materializes the project into a temp workspace, runs the command there, and then syncs safe artifacts back into MongoDB. This lets npm work with a normal filesystem while still keeping the browser project persistent.

## Important Technical Choices

I did not expose a fully unrestricted shell. That would be dangerous in a browser-based app because users could run arbitrary host commands. Instead, I implemented safe built-ins for normal project work and allow selected runtime commands.

I also chose not to fully import `node_modules` into MongoDB. A real dependency tree can contain thousands of files, and syncing all of them would make the Explorer slow and noisy. The app shows `node_modules` as a folder marker and keeps the important package artifacts visible.

The preview has two paths:

- Vanilla HTML/CSS/JS projects are rendered directly in a sandboxed iframe.
- Projects with a `package.json` `dev` script can start a local dev-preview server and load that URL in the iframe.

## Running Locally

Install everything:

```bash
npm run install-all
```

Start the app:

```bash
npm.cmd run dev
```

Frontend:

```txt
http://localhost:5173
```

Backend:

```txt
http://localhost:5000
```

If ports are stuck from an old dev server, run:

```bash
npm.cmd run free-ports
npm.cmd run dev
```

## API Overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/POST | `/api/projects` | List/create projects |
| GET/PUT/DELETE | `/api/projects/:id` | Read/update/delete one project |
| GET/POST | `/api/files/:projectId` | List/create files and folders |
| GET/PUT/DELETE | `/api/files/:projectId/:fileId` | Read/update/delete one file |
| POST | `/api/execute` | Run JS/Python snippets |
| POST | `/api/terminal/:projectId` | Run a safe terminal command |
| POST | `/api/packages/install` | Install an npm package |
| GET | `/api/packages/:projectId` | List dependencies |
| POST | `/api/preview/:projectId/start` | Start project dev preview |
| POST | `/api/preview/:projectId/stop` | Stop project dev preview |

## How I Used AI

I used AI as a coding assistant throughout the build, but I did not treat it as a replacement for understanding the app.

Where AI helped most:

- Quickly scaffolding repetitive MERN CRUD code
- Debugging Windows-specific issues with `npm`, PowerShell, and port conflicts
- Thinking through how to sync terminal-created files back into MongoDB
- Improving edge cases around nested files, preview behavior, and terminal cwd
- Drafting and refining this README and the walkthrough structure

Where I had to reason through things myself:

- Deciding not to expose a fully unrestricted shell
- Choosing shallow `node_modules` sync for performance
- Designing the temp workspace plus MongoDB persistence flow
- Handling preview in two modes instead of pretending iframe preview can run every framework automatically
- Testing with builds, API calls, and browser checks after each change

Example prompts I used:

- "Trace why terminal commands spawned from Express fail on Windows with ENOENT."
- "Add safe terminal commands and sync generated files back to MongoDB."
- "Make nested folder file creation work like VS Code."
- "Improve the README so it explains AI usage honestly for an assessment."

## Video Walkthrough Plan

In the video, I would show:

1. Creating/opening a project from the dashboard.
2. Creating folders and files in the Explorer.
3. Editing files in Monaco and showing autosave.
4. Opening Live Preview for HTML/CSS/JS.
5. Running terminal commands like `mkdir`, `cd`, `touch`, and `ls`.
6. Installing an npm package and showing package artifacts in the Explorer.
7. Explaining the backend architecture: Mongo records, temp workspace, command sync, preview server.
8. Explaining exactly how AI helped and which decisions I made manually.
9. Being honest about limitations and what I would improve next.

## Known Limitations

This is a strong prototype, not a production-secure sandbox.

- Code execution is done with child processes, not containers.
- The terminal is intentionally limited for safety.
- `node_modules` is shown shallowly instead of fully imported.
- Project preview depends on a valid `package.json` `dev` script.
- Local session ownership is not full authentication.
- There is no collaborative editing or Git integration yet.
- The IDE layout is designed for desktop screens.

## What I Would Add Next

- Docker/gVisor/Firecracker isolation for real user-submitted code
- Proper authentication and project ownership
- WebSocket streaming for terminal output
- A stronger in-browser bundling story for React/import-heavy projects
- Git integration
- Automated tests for file sync, terminal commands, and preview lifecycle
