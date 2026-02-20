#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop (Cron Jobs version)
# Usage: ./ralph-cron.sh [--tool amp|claude] [--model MODEL] [max_iterations]

set -e

# Parse arguments
TOOL="claude"
MODEL="claude-sonnet-4-5"
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --model=*)
      MODEL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# Map shorthand model names
case "$MODEL" in
  sonnet)
    MODEL="claude-sonnet-4-5"
    ;;
  opus)
    MODEL="claude-opus-4-6"
    ;;
  haiku)
    MODEL="claude-haiku-4-5"
    ;;
esac

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd-cron.json"
PROGRESS_FILE="$SCRIPT_DIR/progress-cron.txt"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log - VETTR Cron Jobs" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "Project: VETTR Cron Jobs" >> "$PROGRESS_FILE"
  echo "Backend: /Users/manav/Space/code/vettr-backend" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph (Cron Jobs) - Tool: $TOOL - Model: $MODEL - Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Cron Iteration $i of $MAX_ITERATIONS ($TOOL / $MODEL)"
  echo "==============================================================="

  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$SCRIPT_DIR/prompt-cron.md" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    OUTPUT=$(/opt/homebrew/bin/claude --dangerously-skip-permissions --model "$MODEL" --print "Read the file scripts/ralph/CLAUDE-cron.md and follow the instructions in it. Read scripts/ralph/prd-cron.json to find the next story with passes=false and implement it." 2>&1 | tee /dev/stderr) || true
  fi

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph (Cron Jobs) completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
