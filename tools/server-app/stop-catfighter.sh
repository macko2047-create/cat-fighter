#!/bin/bash

PROJECT="/Users/maccow/isonated project/Cat Fighter"

for PIDFILE in \
    "$PROJECT/logs/catfighter-node.pid" \
    "$PROJECT/logs/catfighter-cloudflared.pid"
do
    if [ -f "$PIDFILE" ]; then
        PID="$(cat "$PIDFILE")"
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
        fi
        rm -f "$PIDFILE"
    fi
done

exit 0
