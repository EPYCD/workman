#!/usr/bin/env bash
# Point a checkout's git identity at an agent's machine account.
#
# Run once per checkout that an agent works in, on the machine it runs on.
# The token is read without echoing and written to a 0600 credential file
# outside the repository — never into .git/config, where `git remote -v` and
# every screen-share would show it.
#
#   ./agent-identity.sh <machine-account> [checkout]
set -euo pipefail

ACCOUNT="${1:-}"
CHECKOUT="${2:-$PWD}"
CRED_DIR="$HOME/.config/capyard-agent"
CRED_FILE="$CRED_DIR/credentials"

[ -n "$ACCOUNT" ] || { echo "usage: $0 <machine-account> [checkout]" >&2; exit 1; }
[ -d "$CHECKOUT/.git" ] || { echo "not a git checkout: $CHECKOUT" >&2; exit 1; }

cleanup() { unset PAT 2>/dev/null || true; }
trap cleanup EXIT

# The whole point is that the agent is not the person who reviews its work.
REVIEWER="$(gh api user --jq .login 2>/dev/null || true)"
if [ -n "$REVIEWER" ] && [ "$REVIEWER" = "$ACCOUNT" ]; then
  cat >&2 <<EOF
refusing: '$ACCOUNT' is the account gh is logged in as on this machine.

An agent must not share a GitHub account with the person who reviews its work
— GitHub does not let anyone approve their own pull request, so nothing would
be enforceable. Create a separate machine account first.
EOF
  exit 1
fi

read -rsp "Fine-grained PAT for ${ACCOUNT}: " PAT; echo
case "$PAT" in
  github_pat_*|ghp_*) : ;;
  *) echo "that does not look like a GitHub token" >&2; exit 1 ;;
esac

mkdir -p "$CRED_DIR"; chmod 700 "$CRED_DIR"
umask 077
printf 'https://%s:%s@github.com\n' "$ACCOUNT" "$PAT" > "$CRED_FILE"
chmod 600 "$CRED_FILE"
unset PAT

cd "$CHECKOUT"
git config user.name  "$ACCOUNT"
git config user.email "${ACCOUNT}@users.noreply.github.com"
git config credential.helper "store --file=$CRED_FILE"

echo
echo "checkout : $CHECKOUT"
echo "author   : $(git config user.name) <$(git config user.email)>"
echo "token    : $CRED_FILE (0600, outside the repo)"
echo "reviewer : ${REVIEWER:-unknown} — must differ from the author above"
echo
echo "Verify with a real push, then confirm the PR author is '$ACCOUNT':"
echo "  gh pr list --repo <owner>/<repo> --limit 1 --json author"
