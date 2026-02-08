#!/bin/bash
# Ralph Monitor - Runs ralph.sh and pushes progress to GitHub periodically
# Usage: ./ralph-monitor.sh [max_iterations]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAX_ITERATIONS="${1:-100}"

cd "$PROJECT_DIR"

echo "Starting Ralph Monitor from $PROJECT_DIR"
echo "Max iterations: $MAX_ITERATIONS"

# Run ralph loop
"$SCRIPT_DIR/ralph.sh" "$MAX_ITERATIONS" 2>&1 | while IFS= read -r line; do
  echo "$line"

  # Push to GitHub every 5 completed iterations
  if echo "$line" | grep -q "Iteration .* complete"; then
    ITER=$(echo "$line" | grep -oP 'Iteration \K[0-9]+')
    if [ $((ITER % 5)) -eq 0 ]; then
      git -C "$PROJECT_DIR" push origin ralph/vettr-backend 2>/dev/null || true
    fi
  fi
done

# Final push
git -C "$PROJECT_DIR" push origin ralph/vettr-backend 2>/dev/null || true
echo "Ralph Monitor finished."
