#!/bin/bash
# Ralph Pulse Profile - Automated agent loop
# Iterates through pulse-profile-prd.json stories using Claude
# Targets: iOS, Web, Android repos

set -e

BACKEND_DIR="/Users/manav/Space/code/vettr-backend"
IOS_DIR="/Users/manav/.claude-worktrees/vettr-ios/charming-lichterman"
WEB_DIR="/Users/manav/Space/code/vettr-web"
ANDROID_DIR="/Users/manav/Space/code/vettr-android"
PRD="$BACKEND_DIR/scripts/ralph/pulse-profile-prd.json"
INSTRUCTIONS="$BACKEND_DIR/scripts/ralph/CLAUDE-pulse-profile.md"
PROGRESS="$BACKEND_DIR/scripts/ralph/pulse-profile-progress.txt"

MAX_ITERATIONS=12

echo "🔍 Starting Ralph (Pulse Profile) - Max iterations: $MAX_ITERATIONS"
echo "   iOS: $IOS_DIR"
echo "   Web: $WEB_DIR"
echo "   Android: $ANDROID_DIR"
echo "   PRD: $PRD"
echo ""

# Copy instruction files into each repo so Claude can read them
sync_files() {
    for DIR in "$IOS_DIR" "$WEB_DIR" "$ANDROID_DIR"; do
        cp "$PRD" "$DIR/.ralph-prd.json" 2>/dev/null || true
        cp "$INSTRUCTIONS" "$DIR/.ralph-instructions.md" 2>/dev/null || true
        cp "$PROGRESS" "$DIR/.ralph-progress.txt" 2>/dev/null || true
    done
}

# Copy updated PRD/progress back from the repo after each iteration
sync_back() {
    local work_dir="$1"
    if [ -f "$work_dir/.ralph-prd.json" ]; then
        cp "$work_dir/.ralph-prd.json" "$PRD"
    fi
    if [ -f "$work_dir/.ralph-progress.txt" ]; then
        cp "$work_dir/.ralph-progress.txt" "$PROGRESS"
    fi
}

for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "==============================================================="
    echo "  Ralph Pulse Profile Iteration $i of $MAX_ITERATIONS"
    echo "==============================================================="

    # Sync files before each iteration
    sync_files

    # Check if all stories are complete
    REMAINING=$(python3 -c "
import json
with open('$PRD') as f:
    prd = json.load(f)
remaining = [s['id'] for s in prd['stories'] if not s.get('passes', False)]
print(len(remaining))
")

    if [ "$REMAINING" = "0" ]; then
        echo "✅ All stories complete! Nothing left to do."
        break
    fi

    # Determine which repo the next story belongs to
    NEXT_REPO=$(python3 -c "
import json
with open('$PRD') as f:
    prd = json.load(f)
for s in sorted(prd['stories'], key=lambda x: x['priority']):
    if not s.get('passes', False):
        print(s['repo'])
        break
")

    NEXT_STORY=$(python3 -c "
import json
with open('$PRD') as f:
    prd = json.load(f)
for s in sorted(prd['stories'], key=lambda x: x['priority']):
    if not s.get('passes', False):
        print(s['id'])
        break
")

    echo "Next story: $NEXT_STORY (repo: $NEXT_REPO) — Remaining: $REMAINING"

    # Set the working directory and build command based on the repo
    case "$NEXT_REPO" in
        ios)
            WORK_DIR="$IOS_DIR"
            BUILD_CMD="xcodebuild -project vettr-ios.xcodeproj -scheme vettr-ios -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build 2>&1 | tail -5"
            ;;
        web)
            WORK_DIR="$WEB_DIR"
            BUILD_CMD="npm run build"
            ;;
        android)
            WORK_DIR="$ANDROID_DIR"
            BUILD_CMD="./gradlew app:compileDebugKotlin 2>&1 | tail -20"
            ;;
        *)
            echo "Unknown repo: $NEXT_REPO"
            exit 1
            ;;
    esac

    # Extract the story description to embed in the prompt
    STORY_DESC=$(python3 -c "
import json
with open('$PRD') as f:
    prd = json.load(f)
for s in sorted(prd['stories'], key=lambda x: x['priority']):
    if not s.get('passes', False):
        print(f\"Story: {s['id']} - {s['title']}\")
        print(f\"Repo: {s['repo']}\")
        print(f\"Description: {s['description'][:3000]}\")
        print(f\"Acceptance: {', '.join(s['acceptance'])}\")
        break
")

    echo "Working directory: $WORK_DIR"
    echo ""

    # Run Claude from the correct repo directory
    OUTPUT=$(cd "$WORK_DIR" && claude --model claude-sonnet-4-5 --dangerously-skip-permissions --print \
        "You are Ralph, an autonomous coding agent implementing VETTR Pulse profile-based changes and watchlist management.

Read your instructions at .ralph-instructions.md in the current directory.
Read the PRD at .ralph-prd.json in the current directory.
Read the progress log at .ralph-progress.txt in the current directory.

Here is the story to implement:
$STORY_DESC

Pick the highest priority story with passes=false (should be $NEXT_STORY).
Implement it in THIS repo (current directory).
Verify it builds with: $BUILD_CMD
Commit with message: feat: $NEXT_STORY - <story title>
Push to remote.
Update .ralph-prd.json to set passes=true for the completed story.
Append progress to .ralph-progress.txt.

Do NOT modify .ralph-instructions.md. Only modify .ralph-prd.json and .ralph-progress.txt.
Do NOT commit the .ralph-* files to git. Only commit actual code changes.

If ALL stories have passes=true after your update, output exactly: <promise>COMPLETE</promise>" \
        2>&1) || true

    echo "$OUTPUT" | tail -50

    # Sync PRD and progress back
    sync_back "$WORK_DIR"

    # Check for completion signal (exact match only)
    if echo "$OUTPUT" | grep -qF "<promise>COMPLETE</promise>"; then
        echo ""
        echo "✅ Ralph (Pulse Profile) completed all tasks!"
        echo "Completed at iteration $i of $MAX_ITERATIONS"
        break
    fi

    echo "Iteration $i complete. Continuing..."
done

# Clean up copied files
for DIR in "$IOS_DIR" "$WEB_DIR" "$ANDROID_DIR"; do
    rm -f "$DIR/.ralph-prd.json" "$DIR/.ralph-instructions.md" "$DIR/.ralph-progress.txt"
done

echo ""
echo "Ralph (Pulse Profile) finished."
