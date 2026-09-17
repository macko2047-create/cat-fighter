#!/bin/bash
PROJECT='/Users/maccow/isonated project/Cat Fighter'
NODE='/opt/homebrew/bin/node'

check_port() {
    local pids pid command cwd
    pids=$(/usr/sbin/lsof -nP -t -iTCP:8767 -sTCP:LISTEN 2>/dev/null | /usr/bin/sort -u)
    [ -z "$pids" ] && return 0
    for pid in $pids; do
        command=$(/bin/ps -p "$pid" -o command=)
        cwd=$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')
        case "$command" in
            'node tools/lan-server.cjs'|*/node\ tools/lan-server.cjs)
                [ "$cwd" = "$PROJECT" ] || return 11 ;;
            *) return 11 ;;
        esac
    done
    return 10
}

check_port
status=$?
if [ "$1" = '--check' ]; then exit "$status"; fi
case "$status" in
    10) echo 'Cat Fighter LAN Server is already running'; exit 0 ;;
    11) echo 'Port 8767 is in use by another process. Stop that process before starting Cat Fighter LAN Server.'; exit 1 ;;
esac
cd "$PROJECT" || exit 1
echo 'Cat Fighter LAN Server — press Ctrl+C to stop.'
unset PUBLIC_ORIGIN CAT_SITE_ROOT
export PORT=8767
exec "$NODE" tools/lan-server.cjs
