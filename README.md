# Research Companion

Local-first research decision companion for papers, notes, and project ideas.

## Quick Start

From the repository root, run one command.

### WSL / macOS / Linux

```bash
./run.sh
```

### Windows PowerShell

```powershell
.\run.ps1
```

On the first run, the script creates `research_companion/.env` and stops. Open
that file, replace `ANTHROPIC_API_KEY`, then run the same command again.

The script will:

1. create the Python virtual environment
2. install backend dependencies
3. install frontend dependencies
4. start the Electron app

First install can take a while because embedding and reranking dependencies are
large. Later runs should go straight to app startup.

## Manual Run

If you prefer to run services separately:

```bash
cd research_companion
source .venv/bin/activate
uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload
```

Then in another terminal:

```bash
cd app
npm run dev
```
