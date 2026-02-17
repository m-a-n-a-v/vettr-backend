#!/bin/bash
# Ralph - Discovery Page Enhancements Loop
# Usage: ./ralph-discovery.sh [max_iterations]

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="/Users/manav/Space/code/vettr-backend"

echo "🔍 Starting Ralph (Discovery Enhancements) - Max iterations: $MAX_ITERATIONS"
echo "   Backend: $BACKEND_DIR"
echo "   PRD: $SCRIPT_DIR/discovery-prd.json"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Discovery Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="

  OUTPUT=$(/opt/homebrew/bin/claude \
    --dangerously-skip-permissions \
    --model claude-sonnet-4-5 \
    --print \
    "Read the file scripts/ralph/CLAUDE-discovery.md and follow the instructions in it. Read scripts/ralph/discovery-prd.json to find the next story with passes=false and implement it. Read scripts/ralph/discovery-progress.txt for context on what has been done so far." \
    2>&1 | tee /dev/stderr) || true

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "🎉 Ralph (Discovery) completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $SCRIPT_DIR/discovery-progress.txt for status."
exit 1
