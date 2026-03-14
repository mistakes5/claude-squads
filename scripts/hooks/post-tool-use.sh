#!/bin/bash
# Squads PostToolUse hook — auto-broadcasts your activity to the squad.
# This runs after every tool use in Claude Code.

# Read the hook input from stdin
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null)

# Only broadcast for interesting tools, skip squads tools to avoid loops
case "$TOOL_NAME" in
  squads_*|mcp__squads__*) exit 0 ;;
esac

# Extract useful detail based on tool
DETAIL=""
case "$TOOL_NAME" in
  Read|read)
    DETAIL=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path','').split('/')[-1])" 2>/dev/null)
    ACTION="reading"
    ;;
  Edit|edit)
    DETAIL=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path','').split('/')[-1])" 2>/dev/null)
    ACTION="editing"
    ;;
  Write|write)
    DETAIL=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path','').split('/')[-1])" 2>/dev/null)
    ACTION="writing"
    ;;
  Bash|bash)
    CMD=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command','')[:50])" 2>/dev/null)
    DETAIL="$CMD"
    ACTION="running"
    ;;
  Grep|grep)
    ACTION="searching"
    DETAIL=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pattern',''))" 2>/dev/null)
    ;;
  *)
    ACTION="using $TOOL_NAME"
    ;;
esac

# Read current room from settings
ROOM=$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('~/.squads/settings.json'))).get('current_room',''))" 2>/dev/null)

if [ -z "$ROOM" ]; then
  exit 0
fi

# Update presence status via the watcher's state file (lightweight, no API call)
python3 -c "
import json, os

state_file = os.path.expanduser('~/.squads/state.json')
try:
    state = json.load(open(state_file))
    state['last_activity'] = {'action': '$ACTION', 'detail': '$DETAIL', 'timestamp': __import__('datetime').datetime.now().isoformat()}
    json.dump(state, open(state_file, 'w'), indent=2)
except:
    pass
" 2>/dev/null

exit 0
