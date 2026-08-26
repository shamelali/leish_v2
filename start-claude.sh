#!/bin/bash
# Route Claude Code to look at your custom local translation gateway
export ANTHROPIC_BASE_URL="http://localhost:8082/v1"
export ANTHROPIC_API_KEY="sk-ant-localproxyplaceholder12345"

# Start your Node.js proxy server in the background if it's not active
if ! lsof -i:8082 -t >/dev/null; then
    echo "🚀 Booting up the local NVIDIA bridge..."
    # Replace the path below with the exact file path to your custom server.js if it's elsewhere
    node server.js & 
    sleep 2
fi

echo "💻 Initializing Claude Code..."
claude
