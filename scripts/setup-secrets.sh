#!/bin/sh
# Stores @RunonRhea's Instagram credentials as GitHub Actions secrets for the posting job, without
# the values ever appearing in a terminal history or chat. Run it from any directory:
#
#   sh scripts/setup-secrets.sh        # IG_USER_ID, IG_ACCESS_TOKEN (and optionally GH_PAT)
#
# It prompts for the Instagram user ID and the access token (the token is not echoed), checks the
# token against the API, then optionally asks for a fine-grained GitHub personal access token
# (GH_PAT) that lets the job store the weekly refreshed Instagram token. Needs the GitHub CLI
# logged in as the repository owner (gh auth status).
set -eu
REPO="alexgateley/rhea-social"
HANDLE="@RunonRhea"
echo "Storing credentials for $HANDLE in $REPO"
printf 'Instagram user ID (shown next to the token in the Meta dashboard): '; read -r IG_USER_ID
printf 'Instagram access token (paste, then Enter; it will not be shown): '
stty -echo; read -r IG_ACCESS_TOKEN; stty echo; printf '\n'
[ -n "$IG_USER_ID" ] && [ -n "$IG_ACCESS_TOKEN" ] || { echo "Both values are required."; exit 1; }
case "$IG_USER_ID" in *[!0-9]*) echo "The Instagram user ID is a number (it looks like a token was pasted there). Start over."; exit 1 ;; esac
# Check the token works before storing it
ME=$(curl -s "https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=$IG_ACCESS_TOKEN")
case "$ME" in
  *username*) echo "Token check: $ME" ;;
  *) echo "Token check failed: $ME"; exit 1 ;;
esac
case "$ME" in
  *'"username":"RunonRhea"'*|*'"username":"runonrhea"'*) : ;;
  *) echo "Note: that token is not for $HANDLE. Continuing, but check the account." ;;
esac
printf '%s' "$IG_USER_ID" | gh secret set IG_USER_ID --repo "$REPO"
printf '%s' "$IG_ACCESS_TOKEN" | gh secret set IG_ACCESS_TOKEN --repo "$REPO"
echo "Stored IG_USER_ID and IG_ACCESS_TOKEN."
printf 'GitHub fine-grained token for automatic refresh (optional, Enter to skip; not shown): '
stty -echo; read -r GH_PAT; stty echo; printf '\n'
if [ -n "$GH_PAT" ]; then
  printf '%s' "$GH_PAT" | gh secret set GH_PAT --repo "$REPO"
  echo "Stored GH_PAT."
else
  echo "Skipped GH_PAT: regenerate the Instagram token in the Meta dashboard before it expires (60 days)."
fi
echo "Done. Test with: gh workflow run \"Post Owner math\" --repo $REPO -f dry_run=true"
