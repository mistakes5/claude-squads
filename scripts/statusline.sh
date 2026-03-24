#!/bin/bash
# Squads status line for Claude Code
# Reads cached squad state from ~/.squads/state.json (written by the watcher)
# Falls back to a minimal display if no state is available.

STATE_FILE="$HOME/.squads/state.json"

# Claude brand colors (ANSI 256 closest matches + truecolor)
ACCENT="\033[38;2;193;95;60m"    # #C15F3C Crail
PEACH="\033[38;2;222;115;86m"    # #DE7356
GREEN="\033[38;2;91;163;124m"    # #5BA37C
DIM="\033[38;2;107;101;96m"      # #6B6560
CREAM="\033[38;2;232;228;219m"   # #E8E4DB
RESET="\033[0m"
BOLD="\033[1m"

if [ ! -f "$STATE_FILE" ]; then
  echo -e "${DIM}✦ squads${RESET}"
  exit 0
fi

# Parse state with python3 (available on macOS)
python3 -c "
import json, sys, os

try:
    state = json.load(open(os.path.expanduser('~/.squads/state.json')))
except:
    print('\033[38;2;107;101;96m✦ squads\033[0m')
    sys.exit(0)

room = state.get('room_name', '')
online = state.get('online', [])
unread = state.get('unread', 0)
username = state.get('username', '')

parts = []

# Sparkle
parts.append('\033[1m\033[38;2;193;95;60m✦\033[0m')

# Room name
if room:
    parts.append(f'\033[38;2;232;228;219m{room}\033[0m')

    # Online count
    count = len(online)
    if count > 0:
        names = ', '.join(online[:3])
        if count > 3:
            names += f' +{count - 3}'
        parts.append(f'\033[38;2;91;163;124m{count} online\033[0m')
        parts.append(f'\033[38;2;107;101;96m({names})\033[0m')
    else:
        parts.append('\033[38;2;107;101;96mempty\033[0m')

    # Unread messages
    if unread > 0:
        parts.append(f'\033[1m\033[38;2;222;115;86m{unread} new\033[0m')
else:
    parts.append('\033[38;2;107;101;96msquads\033[0m')

# Squad message (ephemeral, from a squad member)
squad_msg = state.get('squad_message')
if squad_msg and squad_msg.get('message'):
    parts.append(f'\033[38;2;222;115;86m[{squad_msg["username"]}: {squad_msg["message"]}]\033[0m')

print(' '.join(parts))
" 2>/dev/null || echo -e "${DIM}✦ squads${RESET}"
