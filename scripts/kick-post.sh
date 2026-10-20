#!/bin/sh
# Kicks the "Post @RunonRhea" GitHub workflow from this Mac, by hand. GitHub's own cron schedule
# fires hours late or not at all on a quiet repository, so two launchd agents kick the workflow at
# 7:05 and 9:05 AM and 6:05 and 8:05 PM Pacific (launchd/com.rhea.morning.plist, com.rhea.evening.plist).
# The agents carry the same command written out in their plist, not a call to this file: macOS
# protects ~/Desktop, where this file lives, from launchd jobs (scripts/workflow.test.mjs keeps the
# two in step).
#
#   kick-post.sh           # auto (what the agents send): whatever is due and not yet posted
#   kick-post.sh morning   # only the 7 AM slot
#   kick-post.sh evening   # only the 6 PM slot (on a memorial day it posts nothing)
#
# The workflow decides whether to post: each slot posts once (a marker per date and slot in
# published/), only from its hour in Pacific time, every day; on a memorial day only the memorial
# carousel posts (from 7 AM). Extra kicks are harmless. Needs the GitHub CLI logged in as the
# repository owner (gh auth status). KICK_DRY_RUN=true prints the command instead of running it.
set -u
SLOT="${1:-auto}"
case "$SLOT" in
  morning|evening|auto) ;;
  *) echo "Usage: kick-post.sh [morning|evening|auto]" >&2; exit 2 ;;
esac
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="alexgateley/rhea-social"
WORKFLOW="Post @RunonRhea"
LOG="$HOME/Library/Logs/rhea-runonrhea.log"
mkdir -p "$(dirname "$LOG")"
stamp() { date '+%Y-%m-%d %H:%M:%S %Z'; }

if [ "${KICK_DRY_RUN:-}" = "true" ]; then
  echo "would run: gh workflow run \"$WORKFLOW\" --repo $REPO -f slot=$SLOT -f dry_run=false"
  exit 0
fi

# Wait briefly for the network after wake-up
n=0
until curl -s -o /dev/null --max-time 5 https://api.github.com/ || [ $n -ge 12 ]; do n=$((n+1)); sleep 10; done

if out=$(gh workflow run "$WORKFLOW" --repo "$REPO" -f slot="$SLOT" -f dry_run=false 2>&1); then
  echo "$(stamp) kicked $SLOT (by hand): $out" >> "$LOG"
else
  echo "$(stamp) FAILED to kick $SLOT: $out" >> "$LOG"
  exit 1
fi
