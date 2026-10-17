#!/bin/sh
# Kicks the "Post Owner math" GitHub workflow from this Mac. GitHub's own cron schedule fires hours
# late or not at all on a quiet repository, so a launchd agent runs this at 7:05 and 9:05 AM
# Pacific (see launchd/com.rhea.ownermath.plist). The workflow itself decides whether to post: it
# publishes today's Reel once (a marker file in published/ prevents duplicates), only from 7 AM
# Pacific onward and only on weekdays, so extra kicks are harmless. Needs the GitHub CLI logged in
# as the repository owner (gh auth status).
#
#   kick-post.sh            # today's Owner math Reel
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="alexgateley/rhea-social"
LOG="$HOME/Library/Logs/rhea-ownermath.log"
mkdir -p "$(dirname "$LOG")"
stamp() { date '+%Y-%m-%d %H:%M:%S %Z'; }

# Weekends: nothing to post, and nothing to kick
case "$(date +%u)" in 6|7) echo "$(stamp) weekend; not kicking" >> "$LOG"; exit 0 ;; esac

# Wait briefly for the network after wake-up
n=0
until curl -s -o /dev/null --max-time 5 https://api.github.com/ || [ $n -ge 12 ]; do n=$((n+1)); sleep 10; done

if out=$(gh workflow run "Post Owner math" --repo "$REPO" -f dry_run=false 2>&1); then
  echo "$(stamp) kicked: $out" >> "$LOG"
else
  echo "$(stamp) FAILED to kick: $out" >> "$LOG"
  exit 1
fi
