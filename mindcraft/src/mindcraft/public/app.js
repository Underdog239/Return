/* ============================================================
   MindCraft Web — dashboard application
   Connects to MindServer (socket.io + REST) for real Minecraft
   bot control with mineflayer + prismarine-viewer live camera.
   ============================================================ */

'use strict';

/* ---------------- configuration ---------------- */

const PROVIDERS = {
    ollama:     { label: 'Ollama — local, 100% offline', key: null, model: 'sweaterdog/andy-4:micro-q8_0',
                  models: ['sweaterdog/andy-4:micro-q8_0', 'llama3.3:70b', 'llama3.1:8b', 'qwen2.5:14b', 'mistral-small:latest'],
                  note: 'Runs on your machine via Ollama. No API key, no internet. Recommended: pull the model with "ollama pull <model>".' },
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
                  models: ['local-model'], note: 'Runs against LM Studio\'s local server at http://127.0.0.1:1234.' },
};

const LS_KEY = 'mindcraft-web-config-v1';
const MAX_CHAT = 250;
const MAX_CONSOLE = 400;

/* ---------------- state ---------------- */

const state = {
    agents: [],           // [{name, in_game, viewerPort, socket_connected}]
    selected: null,       // selected agent name
    states: {},           // name -> latest full state
    chat: {},             // name -> [{role, from, message, timestamp}]
    console: {},          // name -> [{line, level, timestamp}]
    llmByAgent: {},       // name -> {provider, model}
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

/* fetch() that always settles — an unreachable MindServer must not leave the UI on "checking…" */
async function apiFetch(path, opts = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(apiUrl(path), { cache: 'no-store', signal: ctrl.signal, ...opts });
    } finally {
        clearTimeout(timer);
    }
}

function viewerUrl(port) {
    const loc = window.location;
    const hosts = [loc.hostname];
    if (state.msBaseUrl) {
        try { hosts.push(new URL(state.msBaseUrl).hostname); } catch { /* ignore */ }
    }
    // Proxied preview hosts look like "3000-abc123.example.dev" — swap the port prefix.
    for (const host of hosts) {
        const m = host.match(/^(\d+)-(.+)$/);
        if (m && loc.protocol === 'https:') return `${loc.protocol}//${port}-${m[2]}`;
    }
    if (state.msBaseUrl) {
        try { return `http://${new URL(state.msBaseUrl).hostname}:${port}`; } catch { /* ignore */ }
    }
    return `http://${loc.hostname}:${port}`;
}

/* Where the MindServer (dashboard backend) lives. It is the same machine that
   runs ./start.sh, NOT the machine that serves this page — unless this page is
   served by MindServer itself. */
function msDisplay(url) {
    return url || window.location.origin;
}

/* ---------------- socket connection ---------------- */

let socket = null;

const MS_DEFAULT_URL = 'http://127.0.0.1:8080';
const MS_PROBE_TIMEOUT = 2500;

/* Every place the MindServer could be. Tried in order, first one that answers
   GET /api/health wins. */
function msCandidates() {
    const out = [];
    const add = (url, label) => {
        const u = (url || '').replace(/\/+$/, '');
        if (!out.some(c => c.url === u)) out.push({ url: u, label: label || msDisplay(u) });
    };

    // 1) Same origin: this page was served by MindServer (the normal case: http://localhost:8080)
    add('', 'this page');

    // 2) Proxied preview/port hosts, e.g. "3000-abc123.preview.dev" → "8080-abc123.preview.dev"
    const m = window.location.hostname.match(/^\d+-(.+)$/);
    if (m && window.location.port) add(`${window.location.protocol}//8080-${m[1]}`, 'port 8080 of this host');

    // 3) The URL saved in the wizard / typed by the user
    add((state.wizard.mindserverUrl || MS_DEFAULT_URL));

    // 4) Loopback on the default port
    add(MS_DEFAULT_URL);
    add('http://localhost:8080');

    // 5) Same host, MindServer port (LAN setup). Skipped on https pages: the browser
    //    would block a plain-http request as mixed content anyway.
    if (window.location.protocol === 'http:' && window.location.hostname) {
        add(`http://${window.location.hostname}:8080`);
    }
    return out;
}

