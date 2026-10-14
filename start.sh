#!/usr/bin/env bash
# MindCraft Web launcher — installs dependencies if needed and starts the dashboard.
set -e
cd "$(dirname "$0")/mindcraft"
if [ ! -d node_modules ]; then
    echo "Installing dependencies (first run)..."
    npm install
fi
echo "Starting MindCraft Web dashboard on http://localhost:8080 ..."
exec node main.js
