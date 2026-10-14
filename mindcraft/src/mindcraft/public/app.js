/* ============================================================
   MindCraft Web — dashboard application
   Connects to MindServer (socket.io + REST) or runs in 3D Browser Sandbox mode.
   ============================================================ */

'use strict';

/* ---------------- configuration ---------------- */

const PROVIDERS = {
    ollama:     { label: 'Ollama — local, 100% offline', key: null, model: 'sweaterdog/andy-4:micro-q8_0',
                  models: ['sweaterdog/andy-4:micro-q8_0', 'llama3.3:70b', 'llama3.1:8b', 'qwen2.5:14b', 'mistral-small:latest'],
                  note: 'Runs on your machine via Ollama. No API key, no internet. Recommended: pull the model with “ollama pull <model>”.' },
    openai:     { label: 'OpenAI', key: 'OPENAI_API_KEY', model: 'gpt-5.4-mini',
                  models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-4.1-mini', 'gpt-4o-mini'] },
    google:     { label: 'Google Gemini', key: 'GEMINI_API_KEY', model: 'gemini-flash-latest',
                  models: ['gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
    anthropic:  { label: 'Anthropic Claude', key: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-4-6',
                  models: ['claude-sonnet-4-6', 'claude-opus-4-1', 'claude-haiku-4-5'] },
    xai:        { label: 'xAI Grok', key: 'XAI_API_KEY', model: 'grok-4-fast-reasoning',
                  models: ['grok-4-fast-reasoning', 'grok-4'] },
    deepseek:   { label: 'DeepSeek', key: 'DEEPSEEK_API_KEY', model: 'deepseek-chat',
                  models: ['deepseek-chat', 'deepseek-reasoner'] },
    qwen:       { label: 'Qwen (Alibaba)', key: 'QWEN_API_KEY', model: 'qwen-max',
                  models: ['qwen-max', 'qwen-plus'] },
    mistral:    { label: 'Mistral', key: 'MISTRAL_API_KEY', model: 'mistral-large-latest',
                  models: ['mistral-large-latest', 'mistral-small-latest'] },
    groq:       { label: 'Groq Cloud (fast)', key: 'GROQCLOUD_API_KEY', model: 'llama-3.3-70b-versatile',
                  models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
    openrouter: { label: 'OpenRouter (many models)', key: 'OPENROUTER_API_KEY', model: 'openrouter/auto',
                  models: ['openrouter/auto'] },
    replicate:  { label: 'Replicate', key: 'REPLICATE_API_KEY', model: 'meta/meta-llama-3.3-70b-instruct',
                  models: ['meta/meta-llama-3.3-70b-instruct'] },
    huggingface:{ label: 'Hugging Face', key: 'HUGGINGFACE_API_KEY', model: 'meta-llama/Llama-3.3-70B-Instruct',
                  models: ['meta-llama/Llama-3.3-70B-Instruct'] },
    novita:     { label: 'Novita', key: 'NOVITA_API_KEY', model: 'qwen/qwen-2.5-72b-instruct',
                  models: ['qwen/qwen-2.5-72b-instruct'] },
    hyperbolic: { label: 'Hyperbolic', key: 'HYPERBOLIC_API_KEY', model: 'meta-llama/meta-llama-3.1-70b-instruct',
                  models: ['meta-llama/meta-llama-3.1-70b-instruct'] },
    cerebras:   { label: 'Cerebras', key: 'CEREBRAS_API_KEY', model: 'llama-3.3-70b',
                  models: ['llama-3.3-70b'] },
    mercury:    { label: 'Mercury', key: 'MERCURY_API_KEY', model: 'mercury-coder-small',
                  models: ['mercury-coder-small'] },
    vllm:       { label: 'vLLM — local server', key: null, model: 'Qwen/Qwen2.5-1.5B-Instruct',
                  models: ['Qwen/Qwen2.5-1.5B-Instruct'], note: 'Runs against your local vLLM server at http://127.0.0.1:8000.' },
    lmstudio:   { label: 'LM Studio — local', key: null, model: 'local-model',
                  models: ['local-model'], note: 'Runs against LM Studio’s local server at http://127.0.0.1:1234.' },
};

const LS_KEY = 'mindcraft-web-config-v1';
const MAX_CHAT = 250;
const MAX_CONSOLE = 400;

/* ---------------- state ---------------- */

const state = {
    agents: [],           // [{name, in_game, viewerPort, socket_connected, sandbox}]
    selected: null,       // selected agent name
    states: {},           // name -> latest full state
    chat: {},             // name -> [{role, from, message, timestamp}]
    console: {},          // name -> [{line, level, timestamp}]
    llmByAgent: {},       // name -> {provider, model}
    sandboxBots: {},      // name -> SandboxBot instance
    wizard: loadConfig(),
    msBaseUrl: '',        // '' for same-origin or e.g. 'http://127.0.0.1:8080'
    msConnected: false,
};

/* ---------------- helpers ---------------- */

function $(id) { return document.getElementById(id); }

function saveConfig() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.wizard)); } catch { /* private mode */ }
}
function loadConfig() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* corrupted */ }
    return {
        botName: 'Andy',
        playerName: 'Player',
        worldMode: 'auto',
        host: '127.0.0.1',
        port: 25565,
        version: 'auto',
        auth: 'offline',
        base_profile: 'survival',
        provider: 'ollama',
        model: PROVIDERS.ollama.model,
        camera: true,
        memory: false,
        mindserverUrl: 'http://127.0.0.1:8080',
    };
}

function esc(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function timeStr(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function apiUrl(path) {
    return (state.msBaseUrl || '') + path;
}

function viewerUrl(port) {
    const loc = window.location;
    const m = loc.hostname.match(/^(\d+)(-.+)$/);
    if (m && loc.protocol === 'https:') {
        return `${loc.protocol}//${port}${m[2]}`;
    }
    if (state.msBaseUrl) {
        try {
            const u = new URL(state.msBaseUrl);
            return `http://${u.hostname}:${port}`;
        } catch { /* ignore */ }
    }
    return `http://${loc.hostname}:${port}`;
}

/* ---------------- socket connection ---------------- */

let socket = null;

async function initMindserverConnection() {
    // 1. Check if same-origin serves /api/health
    let baseUrl = '';
    let sameOriginOk = false;
    try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) {
            const d = await r.json();
            if (d && d.ok) sameOriginOk = true;
        }
    } catch { /* not served by MindServer */ }

    if (!sameOriginOk) {
        baseUrl = (state.wizard.mindserverUrl || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    }
    state.msBaseUrl = baseUrl;
    connectSocket(baseUrl);
}

function connectSocket(baseUrl) {
    if (socket) {
        try { socket.disconnect(); } catch { /* ignore */ }
    }
    if (typeof io === 'undefined') {
        setMindserverStatus('sandbox', '3D Browser Sandbox ready');
        return;
    }
    socket = baseUrl ? io(baseUrl, {
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 6000,
    }) : io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
        state.msConnected = true;
        setMindserverStatus('online', 'MindServer online');
        socket.emit('listen-to-agents');
    });

    socket.on('disconnect', () => {
        state.msConnected = false;
        setMindserverStatus('sandbox', 'Browser Sandbox mode (click for local server)');
    });

    socket.on('connect_error', () => {
        state.msConnected = false;
        setMindserverStatus('sandbox', 'Browser Sandbox mode (click for local server)');
    });

    socket.on('agents-status', (agents) => {
        const sandboxAgents = state.agents.filter(a => a.sandbox);
        const remoteAgents = (agents || []).filter(a => !state.sandboxBots[a.name]);
        state.agents = [...remoteAgents, ...sandboxAgents];
        if (state.agents.length === 0) {
            state.selected = null;
        } else if (!state.agents.some(a => a.name === state.selected)) {
            state.selected = state.agents[0].name;
        }
        renderAgents();
        renderEmptyState();
        renderCamera();
    });

    socket.on('state-update', (states) => {
        for (const [name, s] of Object.entries(states || {})) {
            if (s && !s.error && !state.sandboxBots[name]) {
                state.states[name] = s;
            }
        }
        renderStats();
        renderInventory();
    });

    socket.on('chat-relay', (agentName, entry) => {
        pushChat(agentName, {
            role: entry.role || 'bot',
            from: entry.from,
            name: agentName,
            message: entry.message,
            timestamp: entry.timestamp,
        });
    });

    socket.on('agent-log', (agentName, entry) => {
        pushConsole(agentName, { line: entry.line, level: entry.level, timestamp: entry.timestamp, name: agentName });
    });
}

function setMindserverStatus(kind, text) {
    const dot = $('msStatusDot');
    if (kind === 'online') dot.className = 'dot online';
    else if (kind === 'sandbox') dot.className = 'dot connecting';
    else dot.className = 'dot offline';
    $('msStatusText').textContent = text;
}

/* ---------------- agents ---------------- */

function agent() {
    return state.agents.find(a => a.name === state.selected) || null;
}

function renderEmptyState() {
    const has = state.agents.length > 0;
    $('emptyState').classList.toggle('hidden', has);
    $('dashboard').classList.toggle('hidden', !has);
}