async function probeHealth(baseUrl) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MS_PROBE_TIMEOUT);
    try {
        const r = await fetch((baseUrl || '') + '/api/health', { cache: 'no-store', signal: ctrl.signal });
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('application/json')) return null;
        const d = await r.json();
        return (d && d.ok) ? d : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/* Hunt for a running MindServer. Returns the base URL that answered ('' = same origin). */
async function discoverMindserver() {
    state.msTried = [];
    for (const c of msCandidates()) {
        state.msTried.push(c.label);
        const health = await probeHealth(c.url);
        if (health) {
            // remember where it was found so the next visit connects instantly
            const where = c.url || window.location.origin;
            if (where !== state.wizard.mindserverUrl) {
                state.wizard.mindserverUrl = where;
                saveConfig();
            }
            return c.url;
        }
    }
    return null;
}

async function initMindserverConnection() {
    setMindserverStatus('connecting', 'looking for MindServer…');
    const found = await discoverMindserver();
    if (found === null) {
        state.msBaseUrl = null;
        state.msConnected = false;
        setMindserverStatus('offline', 'MindServer not found — click here for help');
        renderMsStatusRow();
        return false;
    }
    state.msBaseUrl = found;
    connectSocket(found);
    renderMsStatusRow();
    return true;
}

/* Re-run discovery (called by the ↻ Retry button and when the URL field changes). */
async function retryMindserver() {
    const field = $('wizMindserverUrl');
    if (field && field.value.trim()) {
        state.wizard.mindserverUrl = field.value.trim().replace(/\/+$/, '');
        saveConfig();
    }
    const ok = await initMindserverConnection();
    if (ok) {
        await checkOllama();
        await loadKeyStatus();
    } else {
        renderMsStatusRow();
    }
    return ok;
}

function msTroubleshootHint() {
    const bits = [];
    bits.push(`Tried: ${(state.msTried || [MS_DEFAULT_URL]).join(', ')}.`);
    bits.push('MindServer has to be running on your own computer: <code>./start.sh</code> (macOS/Linux), <code>start.bat</code> (Windows), or <code>cd mindcraft &amp;&amp; npm install &amp;&amp; node main.js</code>.');
    const host = window.location.hostname;
    if (host && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) {
        bits.push('This page is not served by MindServer itself, so the easiest fix is to open <code>http://localhost:8080</code> in your browser once it is running.');
    }
    bits.push('Then press <b>↻ Retry</b>.');
    return bits.join(' ');
}

function renderMsStatusRow() {
    const dot = $('msDot');
    if (!dot) return;
    const text = $('msText');
    const hint = $('msHint');
    if (state.msConnected) {
        dot.className = 'dot online';
        text.textContent = `MindServer online — ${msDisplay(state.msBaseUrl)}`;
        hint.textContent = '';
    } else {
        dot.className = 'dot offline';
        text.textContent = 'MindServer not reachable';
        hint.innerHTML = msTroubleshootHint();
    }
}

