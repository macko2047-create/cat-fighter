#!/bin/bash

PROJECT="/Users/maccow/isonated project/Cat Fighter"
NODE="/opt/homebrew/bin/node"
CLOUDFLARED="/opt/homebrew/bin/cloudflared"

NODE_PID="$PROJECT/logs/catfighter-node.pid"
CF_PID="$PROJECT/logs/catfighter-cloudflared.pid"

NODE_LOG="$PROJECT/logs/catfighter-node.log"
CF_LOG="$PROJECT/logs/catfighter-cloudflared.log"

cd "$PROJECT" || exit 1

# Avoid duplicate Node server
if [ -f "$NODE_PID" ] && kill -0 "$(cat "$NODE_PID")" 2>/dev/null; then
    :
else
    PUBLIC_ORIGIN="https://catfighter.armedgaltactical.com" \
    HOST="127.0.0.1" \
    PORT="18767" \
    nohup "$NODE" tools/p2p-server.cjs >> "$NODE_LOG" 2>&1 &
    echo $! > "$NODE_PID"
fi

sleep 1

# Avoid duplicate Cat Fighter tunnel
if [ -f "$CF_PID" ] && kill -0 "$(cat "$CF_PID")" 2>/dev/null; then
    :
else
    nohup "$CLOUDFLARED" tunnel run catfighter >> "$CF_LOG" 2>&1 &
    echo $! > "$CF_PID"
fi

exit 0
