#!/bin/bash
# Ralph Wiggum - VETTR Score V2 Backend Implementation
# Usage: ./ralph-vs2.sh [max_iterations]
set -e

MODEL="claude-sonnet-4-5"
MAX_ITERATIONS=17

while [[ $# -gt 0 ]]; do
  case $1 in
    --model) MODEL="$2"; shift 2 ;;
    *) [[ "$1" =~ ^[0-9]+$ ]] && MAX_ITERATIONS="$1"; shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$SCRIPT_DIR/vs2-prd.json"
PROGRESS_FILE="$SCRIPT_DIR/vs2-progress.txt"

# Initialize progress file if not exists
[ ! -f "$PROGRESS_FILE" ] && {
  echo "# VETTR Backend - Score V2 Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ralph - VETTR Score V2 Backend                  ║"
echo "║  Model: $MODEL"
echo "║  Max Iterations: $MAX_ITERATIONS"
echo "║  PRD: vs2-prd.json (17 stories)"
echo "╚══════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_DIR"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "======================================================="
  echo "  Ralph VS2 Iteration $i of $MAX_ITERATIONS - $(date '+%H:%M:%S')"
  echo "======================================================="

  OUTPUT=$(/opt/homebrew/bin/claude --dangerously-skip-permissions --model "$MODEL" --print "Read the file scripts/ralph/CLAUDE.md and follow the instructions in it. IMPORTANT: Use scripts/ralph/vs2-prd.json (NOT prd.json) to find the next story with passes=false and implement it. Use scripts/ralph/vs2-progress.txt for progress logging." 2>&1 | tee /dev/stderr) || true

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  Ralph completed ALL VS2 backend tasks!          ║"
    echo "╚══════════════════════════════════════════════════╝"
    exit 0
  fi

  echo ""
  echo "Iteration $i complete. Continuing to next story..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