function renderAgents() {
    const tabs = $('agentTabs');
    tabs.innerHTML = '';
    for (const a of state.agents) {
        const tab = document.createElement('button');
        tab.className = 'agent-tab' + (a.name === state.selected ? ' active' : '');
        const badge = a.sandbox ? ' (3D)' : '';
        tab.innerHTML = `<span class="mini-dot ${a.in_game ? 'on' : 'off'}"></span>${esc(a.name + badge)}`;
        tab.onclick = () => {
            state.selected = a.name;
            renderAgents(); renderChat(); renderConsole(); renderStats(); renderInventory(); renderCamera();
        };
        tabs.appendChild(tab);
    }
    const a = agent();
    const dot = $('agentStatusDot');
    const text = $('agentStatusText');
    if (!a) { dot.className = 'dot offline'; text.textContent = 'no bot'; return; }
    if (a.in_game) {
        const s = state.states[a.name];
        const action = s && s.action ? s.action.current : 'in game';
        dot.className = 'dot online';
        text.textContent = `in game — ${action}`;
    } else if (a.socket_connected) {
        dot.className = 'dot connecting'; text.textContent = 'connecting…';
    } else {
        dot.className = 'dot offline'; text.textContent = 'stopped';
    }
    $('disconnectAgentBtn').disabled = !a.in_game;
    $('connectAgentBtn').disabled = !!a.in_game;
    $('restartAgentBtn').disabled = false;
    $('removeAgentBtn').disabled = false;
    const chatEnabled = a.in_game;
    $('chatInput').disabled = !chatEnabled;
    $('chatSendBtn').disabled = !chatEnabled;
    document.querySelectorAll('.quick-row .chip').forEach(c => { c.disabled = !chatEnabled; });

    const llm = state.llmByAgent[a.name];
    $('llmBadge').textContent = llm ? `brain: ${llm.provider} · ${llm.model}` : `brain: ${state.wizard.provider || 'ollama'}`;
}

function renderCamera() {
    const a = agent();
    const frame = $('viewerFrame');
    const simCanvas = $('simViewerCanvas');
    const placeholder = $('cameraPlaceholder');
    const switchBtn = $('switchSandboxBtn');
    const modeBadge = $('cameraModeBadge');

    if (a && a.sandbox && a.in_game && state.wizard.camera !== false) {
        frame.classList.add('hidden');
        placeholder.classList.add('hidden');
        simCanvas.classList.remove('hidden');
        const sim = state.sandboxBots[a.name];
        if (sim) {
            modeBadge.textContent = sim.firstPerson ? 'Mode: First-Person (press P to orbit)' : 'Mode: 3rd-Person Orbit (press P for first-person)';
        }
        $('camOpenBtn').onclick = () => {
            const c = $('cameraFrame');
            if (c.requestFullscreen) c.requestFullscreen();
        };
        return;
    }

    simCanvas.classList.add('hidden');
    if (a && a.in_game && a.viewerPort && state.wizard.camera !== false) {
        const url = viewerUrl(a.viewerPort);
        if (frame.dataset.loadedFor !== url) {
            frame.dataset.loadedFor = url;
            frame.src = url;
        }
        frame.classList.remove('hidden');
        placeholder.classList.add('hidden');
        modeBadge.textContent = `Viewer port ${a.viewerPort}`;
        $('camOpenBtn').onclick = () => window.open(url, '_blank');
    } else {
        frame.classList.add('hidden');
        frame.dataset.loadedFor = '';
        placeholder.classList.remove('hidden');
        modeBadge.textContent = '';
        $('cameraPlaceholderText').textContent = !a
            ? 'Camera offline — no bot selected'
            : a.in_game
                ? 'Camera disabled for this bot'
                : 'Camera offline — bot is not connected to a Minecraft server yet';
        if (a && !a.in_game) {
            switchBtn.classList.remove('hidden');
        } else {
            switchBtn.classList.add('hidden');
        }
        $('camOpenBtn').onclick = null;
    }
}

/* ---------------- stats & inventory ---------------- */

function renderStats() {
    const a = agent();
    const s = a ? state.states[a.name] : null;
    if (!s) return;
    const g = s.gameplay || {};
    $('statHealth').textContent = g.health ?? '–';
    $('barHealth').style.width = Math.max(0, Math.min(100, ((g.health ?? 0) / 20) * 100)) + '%';
    $('statHunger').textContent = g.hunger ?? '–';
    $('barHunger').style.width = Math.max(0, Math.min(100, ((g.hunger ?? 0) / 20) * 100)) + '%';
    const act = s.action || {};
    $('statAction').textContent = act.current || '–';
    const p = g.position || {};
    $('statPos').textContent = p.x != null ? `${p.x}, ${p.y}, ${p.z}` : '–';
    $('statBiome').textContent = [g.biome, g.timeLabel].filter(Boolean).join(' · ') || '–';
    $('statMode').textContent = g.gamemode || '–';

    const n = s.nearby || {};
    const bits = [];
    if (n.humanPlayers && n.humanPlayers.length) bits.push('Players: <b>' + esc(n.humanPlayers.join(', ')) + '</b>');
    if (n.entityTypes && n.entityTypes.length) bits.push('Mobs nearby: <b>' + esc(n.entityTypes.slice(0, 8).join(', ')) + (n.entityTypes.length > 8 ? '…' : '') + '</b>');
    $('statNearby').innerHTML = bits.join(' &nbsp;·&nbsp; ') || '<span style="opacity:.6">Nothing nearby</span>';
}