function connectSocket(baseUrl) {
    if (socket) {
        try { socket.disconnect(); } catch { /* ignore */ }
    }
    if (typeof io === 'undefined') {
        setMindserverStatus('offline', 'Socket.io not loaded — open http://localhost:8080');
        return;
    }
    const opts = {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 6000,
        timeout: 8000,
    };
    socket = baseUrl ? io(baseUrl, opts) : io(opts);

    socket.on('connect', () => {
        state.msConnected = true;
        setMindserverStatus('online', 'MindServer online');
        $('msStatus').title = `MindServer: ${msDisplay(state.msBaseUrl)} — click to change`;
        socket.emit('listen-to-agents');
    });

    socket.on('disconnect', () => {
        state.msConnected = false;
        setMindserverStatus('offline', 'MindServer disconnected — click to reconnect');
    });

    socket.on('connect_error', () => {
        state.msConnected = false;
        setMindserverStatus('offline', 'MindServer unreachable — click to reconnect');
    });

    socket.on('agents-status', (agents) => {
        state.agents = (agents || []);
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
            if (s && !s.error) {
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
    else if (kind === 'connecting') dot.className = 'dot connecting';
    else dot.className = 'dot offline';
    $('msStatusText').textContent = text;
    renderMsStatusRow();
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
        tab.innerHTML = `<span class="mini-dot ${a.in_game ? 'on' : 'off'}"></span>${esc(a.name)}`;
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
    const placeholder = $('cameraPlaceholder');
    const modeBadge = $('cameraModeBadge');

    if (a && a.in_game && a.viewerPort && state.wizard.camera !== false) {
        // Real prismarine-viewer camera via iframe
        const url = viewerUrl(a.viewerPort);
        if (frame.dataset.loadedFor !== url) {
            frame.dataset.loadedFor = url;
            frame.src = url;
        }
        frame.classList.remove('hidden');
        placeholder.classList.add('hidden');
        modeBadge.textContent = `Live camera · port ${a.viewerPort}`;
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
        $('camOpenBtn').onclick = null;
    }
}

/* POV toggle for prismarine-viewer iframe */
function setupCameraControls() {
    $('camPovBtn').onclick = () => {
        // prismarine-viewer handles POV internally via its own controls
        const frame = $('viewerFrame');
        if (frame && frame.contentWindow) {
            frame.focus();
        }
    };
    $('camFullscreenBtn').onclick = () => {
        const c = $('cameraFrame');
        if (c.requestFullscreen) c.requestFullscreen();
    };
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

/* Built-in SVG fallback for when texture server isn't reachable */
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
    return apiUrl(`/assets/item/${encodeURIComponent(a ? a.name : 'bot')}/${encodeURIComponent(name)}.png`);
}

function renderInventory() {
    const a = agent();
    const s = a ? state.states[a.name] : null;
    const grid = $('inventoryGrid');
    if (!s || !s.inventory) {
        grid.innerHTML = '<div class="inv-empty">No inventory data yet.</div>';
        $('invCount').textContent = '0 items';
        return;
    }
    const counts = s.inventory.counts || {};
    const equip = s.inventory.equipment || {};
    const items = Object.entries(counts).filter(([, c]) => c > 0);
    if (items.length === 0) {
        grid.innerHTML = '<div class="inv-empty">Inventory empty.</div>';
        $('invCount').textContent = '0 items';
        return;
    }
    $('invCount').textContent = `${items.length} items`;
    let html = '';
    for (const [name, count] of items) {
        const isEquipped = Object.values(equip).includes(name);
        const icon = itemIconUrl(name);
        html += `<div class="inv-slot${isEquipped ? ' equipped' : ''}" title="${esc(name)} x${count}${isEquipped ? ' (equipped)' : ''}">
            <img src="${icon}" alt="${esc(name)}" onerror="this.src='${fallbackItemSvg(name)}'; this.onerror=null;">
            <span class="inv-count">${count > 1 ? count : ''}</span>
        </div>`;
    }
    // Show equipment separately
    const mainHand = equip.mainHand;
    if (mainHand && !counts[mainHand]) {
        html += `<div class="inv-slot equipped" title="${esc(mainHand)} (held)">
            <img src="${itemIconUrl(mainHand)}" alt="${esc(mainHand)}" onerror="this.src='${fallbackItemSvg(mainHand)}'; this.onerror=null;">
        </div>`;
    }
    grid.innerHTML = html;
}

/* ---------------- chat ---------------- */

function pushChat(agentName, entry) {
    if (!state.chat[agentName]) state.chat[agentName] = [];
    const arr = state.chat[agentName];
    arr.push(entry);
    if (arr.length > MAX_CHAT) arr.splice(0, arr.length - MAX_CHAT);
    if (state.selected === agentName) renderChat();
}

function renderChat() {
    const a = agent();
    const msgs = a ? (state.chat[a.name] || []) : [];
    const el = $('chatMessages');
    let html = '<div class="chat-notice">Messages you send go straight to the bot\'s AI mind. Commands like <code>!stats</code> run instantly; plain language gets thought about.</div>';
    for (const m of msgs) {
        const cls = m.role === 'user' ? 'chat-user' : m.role === 'system' ? 'chat-system' : 'chat-bot';
        const from = m.from ? `<b>${esc(m.from)}</b>: ` : '';
        html += `<div class="${cls}"><span class="chat-time">${timeStr(m.timestamp)}</span> ${from}${esc(m.message)}</div>`;
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

function sendMessage(text) {
    text = (text || '').trim();
    if (!text) return;
    const a = agent();
    if (!a || !a.in_game) return;

    pushChat(a.name, { role: 'user', from: state.wizard.playerName || 'Player', message: text, timestamp: Date.now() });

    if (socket && state.msConnected) {
        socket.emit('send-message', a.name, { message: text });
    }
}

/* ---------------- console ---------------- */

function pushConsole(agentName, entry) {
    if (!state.console[agentName]) state.console[agentName] = [];
    const arr = state.console[agentName];
    arr.push(entry);
    if (arr.length > MAX_CONSOLE) arr.splice(0, arr.length - MAX_CONSOLE);
    if (state.selected === agentName) renderConsole();
}

function renderConsole(forceScroll) {
    const a = agent();
    const lines = a ? (state.console[a.name] || []) : [];
    const el = $('consoleOutput');
    let html = '';
    for (const l of lines) {
        const cls = l.level === 'error' ? 'con-error' : l.level === 'warn' ? 'con-warn' : '';
        html += `<div class="${cls}"><span class="con-time">${timeStr(l.timestamp)}</span> ${esc(l.line)}</div>`;
    }
    el.innerHTML = html;
    if (forceScroll || $('autoscrollCheck').checked) {
        el.scrollTop = el.scrollHeight;
    }
}

/* ---------------- wizard ---------------- */

function openWizard() {
    $('wizBotName').value = state.wizard.botName || 'Andy';
    $('wizPlayerName').value = state.wizard.playerName || 'Player';
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

    populateProviders();
    renderMsStatusRow();
    checkOllama();
    loadVersions();
    loadKeyStatus();

    $('wizardModal').classList.remove('hidden');
    $('msStatusRow').classList.remove('highlight');
    if (!state.msConnected) {
        $('msStatusRow').classList.add('highlight');
        if (typeof $('msStatusRow').scrollIntoView === 'function') {
            $('msStatusRow').scrollIntoView({ block: 'nearest' });
        }
    }
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
    if (!dot) return;
    dot.className = 'dot connecting';
    text.textContent = 'checking Ollama…';
    hint.textContent = '';
    try {
        if (state.msBaseUrl === null) throw new Error('no MindServer');
        const r = await apiFetch('/api/ollama', {}, 5000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
            text.textContent = 'Ollama not detected';
            hint.textContent = 'For local Ollama: install from ollama.com & run ollama pull sweaterdog/andy-4:micro-q8_0';
        }
    } catch {
        dot.className = 'dot offline';
        text.textContent = 'Cannot reach MindServer';
        hint.innerHTML = msTroubleshootHint();
        renderMsStatusRow();
    }
}

async function loadVersions() {
    try {
        const r = await apiFetch('/api/supported-versions', {}, 8000);
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
        const r = await apiFetch('/api/keys', {}, 5000);
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
        const r = await apiFetch('/api/detect-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: $('wizHost').value.trim(), port: parseInt($('wizPort').value) || 25565 }),
        }, 12000);
        const data = await r.json();
        if (data.ok && data.server) {
            result.className = 'detect-result ok';
            result.textContent = `✓ Found "${data.server.name}" — version ${data.server.version} (${data.server.ping}ms)`;
        } else {
            result.className = 'detect-result bad';
            result.textContent = '✗ No Minecraft server found on that port. Start your server first.';
        }
    } catch {
        result.className = 'detect-result bad';
        result.innerHTML = '✗ Cannot reach MindServer — it is not running (or not reachable) on this computer. '
            + 'Start it with <code>./start.sh</code> (Windows: <code>start.bat</code>), then press <b>↻ Retry</b> above.';
        renderMsStatusRow();
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

    // MindServer must be connected — no sandbox fallback
    if (!state.msConnected) {
        showWizardError('MindServer is not reachable from this page, so the bot cannot be created. '
            + 'Start it on your computer — ./start.sh (macOS/Linux), start.bat (Windows), or "cd mindcraft && node main.js" — '
            + 'then press ↻ Retry in the MindServer row above and try again.');
        $('msStatusRow').classList.add('highlight');
        return;
    }

    Object.assign(state.wizard, {
        botName, playerName, host, port, version, auth,
        base_profile: baseProfile, provider, model, camera, memory, mindserverUrl
    });
    saveConfig();
    state.llmByAgent[botName] = { provider, model };

    const p = PROVIDERS[provider];
    if (p.key && apiKey.length > 0) {
        try {
            await apiFetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [p.key]: apiKey }),
            }, 8000);
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

    $('msStatus').style.cursor = 'pointer';
    $('msStatus').onclick = () => {
        openWizard();
        $('wizMindserverUrl').focus();
        $('wizMindserverUrl').select();
    };

    $('helpBtn').onclick = () => $('helpModal').classList.remove('hidden');
    $('helpCloseBtn').onclick = () => $('helpModal').classList.add('hidden');
    $('helpCloseBtn2').onclick = () => $('helpModal').classList.add('hidden');

    // wizard
    $('wizardCloseBtn').onclick = () => $('wizardModal').classList.add('hidden');
    $('wizProvider').onchange = () => { onProviderChange(); loadKeyStatus(); };
    $('detectServerBtn').onclick = detectServer;
    $('createAgentBtn').onclick = createAgent;

    // MindServer connection row
    $('msRetryBtn').onclick = async () => {
        const btn = $('msRetryBtn');
        btn.disabled = true;
        btn.textContent = '↻ searching…';
        await retryMindserver();
        btn.disabled = false;
        btn.textContent = '↻ Retry';
    };
    $('wizMindserverUrl').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('msRetryBtn').click(); }
    });
    $('wizMindserverUrl').addEventListener('change', () => retryMindserver());

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
    document.querySelectorAll('[data-autonomous]').forEach(chip => {
        chip.onclick = () => { $('autonomousInput').value = chip.dataset.autonomous; };
    });

    // controls
    $('restartAgentBtn').onclick = () => { const a = agent(); if (a) socket.emit('restart-agent', a.name); };
    $('disconnectAgentBtn').onclick = () => { const a = agent(); if (a) socket.emit('stop-agent', a.name); };
    $('connectAgentBtn').onclick = () => { const a = agent(); if (a) socket.emit('start-agent', a.name); };
    $('removeAgentBtn').onclick = () => {
        const a = agent();
        if (a && confirm(`Remove bot "${a.name}"?`)) {
            socket.emit('destroy-agent', a.name);
            state.agents = state.agents.filter(ag => ag.name !== a.name);
            delete state.states[a.name];
            if (state.selected === a.name) state.selected = state.agents[0]?.name || null;
            renderEmptyState(); renderAgents(); renderCamera(); renderChat(); renderConsole();
        }
    };

    // camera controls
    setupCameraControls();

    // console
    $('autoscrollCheck').checked = true;
    $('clearConsoleBtn').onclick = () => {
        const a = agent();
        if (a) { state.console[a.name] = []; renderConsole(); }
    };

    // Initialize
    initMindserverConnection();
    renderEmptyState();
    renderAgents();
    renderChat();
    renderConsole();
    renderStats();
    renderInventory();
    renderCamera();
}

document.addEventListener('DOMContentLoaded', init);