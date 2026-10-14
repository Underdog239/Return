#!/usr/bin/env bash
# MindCraft Web launcher — installs dependencies if needed and starts the dashboard (MindServer).
set -e
cd "$(dirname "$0")/mindcraft"

PORT="${MINDSERVER_PORT:-8080}"

# ---- preflight: we want clear errors instead of a silent exit ----

if ! command -v node >/dev/null 2>&1; then
    echo "✗ Node.js was not found."
    echo "  Install Node.js 18–22 (LTS) from https://nodejs.org and run this script again."
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "✗ Node.js $(node -v) is too old — MindCraft needs Node.js 18 or newer (18–22 LTS recommended)."
    exit 1
fi
if [ "$NODE_MAJOR" -gt 22 ]; then
    echo "! Node.js $(node -v) detected. Node 18–22 (LTS) is recommended — newer versions can break the"
    echo "  optional native modules (gl, canvas) needed for the live camera. See mindcraft/FAQ.md."
fi

# Is something already listening on the dashboard port?
PORT_STATE="$(MINDSERVER_PORT="$PORT" node -e '
const net = require("net");
const s = net.createServer();
s.once("error", (e) => { console.log(e.code === "EADDRINUSE" ? "busy" : "free"); process.exit(0); });
s.once("listening", () => s.close(() => { console.log("free"); }));
s.listen(Number(process.env.MINDSERVER_PORT) || 8080, "127.0.0.1");
' 2>/dev/null)"

if [ "$PORT_STATE" = "busy" ]; then
    echo "! Port $PORT is already in use."
    echo "  MindServer may already be running — open http://localhost:$PORT in your browser."
    echo "  Otherwise close the other program (or set MINDSERVER_PORT=xxxx and try again)."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Installing dependencies (first run — this can take a few minutes)..."
    if ! npm install; then
        echo "✗ 'npm install' failed (see the errors above)."
        echo "  Hints: use Node 18–22 LTS, or try 'npm install --no-optional' to skip the camera's native modules."
        echo "  More: mindcraft/FAQ.md"
        exit 1
    fi
fi

cat <<EOF
Starting MindCraft Web dashboard (MindServer) …

  Dashboard:  http://localhost:$PORT          <- open this in your browser
  LAN:        http://<your-ip>:$PORT          <- other devices on your network
  Stop:       press Ctrl+C

If the dashboard says "MindServer not reachable", make sure you opened the URL above
(not a copy of index.html, and not the GitHub Pages link).
EOF

exec node main.js
