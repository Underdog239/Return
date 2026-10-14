/* ============================================================
   MindCraft Web — dashboard application
   Connects to the mindserver (socket.io + REST) on the same host.
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
    agents: [],           // [{name, in_game, viewerPort, socket_connected}]
    selected: null,       // selected agent name
    states: {},           // name -> latest full state
    chat: {},             // name -> [{role, from, message, timestamp}]
    console: {},          // name -> [{line, level, timestamp}]
    llmByAgent: {},       // name -> {provider, model} (what was configured at creation)
    wizard: loadConfig(),
    llm: null,            // {provider, model} of selected agent, from wizard config by name
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

/* Resolve the camera viewer URL for a viewer port, across local and proxied environments */
function viewerUrl(port) {
    const loc = window.location;
    // proxied preview hosts of the form https://<port>-<id>.<domain>: swap the port segment
    const m = loc.hostname.match(/^(\d+)(-.+)$/);
    if (m && loc.protocol === 'https:') {
        return `${loc.protocol}//${port}${m[2]}`;
    }
    // local or LAN access: same hostname, different port
    return `http://${loc.hostname}:${port}`;
}

/* ---------------- socket connection ---------------- */

const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
});

socket.on('connect', () => {
    setMindserverStatus('online', 'dashboard online');
    socket.emit('listen-to-agents');
});

socket.on('disconnect', () => {
    setMindserverStatus('offline', 'dashboard offline');
});

socket.on('connect_error', () => {
    setMindserverStatus('offline', 'mindserver unreachable');
});

function setMindserverStatus(kind, text) {
    $('msStatusDot').className = 'dot ' + (kind === 'online' ? 'online' : 'offline');
    $('msStatusText').textContent = text;
}

/* ---------------- agents ---------------- */