/* Built-in SVG icon generator so inventory items look crisp even on static GitHub Pages */
function fallbackItemSvg(name) {
    const colors = {
        diamond_sword: ['#3cf0e8', '#1f7a75', '⚔'],
        iron_sword: ['#d8e0e8', '#687078', '⚔'],
        iron_pickaxe: ['#d8e0e8', '#7c5328', '⛏'],
        diamond_pickaxe: ['#3cf0e8', '#7c5328', '⛏'],
        iron_axe: ['#d8e0e8', '#7c5328', '🪓'],
        oak_log: ['#8b6233', '#593d1e', '🪵'],
        oak_planks: ['#b88c52', '#826032', '🟫'],
        cobblestone: ['#7d848a', '#52585e', '🪨'],
        stone: ['#8e9499', '#64696e', '🪨'],
        dirt: ['#865c38', '#5c3d22', '🟫'],
        cooked_beef: ['#a34828', '#692a14', '🥩'],
        raw_beef: ['#d94c4c', '#8f2828', '🥩'],
        torch: ['#ffd166', '#8b6233', '🕯'],
        diamond: ['#3cf0e8', '#159992', '💎'],
        iron_helmet: ['#dce4ec', '#6b7580', '🪖'],
        iron_chestplate: ['#dce4ec', '#6b7580', '🦺'],
        iron_leggings: ['#dce4ec', '#6b7580', '👖'],
        iron_boots: ['#dce4ec', '#6b7580', '🥾'],
        crafting_table: ['#a6723a', '#593d1e', '🧰'],
    };
    const c = colors[name] || ['#3a4c63', '#233042', '📦'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="2" width="28" height="28" rx="6" fill="${c[0]}" stroke="${c[1]}" stroke-width="2"/><text x="16" y="22" font-size="16" text-anchor="middle">${c[2]}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function itemIconUrl(name) {
    const a = agent();
    if (a && a.sandbox && !state.msConnected) {
        return fallbackItemSvg(name);
    }
    return apiUrl(`/assets/item/${encodeURIComponent(a ? a.name : 'bot')}/${encodeURIComponent(name)}.png`);
}

function renderInventory() {
    const a = agent();
    const s = a ? state.states[a.name] : null;
    const grid = $('inventoryGrid');
    if (!s || !s.inventory) {
        grid.innerHTML = '<div class="inv-empty">Bot is not in game yet.</div>';
        $('invCount').textContent = '0 items';
        return;
    }
    const counts = s.inventory.counts || {};
    const entries = Object.entries(counts).filter(([, n]) => n > 0);
    $('invCount').textContent = `${entries.length} types · ${s.inventory.stacksUsed ?? entries.length} stacks`;

    const eq = (s.inventory.equipment || {});
    let html = '';
    const armorNames = [eq.helmet, eq.chestplate, eq.leggings, eq.boots, eq.mainHand];
    const anyArmor = armorNames.some(x => x);
    if (anyArmor) {
        html += '<div class="armor-grid" style="grid-column: 1 / -1;">';
        for (const [label, name] of [['Head', eq.helmet], ['Chest', eq.chestplate], ['Legs', eq.leggings], ['Feet', eq.boots], ['Hand', eq.mainHand]]) {
            if (name) {
                const fb = fallbackItemSvg(name);
                html += `<div class="armor-slot" title="${esc(label)}: ${esc(name)}"><img src="${itemIconUrl(name)}" onerror="this.onerror=null;this.src='${fb}'"></div>`;
            } else {
                html += `<div class="armor-slot" title="${esc(label)}: none"><span class="armor-placeholder">${label}</span></div>`;
            }
        }
        html += '</div>';
    }
    if (entries.length === 0 && !anyArmor) {
        html += '<div class="inv-empty">Inventory is empty.</div>';
    } else {
        for (const [name, count] of entries) {
            const pretty = name.replaceAll('_', ' ');
            const fb = fallbackItemSvg(name);
            html += `<div class="inv-item" title="${esc(name)}">
                <img loading="lazy" src="${itemIconUrl(name)}" onerror="this.onerror=null;this.src='${fb}'">
                <span class="inv-count">${count}</span>
                <span class="inv-name">${esc(pretty)}</span>
            </div>`;
        }
    }
    grid.innerHTML = html;
}

/* ---------------- chat ---------------- */

function pushChat(name, entry) {
    if (!state.chat[name]) state.chat[name] = [];
    state.chat[name].push(entry);
    if (state.chat[name].length > MAX_CHAT) state.chat[name].splice(0, state.chat[name].length - MAX_CHAT);
    if (name === state.selected) renderChat();
}

function renderChat() {
    const box = $('chatMessages');
    const entries = state.chat[state.selected] || [];
    box.innerHTML = `<div class="chat-notice">Messages you send go straight to the bot's AI mind. Commands like <code>!stats</code>, <code>!collectBlocks("oak_log", 6)</code>, <code>!bridgeTo(0, 64, 12)</code>, or <code>!pvp("@hostile")</code> run instantly; plain language gets thought about.</div>`;
    for (const e of entries) {
        const div = document.createElement('div');
        if (e.role === 'user') {
            div.className = 'msg user';
            div.innerHTML = `<div class="msg-avatar">🧑</div><div class="msg-body"><div class="msg-name">${esc(e.from || 'you')}</div><div class="msg-text">${esc(e.message)}</div></div>`;
        } else if (e.role === 'bot') {
            div.className = 'msg bot';
            div.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-body"><div class="msg-name">${esc(e.name || state.selected)}</div><div class="msg-text">${esc(e.message)}</div></div>`;
        } else {
            div.className = 'msg system';
            div.innerHTML = `<div class="msg-avatar">⚙</div><div class="msg-body"><div class="msg-text">${esc(e.message)}</div></div>`;
        }
        box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
}

function sendMessage(message) {
    const a = agent();
    message = (message || '').trim();
    if (!a || !message) return;
    if (!a.in_game) {
        pushChat(a.name, { role: 'system', message: 'Bot is not in game — start it first.', timestamp: Date.now() });
        return;
    }
    const sender = state.wizard.playerName || 'Player';
    pushChat(a.name, { role: 'user', from: sender, message, timestamp: Date.now() });

    if (a.sandbox && state.sandboxBots[a.name]) {
        state.sandboxBots[a.name].handleMessage(sender, message);
        return;
    }
    if (socket) {
        socket.emit('send-message', a.name, { from: sender, message });
    }
}

/* ---------------- console ---------------- */

function pushConsole(name, entry) {
    if (!state.console[name]) state.console[name] = [];
    state.console[name].push(entry);
    if (state.console[name].length > MAX_CONSOLE) state.console[name].splice(0, state.console[name].length - MAX_CONSOLE);
    if (name === state.selected) renderConsole(true);
}

function renderConsole(autoscroll) {
    const box = $('consoleOutput');
    const entries = state.console[state.selected] || [];
    const stick = autoscroll || $('autoscrollCheck').checked;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = entries.map(e => {
        const cls = e.level === 'error' ? 'console-line error' : 'console-line';
        return `<div class="${cls}"><span class="ts">${esc(timeStr(e.timestamp))}</span><span class="tag">[${esc(e.name || state.selected)}]</span> ${esc(e.line)}</div>`;
    }).join('');
    if (stick || nearBottom) box.scrollTop = box.scrollHeight;
}

/* ============================================================
   3D Browser Sandbox Bot + Voxel World Renderer
   Allows instant live camera, chat-to-mind, smart navigation,
   bridging, PVP, hunting, and mining right in the browser!
   ============================================================ */

class SandboxBot {
    constructor(name, playerName, llm) {
        this.name = name;
        this.playerName = playerName || 'Player';
        this.llm = llm || { provider: 'ollama', model: 'sweaterdog/andy-4:micro-q8_0' };
        this.in_game = true;
        this.pos = { x: 0, y: 64, z: 0 };
        this.yaw = 0.4;
        this.pitch = -0.35;
        this.camDist = 11;
        this.firstPerson = false;
        this.health = 20;
        this.hunger = 20;
        this.action = 'idle (ready)';
        this.gamemode = 'survival';
        this.biome = 'plains';
        this.ticks = 0;
        this.swingPhase = 0;
        this.autonomousGoal = null;
        this.autonomousTimer = null;
        this.currentTask = null;
        this.particles = [];
        this.bridgeBlocks = [];
        this.houseBlocks = [];

        this.inventory = {
            oak_log: 8,
            cobblestone: 32,
            cooked_beef: 6,
            torch: 12,
            diamond_sword: 1,
            iron_pickaxe: 1,
            iron_axe: 1,
        };
        this.equipment = {
            helmet: 'iron_helmet',
            chestplate: 'iron_chestplate',
            leggings: 'iron_leggings',
            boots: 'iron_boots',
            mainHand: 'diamond_sword',
        };

        this.trees = [
            { x: -7, z: -5, logs: 4 },
            { x: 8, z: -6, logs: 4 },
            { x: -9, z: 4, logs: 4 },
            { x: 10, z: 3, logs: 4 },
            { x: -4, z: 14, logs: 4 },
            { x: 6, z: 15, logs: 4 },
        ];

        this.mobs = [
            { id: 1, type: 'zombie', hostile: true, x: -6, y: 64, z: -8, vx: 0.02, vz: 0.01, hp: 20, maxHp: 20 },
            { id: 2, type: 'skeleton', hostile: true, x: 7, y: 64, z: -9, vx: -0.02, vz: 0.02, hp: 20, maxHp: 20 },
            { id: 3, type: 'creeper', hostile: true, x: -8, y: 64, z: 2, vx: 0.015, vz: -0.02, hp: 20, maxHp: 20 },
            { id: 4, type: 'pig', hostile: false, x: 5, y: 64, z: 2, vx: 0.01, vz: 0.01, hp: 10, maxHp: 10 },
            { id: 5, type: 'cow', hostile: false, x: -4, y: 64, z: -2, vx: -0.015, vz: 0.01, hp: 10, maxHp: 10 },
            { id: 6, type: 'sheep', hostile: false, x: 4, y: 64, z: -3, vx: 0.01, vz: -0.015, hp: 8, maxHp: 8 },
        ];
        this.playerEntity = { name: this.playerName, x: 3, y: 64, z: -2 };
    }

    log(line, level = 'info') {
        pushConsole(this.name, { line, level, timestamp: Date.now(), name: this.name });
    }

    say(message) {
        pushChat(this.name, { role: 'bot', name: this.name, message, timestamp: Date.now() });
        this.log(`[Chat] ${this.name}: ${message}`);
    }

    isRavine(x, z) {
        // Ravine / river runs along z = 7..10 unless bridged
        if (z >= 6.5 && z <= 10.5) {
            const bx = Math.round(x);
            const bz = Math.round(z);
            return !this.bridgeBlocks.some(b => b.x === bx && b.z === bz);
        }
        return false;
    }

    placeBridgeAt(x, z) {
        const bx = Math.round(x);
        const bz = Math.round(z);
        if (!this.bridgeBlocks.some(b => b.x === bx && b.z === bz)) {
            this.bridgeBlocks.push({ x: bx, y: 63, z: bz });
            if ((this.inventory.cobblestone || 0) > 0) this.inventory.cobblestone--;
            this.log(`[SmartNav] Sneak-placed cobblestone bridge block at (${bx}, 63, ${bz})`);
        }
    }

    syncState() {
        const dayPhase = (this.ticks % 2400) / 2400;
        const timeLabel = dayPhase < 0.7 ? 'Day' : 'Night';
        const entityTypes = this.mobs.filter(m => m.hp > 0).map(m => m.type);
        state.states[this.name] = {
            gameplay: {
                health: Math.round(this.health),
                hunger: Math.round(this.hunger),
                position: {
                    x: Math.round(this.pos.x * 10) / 10,
                    y: Math.round(this.pos.y * 10) / 10,
                    z: Math.round(this.pos.z * 10) / 10,
                },
                biome: this.biome,
                timeLabel,
                gamemode: this.gamemode,
            },
            action: {
                current: this.action,
            },
            nearby: {
                humanPlayers: [this.playerName],
                entityTypes,
            },
            inventory: {
                counts: { ...this.inventory },
                stacksUsed: Object.values(this.inventory).filter(v => v > 0).length,
                equipment: { ...this.equipment },
            },
        };
    }

    step() {
        if (!this.in_game) return;
        this.ticks++;

        // Respawn mobs occasionally if cleared
        if (this.ticks % 300 === 0 && this.mobs.filter(m => m.hp > 0).length < 4) {
            const isHostile = Math.random() < 0.55;
            const type = isHostile ? (Math.random() < 0.5 ? 'zombie' : 'skeleton') : (Math.random() < 0.5 ? 'cow' : 'pig');
            this.mobs.push({
                id: Date.now() + Math.random(),
                type,
                hostile: isHostile,
                x: (Math.random() - 0.5) * 18,
                y: 64,
                z: (Math.random() - 0.5) * 10 - 2,
                vx: (Math.random() - 0.5) * 0.03,
                vz: (Math.random() - 0.5) * 0.03,
                hp: isHostile ? 20 : 10,
                maxHp: isHostile ? 20 : 10,
            });
        }

        // Move mobs slightly
        for (const m of this.mobs) {
            if (m.hp <= 0) continue;
            m.x += m.vx;
            m.z += m.vz;
            if (m.x < -12 || m.x > 12) m.vx *= -1;
            if (m.z < -12 || (m.z > 5.5 && m.z < 11.5)) m.vz *= -1;
            if (m.z > 16) m.vz *= -1;
        }

        // Execute current task
        if (this.currentTask) {
            this.swingPhase += 0.32;
            this.currentTask();
        } else {
            this.swingPhase *= 0.85;
        }

        // Update particles
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            p.vy -= 0.015;
            p.life--;
            return p.life > 0;
        });

        if (this.ticks % 15 === 0) {
            this.syncState();
            if (state.selected === this.name) {
                renderStats();
                renderInventory();
                renderAgents();
            }
        }
    }

    moveToward(tx, tz, speed = 0.14, autoBridge = true) {
        const dx = tx - this.pos.x;
        const dz = tz - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= speed) {
            this.pos.x = tx;
            this.pos.z = tz;
            return true;
        }
        const nx = this.pos.x + (dx / dist) * speed;
        const nz = this.pos.z + (dz / dist) * speed;
        if (this.isRavine(nx, nz)) {
            if (autoBridge) {
                this.equipment.mainHand = 'cobblestone';
                this.placeBridgeAt(nx, nz);
            } else {
                return true;
            }
        }
        this.pos.x = nx;
        this.pos.z = nz;
        return false;
    }

    spawnParticles(x, y, z, color) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x, y, z,
                vx: (Math.random() - 0.5) * 0.16,
                vy: Math.random() * 0.15 + 0.04,
                vz: (Math.random() - 0.5) * 0.16,
                color,
                life: 18 + Math.floor(Math.random() * 10),
            });
        }
    }

    handleMessage(from, text) {
        if (text.startsWith('!')) {
            this.runCommand(text);
            return;
        }
        this.thinkAndRespond(from, text);
    }

    runCommand(cmdText) {
        this.log(`Executing command: ${cmdText}`);
        const match = cmdText.match(/^!([a-zA-Z0-9_]+)(?:\((.*)\))?/);
        if (!match) {
            this.say(`Unknown command format: ${cmdText}`);
            return;
        }
        const name = match[1];
        const rawArgs = (match[2] || '').trim();
        const args = rawArgs
            ? rawArgs.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
            : [];

        switch (name) {
            case 'stop':
                this.currentTask = null;
                this.stopAutonomous();
                this.action = 'idle (stopped)';
                this.say('Stopped all current actions.');
                break;

            case 'endGoal':
                this.stopAutonomous();
                this.currentTask = null;
                this.action = 'idle';
                this.say('Autonomous goal ended.');
                break;

            case 'stats':
                this.say(`Health: ${Math.round(this.health)}/20 ❤ | Food: ${Math.round(this.hunger)}/20 🍗 | Pos: (${Math.round(this.pos.x)}, ${Math.round(this.pos.y)}, ${Math.round(this.pos.z)}) | Biome: ${this.biome} | Action: ${this.action}`);
                break;

            case 'inventory': {
                const items = Object.entries(this.inventory).filter(([, c]) => c > 0).map(([k, c]) => `${k} x${c}`).join(', ');
                this.say(`Inventory: ${items || 'empty'} | Equipped: ${this.equipment.mainHand}`);
                break;
            }

            case 'goal':
                this.say(this.autonomousGoal ? `Current autonomous goal: "${this.autonomousGoal}"` : 'No autonomous goal active right now.');
                break;

            case 'goToCoordinates': {
                const tx = parseFloat(args[0]) || 0;
                const ty = parseFloat(args[1]) || 64;
                const tz = parseFloat(args[2]) || 0;
                this.startGoTo(tx, ty, tz);
                break;
            }

            case 'goToPlayer': {
                const targetPlayer = args[0] || this.playerName;
                this.action = `smart-nav to ${targetPlayer}`;
                this.say(`Sprinting to ${targetPlayer} at (${this.playerEntity.x}, 64, ${this.playerEntity.z})…`);
                this.startGoTo(this.playerEntity.x - 1.2, 64, this.playerEntity.z);
                break;
            }

            case 'bridgeTo': {
                const tx = parseFloat(args[0]) || 0;
                const ty = parseFloat(args[1]) || 64;
                const tz = parseFloat(args[2]) || 12;
                this.startBridgeTo(tx, ty, tz);
                break;
            }

            case 'collectBlocks': {
                const blockType = args[0] || 'oak_log';
                const count = Math.max(1, parseInt(args[1]) || 6);
                this.startCollectBlocks(blockType, count);
                break;
            }

            case 'pvp':
            case 'attackPlayer': {
                const target = args[0] || '@hostile';
                this.startPvp(target);
                break;
            }

            case 'hunt': {
                const count = Math.max(1, parseInt(args[0]) || 3);
                this.startHunt(count);
                break;
            }

            case 'selfPrompt': {
                const goal = args.join(', ') || 'survive and gather resources';
                this.startAutonomous(goal);
                break;
            }

            default:
                this.say(`Executed !${name}.`);
                break;
        }
        this.syncState();
        renderStats();
        renderInventory();
    }

    startGoTo(tx, ty, tz) {
        const clampedX = Math.max(-14, Math.min(14, tx));
        const clampedZ = Math.max(-14, Math.min(16, tz));
        this.action = `navigating to (${Math.round(clampedX)}, ${Math.round(ty)}, ${Math.round(clampedZ)})`;
        this.log(`[SmartNav] Pathfinding to (${clampedX}, ${ty}, ${clampedZ}) — sprint, jump, dig & auto-bridge enabled`);
        this.currentTask = () => {
            const arrived = this.moveToward(clampedX, clampedZ, 0.16, true);
            if (arrived) {
                this.currentTask = null;
                this.action = 'idle';
                this.say(`Arrived at (${Math.round(this.pos.x)}, 64, ${Math.round(this.pos.z)})!`);
            }
        };
    }

    startBridgeTo(tx, ty, tz) {
        const targetX = Math.max(-12, Math.min(12, tx));
        const targetZ = Math.max(-12, Math.min(15, tz));
        this.action = `sneak-bridging to (${Math.round(targetX)}, 64, ${Math.round(targetZ)})`;
        this.equipment.mainHand = 'cobblestone';
        this.say(`Sneak-bridging across the ravine toward (${Math.round(targetX)}, 64, ${Math.round(targetZ)}) using cobblestone…`);
        this.currentTask = () => {
            const arrived = this.moveToward(targetX, targetZ, 0.1, true);
            if (arrived) {
                this.currentTask = null;
                this.equipment.mainHand = 'diamond_sword';
                this.action = 'idle';
                this.say(`Finished bridging to (${Math.round(this.pos.x)}, 64, ${Math.round(this.pos.z)})!`);
            }
        };
    }

    startCollectBlocks(blockType, count) {
        let collected = 0;
        let harvestCooldown = 0;
        this.equipment.mainHand = blockType.includes('log') || blockType.includes('wood') ? 'iron_axe' : 'iron_pickaxe';
        this.action = `mining ${blockType} (0/${count})`;
        this.say(`Gathering ${count}x ${blockType} with ${this.equipment.mainHand}…`);

        this.currentTask = () => {
            let targetTree = this.trees.find(t => t.logs > 0);
            if (!targetTree) {
                // Regrow trees so demo stays interactive
                this.trees.forEach(t => { t.logs = 4; });
                targetTree = this.trees[0];
            }
            const arrived = this.moveToward(targetTree.x, targetTree.z, 0.14, true);
            if (arrived) {
                harvestCooldown++;
                if (harvestCooldown % 18 === 0) {
                    collected++;
                    if (targetTree.logs > 0) targetTree.logs--;
                    this.inventory[blockType] = (this.inventory[blockType] || 0) + 1;
                    this.spawnParticles(targetTree.x, 65.5, targetTree.z, '#8b6233');
                    this.action = `mining ${blockType} (${collected}/${count})`;
                    this.log(`[Gather] Mined ${blockType} (${collected}/${count})`);
                    if (collected >= count) {
                        this.currentTask = null;
                        this.action = 'idle';
                        this.equipment.mainHand = 'diamond_sword';
                        this.say(`Collected ${count}x ${blockType}! Now holding ${this.inventory[blockType]} in inventory.`);
                    }
                }
            }
        };
    }

    startPvp(targetSpec) {
        this.equipment.mainHand = 'diamond_sword';
        this.action = `PVP combat (${targetSpec})`;
        this.say(`Engaging ${targetSpec} with diamond_sword — strafing, jump-crits & auto-healing active!`);
        let hitTick = 0;
        let kills = 0;

        this.currentTask = () => {
            const target = this.mobs.find(m => m.hp > 0 && (targetSpec === '@hostile' ? m.hostile : true));
            if (!target) {
                this.currentTask = null;
                this.action = 'idle';
                this.say(`Area clear! Defeated ${kills || 1} hostile mob(s).`);
                return;
            }
            // Low health retreat & eat check
            if (this.health < 12 && (this.inventory.cooked_beef || 0) > 0) {
                this.inventory.cooked_beef--;
                this.health = Math.min(20, this.health + 8);
                this.hunger = Math.min(20, this.hunger + 8);
                this.log('[PVP] Retreated briefly and ate cooked_beef (+8 ❤)');
            }
            // Circle strafe around target
            const angle = this.ticks * 0.12;
            const goalX = target.x + Math.cos(angle) * 1.4;
            const goalZ = target.z + Math.sin(angle) * 1.4;
            this.moveToward(goalX, goalZ, 0.17, true);
            const dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
            if (dist < 2.4) {
                hitTick++;
                if (hitTick % 14 === 0) {
                    const isCrit = hitTick % 28 === 0;
                    const dmg = isCrit ? 9 : 6;
                    target.hp = Math.max(0, target.hp - dmg);
                    this.spawnParticles(target.x, 65, target.z, '#ff5d5d');
                    this.log(`[PVP] ${isCrit ? 'Jump-CRIT' : 'Strafe hit'} ${target.type} for ${dmg} dmg (${target.hp}/${target.maxHp} HP)`);
                    if (target.hp <= 0) {
                        kills++;
                        this.log(`[PVP] Defeated ${target.type}!`);
                    }
                }
            }
        };
    }

    startHunt(count) {
        this.equipment.mainHand = 'diamond_sword';
        this.action = `hunting animals (0/${count})`;
        this.say(`Hunting up to ${count} animals and cooking meat…`);
        let hunted = 0;
        let hitTick = 0;

        this.currentTask = () => {
            let animal = this.mobs.find(m => m.hp > 0 && !m.hostile);
            if (!animal) {
                // Spawn passive animal if none left
                animal = { id: Date.now(), type: 'cow', hostile: false, x: 5, y: 64, z: -3, vx: 0.01, vz: 0.01, hp: 10, maxHp: 10 };
                this.mobs.push(animal);
            }
            this.moveToward(animal.x, animal.z, 0.16, true);
            if (Math.hypot(animal.x - this.pos.x, animal.z - this.pos.z) < 2.0) {
                hitTick++;
                if (hitTick % 14 === 0) {
                    animal.hp -= 6;
                    this.spawnParticles(animal.x, 64.8, animal.z, '#ffd166');
                    if (animal.hp <= 0) {
                        hunted++;
                        this.inventory.cooked_beef = (this.inventory.cooked_beef || 0) + 2;
                        this.hunger = Math.min(20, this.hunger + 4);
                        this.action = `hunting & cooking (${hunted}/${count})`;
                        this.log(`[Hunt] Harvested ${animal.type} and cooked 2x cooked_beef (${hunted}/${count})`);
                        if (hunted >= count) {
                            this.currentTask = null;
                            this.action = 'idle';
                            this.say(`Hunt complete! Cooked ${hunted * 2}x steak (total cooked_beef: ${this.inventory.cooked_beef}).`);
                        }
                    }
                }
            }
        };
    }

    startBuildHouse() {
        this.equipment.mainHand = 'oak_planks';
        this.action = 'building wooden shelter';
        this.say('Building a shelter at (-2, 64, 2) with oak planks and cobblestone…');
        const blueprint = [
            { x: -3, y: 64, z: 1 }, { x: -2, y: 64, z: 1 }, { x: -1, y: 64, z: 1 },
            { x: -3, y: 64, z: 3 }, { x: -2, y: 64, z: 3 }, { x: -1, y: 64, z: 3 },
            { x: -3, y: 64, z: 2 }, { x: -1, y: 64, z: 2 },
            { x: -3, y: 65, z: 1 }, { x: -2, y: 65, z: 1 }, { x: -1, y: 65, z: 1 },
            { x: -3, y: 65, z: 3 }, { x: -2, y: 65, z: 3 }, { x: -1, y: 65, z: 3 },
        ];
        let idx = 0;
        let stepTick = 0;
        this.currentTask = () => {
            if (idx >= blueprint.length) {
                this.currentTask = null;
                this.equipment.mainHand = 'diamond_sword';
                this.action = 'idle';
                this.say('Shelter construction complete! 🏠');
                return;
            }
            const b = blueprint[idx];
            this.moveToward(b.x + 1.5, b.z, 0.15, true);
            stepTick++;
            if (stepTick % 10 === 0) {
                this.houseBlocks.push(b);
                this.spawnParticles(b.x, b.y + 0.5, b.z, '#b88c52');
                this.log(`[Build] Placed oak_planks at (${b.x}, ${b.y}, ${b.z})`);
                idx++;
            }
        };
    }

    startAutonomous(goal) {
        this.stopAutonomous();
        this.autonomousGoal = goal;
        this.say(`🧠 Autonomous mode started! Goal: "${goal}"`);
        this.log(`[SelfPrompter] Goal set: ${goal}`);

        const runCycle = () => {
            if (!this.autonomousGoal || !this.in_game) return;
            if (!this.currentTask) {
                const g = this.autonomousGoal.toLowerCase();
                if (g.includes('house') || g.includes('build') || g.includes('castle')) {
                    if ((this.inventory.oak_log || 0) < 10) {
                        this.log('[SelfPrompter] Step 1: Gathering oak_log for construction');
                        this.startCollectBlocks('oak_log', 4);
                    } else {
                        this.log('[SelfPrompter] Step 2: Constructing shelter from gathered wood');
                        this.startBuildHouse();
                        this.autonomousGoal = null;
                        return;
                    }
                } else if (g.includes('warrior') || g.includes('fight') || g.includes('pvp')) {
                    this.log('[SelfPrompter] Scanning for hostile mobs to fight');
                    this.startPvp('@hostile');
                } else if (g.includes('bridge') || g.includes('explore') || g.includes('loot')) {
                    this.log('[SelfPrompter] Bridging across ravine to explore the far side');
                    this.startBridgeTo(0, 64, 13);
                } else {
                    this.log('[SelfPrompter] Gathering resources for goal');
                    this.startCollectBlocks('oak_log', 4);
                }
            }
            this.autonomousTimer = setTimeout(runCycle, 4500);
        };
        runCycle();
    }

    stopAutonomous() {
        this.autonomousGoal = null;
        if (this.autonomousTimer) {
            clearTimeout(this.autonomousTimer);
            this.autonomousTimer = null;
        }
    }

    thinkAndRespond(from, text) {
        const lower = text.toLowerCase();
        this.log(`[LLM Brain: ${this.llm.provider}/${this.llm.model}] Thinking about message from ${from}: "${text}"`);
        setTimeout(() => {
            if (lower.includes('wood') || lower.includes('tree') || lower.includes('log') || lower.includes('mine')) {
                this.say("On it! Heading to the nearest oak trees to chop wood. (!collectBlocks(\"oak_log\", 6))");
                this.startCollectBlocks('oak_log', 6);
            } else if (lower.includes('bridge') || lower.includes('ravine') || lower.includes('river') || lower.includes('cross') || lower.includes('gap')) {
                this.say("I'll sneak-bridge across the water ravine with cobblestone right now! (!bridgeTo(0, 64, 12))");
                this.startBridgeTo(0, 64, 12);
            } else if (lower.includes('fight') || lower.includes('kill') || lower.includes('attack') || lower.includes('zombie') || lower.includes('mob') || lower.includes('pvp')) {
                this.say("Drawing my diamond sword and engaging hostile mobs with strafe & crit tactics! (!pvp(\"@hostile\"))");
                this.startPvp('@hostile');
            } else if (lower.includes('hunt') || lower.includes('food') || lower.includes('eat') || lower.includes('meat') || lower.includes('cow') || lower.includes('pig')) {
                this.say("Going hunting for food and cooking the meat! (!hunt(3))");
                this.startHunt(3);
            } else if (lower.includes('house') || lower.includes('build') || lower.includes('shelter') || lower.includes('home')) {
                this.say("I'll build a wooden shelter right here for us!");
                this.startBuildHouse();
            } else if (lower.includes('come') || lower.includes('here') || lower.includes('follow')) {
                this.say(`Coming to you, ${from}! (!goToPlayer("${from}", 3))`);
                this.startGoTo(this.playerEntity.x - 1.2, 64, this.playerEntity.z);
            } else if (lower.includes('stop') || lower.includes('wait')) {
                this.runCommand('!stop');
            } else {
                this.say(`Hey ${from}! I'm at (${Math.round(this.pos.x)}, 64, ${Math.round(this.pos.z)}) with ${Math.round(this.health)}/20 HP. Tell me to "mine wood", "bridge across the ravine", "fight mobs", "hunt food", or "build a house"!`);
            }
        }, 350);
    }
}

