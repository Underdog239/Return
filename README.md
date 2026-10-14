# 🧠 MindCraft Web — AI Minecraft Bot Control Center

A web-based control center for an AI Minecraft bot, built on
[mindcraft](https://github.com/mindcraft-bots/mindcraft) (vendored in [`mindcraft/`](mindcraft/), MIT license).

Watch your bot through a **live camera**, **talk to its mind** from the dashboard, and let it play
Minecraft on its own — smart navigation, bridging, PVP, hunting, and resource gathering included.

```
┌─────────────────────────────┬──────────────────────────┐
│  📷 Live camera (first      │  💬 Chat with the bot's  │
│     person / orbit / zoom)  │     mind (LLM)           │
│  ❤ health  🍗 food  📍 pos  │  ⚡ Quick commands        │
│  🎒 Inventory with icons    │  🧠 Autonomous mode      │
│  🖥 Live bot console        │  ↻ Restart / controls    │
└─────────────────────────────┴──────────────────────────┘
```

## Features

- **Web dashboard** (localhost:8080) — create, connect, disconnect, restart and remove bots from the browser
- **Live camera feed** — first-person view of what the bot sees (prismarine-viewer), orbit/zoom, fullscreen
- **Talk to the AI's mind** — natural language goes to the bot's LLM; `!commands` run instantly
- **Smart navigation** — automatically **sprints, jumps, breaks obstacles, bridges gaps** with blocks from
  the bot's inventory, opens doors, **finds alternative routes** around blockages, and clearly reports
  when a goal is unreachable instead of getting stuck
- **Advanced combat (`!pvp`)** — best-weapon selection, sprint approach, strafing circles, jump crits,
  retreat-and-eat when low health, creeper dodging; works on players and mobs
- **Resource gathering** — `!collectBlocks` mines with the best tools, `!hunt` kills animals and cooks the
  meat, `!craftRecipe` / `!smeltItem` handle the full supply chain
- **Autonomous mode (`!selfPrompt`)** — give the bot a goal and it keeps working on it by itself
- **Fully offline capable** — default brain is Ollama (local); no cloud API needed. Offline (LAN) server
  auth supported, no Microsoft account required
- **Minecraft Java Edition up to 1.21.11** (version auto-detected from the server)

## Quick start

Requirements:

- [Node.js](https://nodejs.org/) v18–v22 (LTS recommended)
- A Minecraft **Java Edition** server to point the bot at (vanilla, Paper, etc. up to 1.21.11),
  or a singleplayer world opened to LAN
- A brain: [Ollama](https://ollama.com) for 100% offline use (recommended), or an API key for any
  supported provider (OpenAI, Claude, Gemini, Grok, DeepSeek, Qwen, Mistral, Groq, OpenRouter, …)

```bash
cd mindcraft
npm install
node main.js
```

The dashboard opens automatically at **http://localhost:8080** (or run `./start.sh` / `start.bat`
from the repo root, which install and start everything for you).

> **Open the dashboard at `http://localhost:8080` — the address MindServer prints.**
> The dashboard is a control panel for a bot that runs on *your* computer, so it needs MindServer
> running next to it. Opening `index.html` directly, the GitHub Pages link, or the page from another
> device only works while MindServer is running and reachable — in those cases `127.0.0.1` means
> *that* device, not the computer running the bot.

Then:

1. Start your Minecraft server (or open your singleplayer world to LAN).
2. In the dashboard click **New Bot**:
   - **Bot name** — what the bot is called in game
   - **Server address / port** — e.g. `127.0.0.1:25565`; hit **Detect server** to verify
   - **Version** — leave on *Auto-detect*
   - **Account type** — *Offline / LAN* needs no Microsoft account
   - **Brain** — pick **Ollama** (offline) and a model, or a cloud provider and paste its API key
3. Click **Create & connect bot**. The camera goes live once the bot spawns.
4. Chat with your bot — try `!stats`, or just talk to it: *“go find a village and trade”*.

### Offline setup (recommended, zero cloud)

```bash
# one-time setup
ollama pull sweaterdog/andy-4:micro-q8_0   # mindcraft's own finetuned bot brain
ollama pull embeddinggemma                  # optional, improves example selection
```

Then pick **Ollama → sweaterdog/andy-4:micro-q8_0** in the wizard. Bigger models (llama3.3:70b,
qwen2.5:32b) make the bot noticeably smarter if your machine can run them.

### Connecting to a real (online-mode) server

Set **Account type: Microsoft** in the wizard. The bot logs in with the Minecraft account currently
active in your launcher (mindcraft will connect with it, then you can switch back to your main account).

## Using the dashboard

| Thing | How |
|---|---|
| See what the bot sees | Camera panel — drag to orbit, scroll to zoom, **P** for first person, ⛶ fullscreen |
| Make the bot do something | Chat box: plain English (the AI thinks about it) or `!command(...)` (instant) |
| Long-running goals | **🧠 Autonomous…** — the bot self-prompts until the goal is done |
| Watch its thoughts | The **Bot console** streams everything the agent logs, live |
| Check its gear | **Inventory** panel with item icons, equipment and armor |
| Emergency stop | **⏹ Stop** chip (sends `!stop`) |
| Multiple bots | **＋ New Bot** — each bot gets a tab; viewer ports are assigned automatically (3000+) |

### Key commands

Everything mindcraft supports, plus the smart-skills added by this project:

| Command | What it does |
|---|---|
| `!goToCoordinates(x, y, z)` | Smart navigation — sprints, jumps, digs through obstacles, bridges gaps, reroutes |
| `!bridgeTo(x, y, z)` | Manual sneaky-bridging across ravines/water (uses inventory blocks) |
| `!pvp("@hostile")` / `!pvp("Steve")` | Advanced combat: strafe, crits, retreat & eat, creeper dodge |
| `!hunt(5)` | Hunt animals, collect & cook meat |
| `!collectBlocks("oak_log", 10)` | Mine/gather resources with the best tools |
| `!selfPrompt("build a castle")` | Autonomous mode — works on the goal by itself |
| `!endGoal` | Stop autonomous mode |
| `!stats` / `!inventory` / `!goal` | Info queries |
| `!newAction("...")` | Let the LLM write custom code (enable `allow_insecure_coding` first) |

## Troubleshooting

### “Cannot reach MindServer” / “MindServer not reachable”

That message always means the same thing: **the browser page could not talk to the MindServer
backend** (`GET /api/health` on port 8080 failed). It is not an Ollama problem — Ollama is only
checked *after* MindServer answers.

The dashboard now searches for MindServer automatically (this page → port 8080 of this host → the
URL saved in the wizard → `127.0.0.1:8080` → `localhost:8080` → your machine's IP on port 8080) and
lists every address it tried. Use the **↻ Retry** button in the *New Bot* window after fixing one of
these:

| Cause | Fix |
|---|---|
| MindServer was never started, or it crashed | Run `./start.sh` (macOS/Linux) or `start.bat` (Windows), or `cd mindcraft && npm install && node main.js`. Keep that window open — closing it stops the bot. |
| `npm install` failed the first time (build tools, Node 23+) | See [`mindcraft/FAQ.md`](mindcraft/FAQ.md); Node **18–22 LTS** is recommended, or use `npm install --no-optional`. |
| Port 8080 already in use | MindServer now prints *“Port 8080 is already in use”* instead of a stack trace. Open `http://localhost:8080` if it is already running, otherwise free the port or change `mindserver_port` in [`mindcraft/settings.js`](mindcraft/settings.js). |
| You opened the page from a website (GitHub Pages) or another device | That page can only reach MindServer over the network: `127.0.0.1` then points at *that* device. Simplest fix: open **http://localhost:8080** (served by MindServer itself). For a bot on another machine, type its address (e.g. `http://192.168.1.20:8080`) into **MindServer host URL** and hit **↻ Retry**. |
| You opened `index.html` from the file system | Use `http://localhost:8080` instead — a `file://` page cannot load the dashboard's assets and API. |
| Browser blocks a page from calling localhost | Some browsers refuse `https://…` → `http://localhost` requests. Open `http://localhost:8080` (same origin) instead. |

### “Ollama not detected”

MindServer is fine (it answered) — Ollama itself is not responding on `127.0.0.1:11434`. Install it
from [ollama.com](https://ollama.com), start it, and run `ollama pull sweaterdog/andy-4:micro-q8_0`
(or `ollama list` to check what you have). You can also pick a cloud provider and paste an API key
instead of using Ollama.

## Configuration

- **Dashboard / server settings** — set in the *New Bot* wizard; stored in your browser. Deeper
  settings live in [`mindcraft/settings.js`](mindcraft/settings.js) (mindserver port, chat options,
  self-prompting limits, …).
- **API keys** — saved via the wizard to `mindcraft/keys.json` (git-ignored), or set as environment
  variables. See [`mindcraft/keys.example.json`](mindcraft/keys.example.json).
- **Bot personality / prompts** — mindcraft profiles in [`mindcraft/profiles/`](mindcraft/profiles/).
- **Binding** — the dashboard binds `0.0.0.0` so you can open it from other devices on your LAN
  (change `mindserver_host` in `settings.js` to `localhost` to restrict it).

## Architecture

```
mindcraft/
├── main.js                  ← entry point: starts the mindserver (dashboard)
├── settings.js              ← global settings
├── src/mindcraft/
│   ├── mindserver.js        ← socket.io hub + REST API + serves the dashboard
│   └── public/              ← THE DASHBOARD (index.html, app.js, style.css)
├── src/process/             ← each bot runs as a supervised child process (auto-restart)
├── src/agent/               ← the bot: LLM prompting, chat, memory, modes, commands
│   ├── commands/actions.js  ← command registry (incl. !pvp, !hunt, !bridgeTo)
│   └── library/skills.js    ← skills incl. the smart navigation & combat engine
├── patches/                 ← dependency fixes (applied automatically on npm install)
└── profiles/                ← bot profiles (models, prompts, examples)
```

Data flow: **Dashboard ⇄ mindserver (socket.io)** ⇄ agent process ⇄ mineflayer ⇄ your Minecraft server.
The camera is a prismarine-viewer server (port 3000+) embedded in the dashboard via iframe.

## Notes & credits

- Minecraft **Java Edition** only; supported up to **1.21.11** (auto-detected). For unsupported server
  versions, see mindcraft's [ViaProxy service](mindcraft/services/viaproxy/).
- The bot process is supervised: if it crashes it restarts automatically and reloads its memory.
- Do **not** enable `allow_insecure_coding` on untrusted servers — see the mindcraft README.
- Built on [mindcraft-bots/mindcraft](https://github.com/mindcraft-bots/mindcraft) by Kolby Nottingham
  et al. (MIT), [mineflayer](https://github.com/PrismarineJS/mineflayer) and the PrismarineJS ecosystem.