socket.on('agents-status', (agents) => {
    state.agents = agents || [];
    // keep a valid selection
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

function agent() {
    return state.agents.find(a => a.name === state.selected) || null;
}

function inGame() {
    const a = agent();
    return !!(a && a.in_game);
}

function renderEmptyState() {
    const has = state.agents.length > 0;
    $('emptyState').classList.toggle('hidden', has);
    $('dashboard').classList.toggle('hidden', !has);
}

function renderAgents() {
    // tabs
    const tabs = $('agentTabs');
    tabs.innerHTML = '';
    for (const a of state.agents) {
        const tab = document.createElement('button');
        tab.className = 'agent-tab' + (a.name === state.selected ? ' active' : '');
        tab.innerHTML = `<span class="mini-dot ${a.in_game ? 'on' : 'off'}"></span>${esc(a.name)}`;
        tab.onclick = () => { state.selected = a.name; renderAgents(); renderChat(); renderConsole(); renderStats(); renderInventory(); renderCamera(); };
        tabs.appendChild(tab);
    }
    // status pill
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
    // control buttons
    $('disconnectAgentBtn').disabled = !a.in_game;
    $('connectAgentBtn').disabled = !!a.socket_connected;
    $('restartAgentBtn').disabled = !a.socket_connected;
    $('removeAgentBtn').disabled = false;
    const chatEnabled = a.in_game;
    $('chatInput').disabled = !chatEnabled;
    $('chatSendBtn').disabled = !chatEnabled;
    document.querySelectorAll('.quick-row .chip').forEach(c => { c.disabled = !chatEnabled; });

    // llm badge
    const llm = state.llmByAgent[a.name];
    $('llmBadge').textContent = llm ? `brain: ${llm.provider} · ${llm.model}` : `brain: ${state.wizard.provider || '–'}`;
}

function renderCamera() {
    const a = agent();
    const frame = $('viewerFrame');
    const placeholder = $('cameraPlaceholder');
    if (a && a.in_game && a.viewerPort && state.wizard.camera !== false) {
        const url = viewerUrl(a.viewerPort);
        if (frame.dataset.loadedFor !== url) {
            frame.dataset.loadedFor = url;
            frame.src = url;
        }
        frame.classList.remove('hidden');
        placeholder.classList.add('hidden');
        $('camOpenBtn').onclick = () => window.open(url, '_blank');
    } else {
        frame.classList.add('hidden');
        frame.dataset.loadedFor = '';
        placeholder.classList.remove('hidden');
        $('cameraPlaceholderText').textContent = !a
            ? 'Camera offline — no bot selected'
            : a.in_game
                ? 'Camera disabled for this bot (enable it when creating a bot)'
                : 'Camera offline — bot is not in game yet';
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

function itemIconUrl(name) {
    return `/assets/item/${encodeURIComponent(agent() ? agent().name : 'bot')}/${encodeURIComponent(name)}.png`;
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
    $('invCount').textContent = `${entries.length} types · ${s.inventory.stacksUsed ?? '?'} stacks`;

    // equipment strip
    const eq = (s.inventory.equipment || {});
    let html = '';
    const armorNames = [eq.helmet, eq.chestplate, eq.leggings, eq.boots, eq.mainHand];
    const anyArmor = armorNames.some(x => x);
    if (anyArmor) {
        html += '<div class="armor-grid" style="grid-column: 1 / -1;">';
        for (const [label, name] of [['Head', eq.helmet], ['Chest', eq.chestplate], ['Legs', eq.leggings], ['Feet', eq.boots], ['Hand', eq.mainHand]]) {
            if (name) {
                html += `<div class="armor-slot" title="${esc(label)}: ${esc(name)}"><img src="${itemIconUrl(name)}" onerror="this.outerHTML='<span class=\\'armor-placeholder\\'>${esc(label)}</span>'"></div>`;
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
            html += `<div class="inv-item" title="${esc(name)}">
                <img loading="lazy" src="${itemIconUrl(name)}" onerror="this.style.display='none'">
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
    box.innerHTML = `<div class="chat-notice">Messages you send go straight to the bot's AI mind. Commands like <code>!stats</code> run instantly; plain language gets thought about.</div>`;
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
    socket.emit('send-message', a.name, {
        from: state.wizard.playerName || 'Player',
        message: message,
    });
    pushChat(a.name, { role: 'user', from: state.wizard.playerName || 'Player', message, timestamp: Date.now() });
}

socket.on('chat-relay', (agentName, entry) => {
    pushChat(agentName, {
        role: entry.role || 'bot',
        from: entry.from,
        name: agentName,
        message: entry.message,
        timestamp: entry.timestamp,
    });
});

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

socket.on('agent-log', (agentName, entry) => {
    pushConsole(agentName, { line: entry.line, level: entry.level, timestamp: entry.timestamp, name: agentName });
});

socket.on('bot-output', (agentName, message) => {
    // bot speech is already shown in chat via chat-relay; keep console clean
});

/* ---------------- wizard ---------------- */

function openWizard() {
    // preload from saved config
    $('wizBotName').value = state.wizard.botName || 'Andy';
    $('wizPlayerName').value = state.wizard.playerName || 'Player';
    $('wizHost').value = state.wizard.host || '127.0.0.1';
    $('wizPort').value = state.wizard.port || 25565;
    $('wizAuth').value = state.wizard.auth || 'offline';
    $('wizBaseProfile').value = state.wizard.base_profile || 'survival';
    $('wizCamera').checked = state.wizard.camera !== false;
    $('wizMemory').checked = !!state.wizard.memory;
    $('wizVersion').value = 'auto';
    $('wizApiKey').value = '';
    $('wizError').classList.add('hidden');

    populateProviders();
    checkOllama();
    loadVersions();
    loadKeyStatus();

    $('wizardModal').classList.remove('hidden');
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
    // datalist-style suggestions via a select for common models + free text
    const modelInput = $('wizModel');
    modelInput.value = (id === state.wizard.provider && state.wizard.model) || p.model;
    // api key row visibility + hint
    const keyRow = $('apiKeyRow');
    if (p.key) {
        keyRow.classList.remove('hidden');
        keyRow.querySelector('span').innerHTML = `API key <i>(${esc(p.key)}, saved to keys.json on the host)</i>`;
    } else {
        keyRow.classList.add('hidden');
    }
    $('wizFooterHint').textContent = p.note || 'Everything stays on your machine.';
    // ollama status row only for ollama
    $('ollamaStatusRow').classList.toggle('hidden', id !== 'ollama' && id !== 'vllm' && id !== 'lmstudio');
}

async function checkOllama() {
    const dot = $('ollamaDot');
    const text = $('ollamaStatusText');
    const hint = $('ollamaHint');
    dot.className = 'dot connecting';
    text.textContent = 'checking Ollama…';
    try {
        const r = await fetch('/api/ollama');
        const data = await r.json();
        if (data.reachable) {
            dot.className = 'dot online';
            const models = data.models || [];
            const hasAndy = models.some(m => m.startsWith('sweaterdog/andy-4'));
            if (models.length === 0) {
                text.textContent = 'Ollama online, no models yet';
                hint.textContent = 'Run: ollama pull sweaterdog/andy-4:micro-q8_0 (or any model you like)';
            } else {
                text.textContent = `Ollama online (${models.length} models)`;
                hint.textContent = hasAndy
                    ? 'andy-4 is ready to go 🎉'
                    : 'Available: ' + models.slice(0, 3).join(', ') + (models.length > 3 ? '…' : '');
            }
        } else {
            dot.className = 'dot offline';
            text.textContent = 'Ollama not running';
            hint.textContent = 'Install from ollama.com then run: ollama pull sweaterdog/andy-4:micro-q8_0 — or pick a cloud provider below.';
        }
    } catch {
        dot.className = 'dot offline';
        text.textContent = 'Could not reach the host';
        hint.textContent = '';
    }
}

async function loadVersions() {
    try {
        const r = await fetch('/api/supported-versions');
        const data = await r.json();
        const sel = $('wizVersion');
        const current = sel.value;
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
        const r = await fetch('/api/keys');
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
        const r = await fetch('/api/detect-server', {
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
            result.textContent = '✗ No Minecraft server found there. Is it running? Is the port right?';
        }
    } catch {
        result.className = 'detect-result bad';
        result.textContent = '✗ Detection failed (mindserver unreachable).';
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
        showWizardError('Bot name and your player name must be different, otherwise the bot will ignore your messages.');
        return;
    }
    if (!model) {
        showWizardError('Please enter a model name.');
        return;
    }
    const p = PROVIDERS[provider];
    if (p.key && apiKey.length === 0) {
        // check whether already saved
        try {
            const r = await fetch('/api/keys');
            const data = await r.json();
            if (!data.keys || !data.keys[p.key]) {
                showWizardError(`This provider needs an API key (${p.key}). Paste it above — it is stored only in keys.json on your machine.`);
                return;
            }
        } catch {
            showWizardError('Could not verify the API key. Try again.');
            return;
        }
    }

    // save the API key first (if provided)
    if (p.key && apiKey.length > 0) {
        try {
            await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [p.key]: apiKey }),
            });
        } catch {
            showWizardError('Could not save the API key to keys.json.');
            return;
        }
    }

    // persist wizard state
    Object.assign(state.wizard, { botName, playerName, host, port, version, auth, base_profile: baseProfile, provider, model, camera, memory });
    saveConfig();
    state.llmByAgent[botName] = { provider, model };

    const profile = {
        name: botName,
        model: provider === 'openai' ? model : `${provider}/${model}`,
    };
    if (provider === 'ollama') {
        profile.embedding = 'ollama';
    }

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
            pushChat(botName, { role: 'system', message: 'Bot created! Waiting for it to connect to the Minecraft server…', timestamp: Date.now() });
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
    // header
    $('openWizardBtn').onclick = openWizard;
    $('emptyCreateBtn').onclick = openWizard;
    $('helpBtn').onclick = () => $('helpModal').classList.remove('hidden');
    $('helpCloseBtn').onclick = () => $('helpModal').classList.add('hidden');
    $('helpCloseBtn2').onclick = () => $('helpModal').classList.add('hidden');

    // wizard
    $('wizardCloseBtn').onclick = () => $('wizardModal').classList.add('hidden');
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
    $('restartAgentBtn').onclick = () => { if (agent()) socket.emit('restart-agent', agent().name); };
    $('disconnectAgentBtn').onclick = () => { if (agent()) socket.emit('stop-agent', agent().name); };
    $('connectAgentBtn').onclick = () => { if (agent()) socket.emit('start-agent', agent().name); };
    $('removeAgentBtn').onclick = () => {
        const a = agent();
        if (a && confirm(`Remove bot "${a.name}"? (memory on disk is kept)`)) socket.emit('destroy-agent', a.name);
    };

    // camera
    $('camFullscreenBtn').onclick = () => {
        const frame = $('cameraFrame');
        if (document.fullscreenElement) document.exitFullscreen();
        else frame.requestFullscreen && frame.requestFullscreen();
    };
    $('clearConsoleBtn').onclick = () => {
        if (state.selected) { state.console[state.selected] = []; renderConsole(true); }
    };

    // close modals on backdrop click
    for (const id of ['wizardModal', 'autonomousModal', 'helpModal']) {
        $(id).addEventListener('mousedown', (e) => {
            if (e.target === $(id)) $(id).classList.add('hidden');
        });
    }

    renderChat();
    renderConsole(true);
    renderEmptyState();
}

document.addEventListener('DOMContentLoaded', init);