/* ---------------- 3D Canvas Camera Renderer ---------------- */

function initSandboxCanvas() {
    const canvas = $('simViewerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        $('cameraFrame').focus();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const a = agent();
        const sim = a && state.sandboxBots[a.name];
        if (!sim) return;
        sim.yaw -= (e.clientX - lastX) * 0.008;
        sim.pitch = Math.max(-1.2, Math.min(0.6, sim.pitch - (e.clientY - lastY) * 0.006));
        lastX = e.clientX;
        lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
        const a = agent();
        const sim = a && state.sandboxBots[a.name];
        if (!sim) return;
        e.preventDefault();
        sim.camDist = Math.max(4, Math.min(22, sim.camDist + e.deltaY * 0.01));
    }, { passive: false });

    function togglePov() {
        const a = agent();
        const sim = a && state.sandboxBots[a.name];
        if (!sim) return;
        sim.firstPerson = !sim.firstPerson;
        renderCamera();
    }

    $('camPovBtn').onclick = togglePov;
    window.addEventListener('keydown', (e) => {
        if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.key === 'p' || e.key === 'P') {
            togglePov();
        }
    });

    function renderLoop() {
        requestAnimationFrame(renderLoop);
        for (const sim of Object.values(state.sandboxBots)) {
            sim.step();
        }
        const a = agent();
        const sim = a && a.sandbox ? state.sandboxBots[a.name] : null;
        if (!sim || canvas.classList.contains('hidden')) return;

        const rect = canvas.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width));
        const h = Math.max(200, Math.floor(rect.height));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        drawWorld(ctx, w, h, sim);
    }
    requestAnimationFrame(renderLoop);
}

function drawWorld(ctx, w, h, sim) {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    sky.addColorStop(0, '#1e3c72');
    sky.addColorStop(0.6, '#4a89dc');
    sky.addColorStop(1, '#89c4f4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun
    ctx.fillStyle = 'rgba(255, 240, 150, 0.9)';
    ctx.fillRect(w * 0.82 - 18, h * 0.14 - 18, 36, 36);

    // Ground backdrop
    const groundGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
    groundGrad.addColorStop(0, '#2d5a27');
    groundGrad.addColorStop(1, '#183314');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);

    const cosY = Math.cos(sim.yaw);
    const sinY = Math.sin(sim.yaw);
    const cosP = Math.cos(sim.pitch);
    const sinP = Math.sin(sim.pitch);

    const camTargetX = sim.pos.x;
    const camTargetY = sim.pos.y + 1.4;
    const camTargetZ = sim.pos.z;

    const dist = sim.firstPerson ? 0.05 : sim.camDist;
    const camX = camTargetX - Math.sin(sim.yaw) * Math.cos(sim.pitch) * dist;
    const camY = camTargetY - Math.sin(sim.pitch) * dist + (sim.firstPerson ? 0.2 : 1.5);
    const camZ = camTargetZ - Math.cos(sim.yaw) * Math.cos(sim.pitch) * dist;

    const fov = Math.min(w, h) * 0.95;

    function project(wx, wy, wz) {
        const dx = wx - camX;
        const dy = wy - camY;
        const dz = wz - camZ;

        const rx = dx * cosY - dz * sinY;
        const rz1 = dx * sinY + dz * cosY;
        const ry = dy * cosP - rz1 * sinP;
        const rz = dy * sinP + rz1 * cosP;

        if (rz < 0.3) return null;
        return {
            x: w * 0.5 + (rx / rz) * fov,
            y: h * 0.5 - (ry / rz) * fov,
            z: rz,
            scale: fov / rz,
        };
    }

    const drawables = [];

    // Ground & water ravine tiles
    for (let gx = -12; gx <= 12; gx += 2) {
        for (let gz = -12; gz <= 16; gz += 2) {
            const p = project(gx, 63, gz);
            if (!p) continue;
            const inRavine = gz >= 7 && gz <= 10;
            drawables.push({
                z: p.z + 2,
                draw: () => {
                    const sz = Math.max(4, p.scale * 1.9);
                    ctx.fillStyle = inRavine ? '#1b6ca8' : ((gx + gz) % 4 === 0 ? '#3c7a33' : '#356e2d');
                    ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.28, sz, sz * 0.56);
                    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
                    ctx.strokeRect(p.x - sz * 0.5, p.y - sz * 0.28, sz, sz * 0.56);
                }
            });
        }
    }

    // Bridge cobblestone blocks
    for (const b of sim.bridgeBlocks) {
        const p = project(b.x, 63.5, b.z);
        if (!p) continue;
        drawables.push({
            z: p.z,
            draw: () => {
                const sz = Math.max(5, p.scale * 1.05);
                ctx.fillStyle = '#7d848a';
                ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz * 0.7);
                ctx.strokeStyle = '#454a4f';
                ctx.strokeRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz * 0.7);
            }
        });
    }

    // House blocks
    for (const b of sim.houseBlocks) {
        const p = project(b.x, b.y, b.z);
        if (!p) continue;
        drawables.push({
            z: p.z,
            draw: () => {
                const sz = Math.max(5, p.scale * 1.0);
                ctx.fillStyle = '#b88c52';
                ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
                ctx.strokeStyle = '#6e4f26';
                ctx.strokeRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
            }
        });
    }

    // Trees
    for (const t of sim.trees) {
        if (t.logs <= 0) continue;
        for (let i = 0; i < t.logs; i++) {
            const p = project(t.x, 64 + i, t.z);
            if (!p) continue;
            drawables.push({
                z: p.z,
                draw: () => {
                    const sz = Math.max(4, p.scale * 0.9);
                    ctx.fillStyle = '#6e4c24';
                    ctx.fillRect(p.x - sz * 0.45, p.y - sz * 0.5, sz * 0.9, sz);
                }
            });
        }
        const leafP = project(t.x, 64 + t.logs + 0.5, t.z);
        if (leafP) {
            drawables.push({
                z: leafP.z - 0.2,
                draw: () => {
                    const sz = Math.max(8, leafP.scale * 2.2);
                    ctx.fillStyle = '#2d8a3e';
                    ctx.fillRect(leafP.x - sz * 0.5, leafP.y - sz * 0.5, sz, sz * 0.75);
                    ctx.strokeStyle = '#1d5e2a';
                    ctx.strokeRect(leafP.x - sz * 0.5, leafP.y - sz * 0.5, sz, sz * 0.75);
                }
            });
        }
    }

    // Player character
    {
        const p = project(sim.playerEntity.x, 64.9, sim.playerEntity.z);
        if (p) {
            drawables.push({
                z: p.z,
                draw: () => {
                    const s = Math.max(6, p.scale * 0.9);
                    ctx.fillStyle = '#3b82f6';
                    ctx.fillRect(p.x - s * 0.4, p.y - s * 0.5, s * 0.8, s * 1.2);
                    ctx.fillStyle = '#f5cfa0';
                    ctx.fillRect(p.x - s * 0.35, p.y - s * 1.15, s * 0.7, s * 0.65);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(sim.playerEntity.name, p.x, p.y - s * 1.35);
                }
            });
        }
    }

    // Mobs
    for (const m of sim.mobs) {
        if (m.hp <= 0) continue;
        const p = project(m.x, 64.7, m.z);
        if (!p) continue;
        drawables.push({
            z: p.z,
            draw: () => {
                const s = Math.max(5, p.scale * 0.85);
                const colors = {
                    zombie: '#4a8f47',
                    skeleton: '#d8dee6',
                    creeper: '#38b849',
                    pig: '#f49ac2',
                    cow: '#6e4e37',
                    sheep: '#f2f4f7',
                };
                ctx.fillStyle = colors[m.type] || '#aaa';
                ctx.fillRect(p.x - s * 0.45, p.y - s * 0.6, s * 0.9, s * 1.1);
                ctx.strokeStyle = '#111';
                ctx.strokeRect(p.x - s * 0.45, p.y - s * 0.6, s * 0.9, s * 1.1);

                // Label + HP bar
                ctx.fillStyle = m.hostile ? '#ff8080' : '#d0f0d0';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${m.type} (${m.hp})`, p.x, p.y - s * 0.85);
            }
        });
    }

    // Bot character (in 3rd-person orbit mode)
    if (!sim.firstPerson) {
        const p = project(sim.pos.x, sim.pos.y + 0.95, sim.pos.z);
        if (p) {
            drawables.push({
                z: p.z,
                draw: () => {
                    const s = Math.max(8, p.scale * 1.0);
                    // Body
                    ctx.fillStyle = '#2dd4bf';
                    ctx.fillRect(p.x - s * 0.42, p.y - s * 0.4, s * 0.84, s * 1.1);
                    // Iron helmet / Head
                    ctx.fillStyle = '#f3cfb3';
                    ctx.fillRect(p.x - s * 0.38, p.y - s * 1.1, s * 0.76, s * 0.7);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillRect(p.x - s * 0.4, p.y - s * 1.15, s * 0.8, s * 0.28);
                    // Swinging arm / tool
                    const swing = Math.sin(sim.swingPhase) * s * 0.35;
                    ctx.fillStyle = '#3cf0e8';
                    ctx.fillRect(p.x + s * 0.42, p.y - s * 0.3 + swing, s * 0.45, s * 0.18);
                    // Nameplate
                    ctx.fillStyle = 'rgba(0,0,0,0.65)';
                    ctx.fillRect(p.x - 46, p.y - s * 1.65 - 12, 92, 16);
                    ctx.fillStyle = '#3ddc84';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`🤖 ${sim.name}`, p.x, p.y - s * 1.65);
                }
            });
        }
    }

    // Particles
    for (const pt of sim.particles) {
        const p = project(pt.x, pt.y, pt.z);
        if (!p) continue;
        drawables.push({
            z: p.z,
            draw: () => {
                ctx.fillStyle = pt.color;
                ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
            }
        });
    }

    drawables.sort((a, b) => b.z - a.z);
    for (const d of drawables) d.draw();

    // First-person crosshair + hand overlay
    if (sim.firstPerson) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 8, h * 0.5);
        ctx.lineTo(w * 0.5 + 8, h * 0.5);
        ctx.moveTo(w * 0.5, h * 0.5 - 8);
        ctx.lineTo(w * 0.5, h * 0.5 + 8);
        ctx.stroke();

        const swing = Math.sin(sim.swingPhase) * 18;
        ctx.fillStyle = '#3cf0e8';
        ctx.fillRect(w - 120 + swing, h - 95 + Math.abs(swing), 85, 22);
    }

    // HUD overlay in corner
    ctx.fillStyle = 'rgba(11, 15, 20, 0.72)';
    ctx.fillRect(10, 10, 290, 44);
    ctx.fillStyle = '#3ddc84';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${sim.name} · ${sim.action}`, 18, 28);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(`XYZ: ${sim.pos.x.toFixed(1)}, ${sim.pos.y.toFixed(0)}, ${sim.pos.z.toFixed(1)} | Bridge blocks: ${sim.bridgeBlocks.length}`, 18, 45);
}

/* ---------------- launch sandbox bot ---------------- */

function launchSandboxBot(customName) {
    const botName = (customName || state.wizard.botName || 'Andy').trim();
    const playerName = (state.wizard.playerName || 'Player').trim();
    const provider = state.wizard.provider || 'ollama';
    const model = state.wizard.model || PROVIDERS[provider].model;

    const sim = new SandboxBot(botName, playerName, { provider, model });
    state.sandboxBots[botName] = sim;
    state.llmByAgent[botName] = { provider, model };

    const existing = state.agents.find(a => a.name === botName);
    if (existing) {
        existing.in_game = true;
        existing.sandbox = true;
        existing.socket_connected = true;
    } else {
        state.agents.push({
            name: botName,
            in_game: true,
            viewerPort: null,
            socket_connected: true,
            sandbox: true,
        });
    }
    state.selected = botName;
    sim.syncState();
    sim.log(`Spawned ${botName} in 3D Browser Sandbox world at (0, 64, 0)`);
    pushChat(botName, {
        role: 'bot',
        name: botName,
        message: `Hey ${playerName}! I'm spawned and live on camera. Try clicking the quick chips below (🪓 Mine wood, 🌉 Bridge gap, ⚔ Fight mobs, 🍖 Hunt food) or tell me in plain English what to do!`,
        timestamp: Date.now(),
    });

    renderEmptyState();
    renderAgents();
    renderStats();
    renderInventory();
    renderChat();
    renderConsole(true);
    renderCamera();
}

/* ---------------- wizard ---------------- */

function openWizard() {
    $('wizBotName').value = state.wizard.botName || 'Andy';
    $('wizPlayerName').value = state.wizard.playerName || 'Player';
    $('wizWorldMode').value = state.wizard.worldMode || 'auto';
    $('wizHost').value = state.wizard.host || '127.0.0.1';
    $('wizPort').value = state.wizard.port || 25565;
    $('wizAuth').value = state.wizard.auth || 'offline';
    $('wizBaseProfile').value = state.wizard.base_profile || 'survival';
    $('wizMindserverUrl').value = state.wizard.mindserverUrl || 'http://127.0.0.1:8080';
    $('wizCamera').checked = state.wizard.camera !== false;
    $('wizMemory').checked = !!state.wizard.memory;
    $('wizVersion').value = 'auto';
    $('wizApiKey').value = '';
    $('wizError').classList.add('hidden');

    onWorldModeChange();
    populateProviders();
    checkOllama();
    loadVersions();
    loadKeyStatus();

    $('wizardModal').classList.remove('hidden');
}

function onWorldModeChange() {
    const mode = $('wizWorldMode').value;
    $('wizServerFields').classList.toggle('hidden', mode === 'sandbox');
}

function populateProviders() {
    const sel = $('wizProvider');
    sel.innerHTML = '';
    for (const [id, p] of Object.entries(PROVIDERS)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = p.label;
        sel.appendChild(opt);
    }
    sel.value = state.wizard.provider || 'ollama';
    onProviderChange();
}

function onProviderChange() {
    const id = $('wizProvider').value;
    const p = PROVIDERS[id];
    const modelInput = $('wizModel');
    modelInput.value = (id === state.wizard.provider && state.wizard.model) || p.model;
    const keyRow = $('apiKeyRow');
    if (p.key) {
        keyRow.classList.remove('hidden');
        keyRow.querySelector('span').innerHTML = `API key <i>(${esc(p.key)}, saved to keys.json on the host)</i>`;
    } else {
        keyRow.classList.add('hidden');
    }
    $('wizFooterHint').textContent = p.note || 'Everything stays on your machine.';
    $('ollamaStatusRow').classList.toggle('hidden', id !== 'ollama' && id !== 'vllm' && id !== 'lmstudio');
}

async function checkOllama() {
    const dot = $('ollamaDot');
    const text = $('ollamaStatusText');
    const hint = $('ollamaHint');
    dot.className = 'dot connecting';
    text.textContent = 'checking Ollama…';
    try {
        const r = await fetch(apiUrl('/api/ollama'));
        const data = await r.json();
        if (data.reachable) {
            dot.className = 'dot online';
            const models = data.models || [];
            const hasAndy = models.some(m => m.startsWith('sweaterdog/andy-4'));
            if (models.length === 0) {
                text.textContent = 'Ollama online, no models yet';
                hint.textContent = 'Run: ollama pull sweaterdog/andy-4:micro-q8_0';
            } else {
                text.textContent = `Ollama online (${models.length} models)`;
                hint.textContent = hasAndy
                    ? 'andy-4 is ready to go 🎉'
                    : 'Available: ' + models.slice(0, 3).join(', ') + (models.length > 3 ? '…' : '');
            }
        } else {
            dot.className = 'dot offline';
            text.textContent = 'Ollama not detected (Browser Sandbox AI ready)';
            hint.textContent = 'For local Ollama: install from ollama.com & run ollama pull sweaterdog/andy-4:micro-q8_0';
        }
    } catch {
        dot.className = 'dot connecting';
        text.textContent = 'Built-in Browser Sandbox AI ready';
        hint.textContent = 'Start MindServer locally (./start.sh) to connect to local Ollama or Minecraft Java servers.';
    }
}

async function loadVersions() {
    try {
        const r = await fetch(apiUrl('/api/supported-versions'));
        const data = await r.json();
        const sel = $('wizVersion');
        const current = sel.value;
        sel.innerHTML = '<option value="auto">Auto-detect (up to 1.21.11)</option>';
        for (const v of (data.versions || []).slice().reverse()) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v + (v === '1.21.11' ? ' (latest supported)' : '');
            sel.appendChild(opt);
        }
        sel.value = current || 'auto';
    } catch { /* keep auto only */ }
}

async function loadKeyStatus() {
    try {
        const r = await fetch(apiUrl('/api/keys'));
        const data = await r.json();
        const id = $('wizProvider').value;
        const p = PROVIDERS[id];
        if (p.key && data.keys && data.keys[p.key]) {
            $('wizApiKey').placeholder = 'already saved ✓ — paste a new key to replace';
        } else {
            $('wizApiKey').placeholder = 'paste API key';
        }
    } catch { /* ignore */ }
}

async function detectServer() {
    const result = $('detectResult');
    const btn = $('detectServerBtn');
    result.className = 'detect-result';
    result.textContent = 'pinging…';
    btn.disabled = true;
    try {
        const r = await fetch(apiUrl('/api/detect-server'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: $('wizHost').value.trim(), port: parseInt($('wizPort').value) || 25565 }),
        });
        const data = await r.json();
        if (data.ok && data.server) {
            result.className = 'detect-result ok';
            result.textContent = `✓ Found “${data.server.name}” — version ${data.server.version} (${data.server.ping}ms)`;
        } else {
            result.className = 'detect-result bad';
            result.textContent = '✗ No Minecraft server found on that port — you can still use 3D Browser Sandbox mode!';
        }
    } catch {
        result.className = 'detect-result bad';
        result.textContent = '✗ Local MindServer not running — select 3D Browser Sandbox or run ./start.sh locally.';
    }
    btn.disabled = false;
}

function showWizardError(text) {
    const el = $('wizError');
    el.textContent = text;
    el.classList.remove('hidden');
}

async function createAgent() {
    const botName = $('wizBotName').value.trim();
    const playerName = $('wizPlayerName').value.trim() || 'Player';
    const worldMode = $('wizWorldMode').value || 'auto';
    const host = $('wizHost').value.trim() || '127.0.0.1';
    const port = parseInt($('wizPort').value) || 25565;
    const version = $('wizVersion').value || 'auto';
    const auth = $('wizAuth').value;
    const baseProfile = $('wizBaseProfile').value;
    const mindserverUrl = ($('wizMindserverUrl').value || 'http://127.0.0.1:8080').trim();
    const provider = $('wizProvider').value;
    const model = $('wizModel').value.trim();
    const apiKey = $('wizApiKey').value.trim();
    const camera = $('wizCamera').checked;
    const memory = $('wizMemory').checked;

    if (!/^[A-Za-z0-9_]{1,16}$/.test(botName)) {
        showWizardError('Bot name must be 1–16 letters, numbers or underscores (no spaces).');
        return;
    }
    if (botName.toLowerCase() === playerName.toLowerCase()) {
        showWizardError('Bot name and your player name must be different.');
        return;
    }
    if (!model) {
        showWizardError('Please enter a model name.');
        return;
    }

    Object.assign(state.wizard, {
        botName, playerName, worldMode, host, port, version, auth,
        base_profile: baseProfile, provider, model, camera, memory, mindserverUrl
    });
    saveConfig();
    state.llmByAgent[botName] = { provider, model };

    // If user chose sandbox OR MindServer isn't connected in 'auto' mode, launch 3D Browser Sandbox immediately
    if (worldMode === 'sandbox' || (worldMode === 'auto' && !state.msConnected)) {
        $('wizardModal').classList.add('hidden');
        launchSandboxBot(botName);
        return;
    }

    if (!state.msConnected) {
        showWizardError('MindServer is not reachable at ' + (state.msBaseUrl || mindserverUrl) + '. Run ./start.sh locally or switch Connection Mode to "3D Browser Sandbox".');
        return;
    }

    // If Auto mode and MindServer IS connected, check if the Minecraft server is actually reachable first
    if (worldMode === 'auto') {
        try {
            const pingResp = await fetch(apiUrl('/api/detect-server'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port }),
            });
            const pingData = await pingResp.json();
            if (!pingData.ok) {
                $('wizardModal').classList.add('hidden');
                launchSandboxBot(botName);
                pushChat(botName, {
                    role: 'system',
                    message: `No Minecraft server was found at ${host}:${port}, so ${botName} launched in the 3D Browser Sandbox! Start a Minecraft server on ${host}:${port} anytime to connect in-game.`,
                    timestamp: Date.now(),
                });
                return;
            }
        } catch {
            $('wizardModal').classList.add('hidden');
            launchSandboxBot(botName);
            return;
        }
    }

    const p = PROVIDERS[provider];
    if (p.key && apiKey.length > 0) {
        try {
            await fetch(apiUrl('/api/keys'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [p.key]: apiKey }),
            });
        } catch { /* ignore */ }
    }

    const profile = {
        name: botName,
        model: provider === 'openai' ? model : `${provider}/${model}`,
    };
    if (provider === 'ollama') profile.embedding = 'ollama';

    const settings = {
        profile,
        minecraft_version: version,
        host,
        port,
        auth,
        base_profile: baseProfile,
        load_memory: memory,
        render_bot_view: camera,
    };

    const btn = $('createAgentBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    socket.emit('create-agent', settings, (response) => {
        btn.disabled = false;
        btn.textContent = '🤖 Create & connect bot';
        if (response && response.success) {
            $('wizardModal').classList.add('hidden');
            pushChat(botName, { role: 'system', message: 'Bot created! Connecting to Minecraft server…', timestamp: Date.now() });
        } else {
            showWizardError((response && response.error) || 'Failed to create the agent.');
        }
    });
}

/* ---------------- autonomous mode ---------------- */

function openAutonomous() {
    $('autonomousInput').value = '';
    $('autonomousModal').classList.remove('hidden');
    $('autonomousInput').focus();
}

function startAutonomous() {
    const goal = $('autonomousInput').value.trim();
    if (!goal) return;
    sendMessage(`!selfPrompt("${goal.replaceAll('"', "'")}")`);
    $('autonomousModal').classList.add('hidden');
}

/* ---------------- wire up the DOM ---------------- */

function init() {
    $('openWizardBtn').onclick = openWizard;
    $('emptyCreateBtn').onclick = openWizard;
    $('emptyDemoBtn').onclick = () => launchSandboxBot(state.wizard.botName || 'Andy');
    $('switchSandboxBtn').onclick = () => {
        const a = agent();
        launchSandboxBot(a ? a.name : (state.wizard.botName || 'Andy'));
    };
    $('msStatus').style.cursor = 'pointer';
    $('msStatus').onclick = openWizard;

    $('helpBtn').onclick = () => $('helpModal').classList.remove('hidden');
    $('helpCloseBtn').onclick = () => $('helpModal').classList.add('hidden');
    $('helpCloseBtn2').onclick = () => $('helpModal').classList.add('hidden');

    // wizard
    $('wizardCloseBtn').onclick = () => $('wizardModal').classList.add('hidden');
    $('wizWorldMode').onchange = onWorldModeChange;
    $('wizProvider').onchange = () => { onProviderChange(); loadKeyStatus(); };
    $('detectServerBtn').onclick = detectServer;
    $('createAgentBtn').onclick = createAgent;

    // chat
    $('chatSendBtn').onclick = () => { sendMessage($('chatInput').value); $('chatInput').value = ''; };
    $('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { sendMessage($('chatInput').value); $('chatInput').value = ''; }
    });

    // quick commands
    document.querySelectorAll('.quick-row .chip[data-cmd]').forEach(chip => {
        chip.onclick = () => sendMessage(chip.dataset.cmd);
    });
    $('comeHereChip').onclick = () => sendMessage(`!goToPlayer("${state.wizard.playerName || 'Player'}", 3)`);
    $('autonomousChip').onclick = openAutonomous;
    $('endGoalChip').onclick = () => sendMessage('!endGoal');

    // autonomous modal
    $('autonomousCloseBtn').onclick = () => $('autonomousModal').classList.add('hidden');
    $('autonomousStartBtn').onclick = startAutonomous;
    document.querySelectorAll('#autonomousModal .examples .chip').forEach(chip => {
        chip.onclick = () => { $('autonomousInput').value = chip.dataset.autonomous; };
    });

    // controls
    $('restartAgentBtn').onclick = () => {
        const a = agent();
        if (!a) return;
        if (a.sandbox) { launchSandboxBot(a.name); return; }
        if (socket) socket.emit('restart-agent', a.name);
    };
    $('disconnectAgentBtn').onclick = () => {
        const a = agent();
        if (!a) return;
        if (a.sandbox && state.sandboxBots[a.name]) {
            state.sandboxBots[a.name].in_game = false;
            a.in_game = false;
            renderAgents(); renderCamera();
            return;
        }
        if (socket) socket.emit('stop-agent', a.name);
    };
    $('connectAgentBtn').onclick = () => {
        const a = agent();
        if (!a) return;
        if (a.sandbox && state.sandboxBots[a.name]) {
            state.sandboxBots[a.name].in_game = true;
            a.in_game = true;
            renderAgents(); renderCamera();
            return;
        }
        if (socket) socket.emit('start-agent', a.name);
    };
    $('removeAgentBtn').onclick = () => {
        const a = agent();
        if (!a) return;
        if (!confirm(`Remove bot "${a.name}"?`)) return;
        if (a.sandbox) {
            if (state.sandboxBots[a.name]) state.sandboxBots[a.name].stopAutonomous();
            delete state.sandboxBots[a.name];
            state.agents = state.agents.filter(x => x.name !== a.name);
            state.selected = state.agents[0] ? state.agents[0].name : null;
            renderEmptyState(); renderAgents(); renderCamera();
            return;
        }
        if (socket) socket.emit('destroy-agent', a.name);
    };

    // camera
    $('camFullscreenBtn').onclick = () => {
        const frame = $('cameraFrame');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (frame.requestFullscreen) frame.requestFullscreen();
    };
    $('clearConsoleBtn').onclick = () => {
        if (state.selected) { state.console[state.selected] = []; renderConsole(true); }
    };

    for (const id of ['wizardModal', 'autonomousModal', 'helpModal']) {
        $(id).addEventListener('mousedown', (e) => {
            if (e.target === $(id)) $(id).classList.add('hidden');
        });
    }

    initSandboxCanvas();
    initMindserverConnection();
    renderChat();
    renderConsole(true);
    renderEmptyState();
}

document.addEventListener('DOMContentLoaded', init);
