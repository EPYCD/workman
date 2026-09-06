#!/usr/bin/env bash
# Log in to the board and run `marshal setup`.
#
# The password is read without echoing and the JWT is never printed, so
# neither ends up on screen, in shell history, or in a transcript. Both are
# unset before the script exits.
#
#   ./marshal-setup.sh [username]
set -euo pipefail

BOARD="${BOARD:-https://workman.kaoxhq.tech}"
REPO="${REPO:-$HOME/srv/capyard}"
USER_NAME="${1:-subinsayzz}"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[ -d "$REPO" ] || { echo "no repository at $REPO" >&2; exit 1; }

cleanup() { unset PW JWT BODY 2>/dev/null || true; }
trap cleanup EXIT

read -rsp "Board password for ${USER_NAME}: " PW; echo
read -rp  "TOTP passcode (blank if 2FA is off): " TOTP

BODY=$(jq -nc --arg u "$USER_NAME" --arg p "$PW" --arg t "$TOTP" \
  '{username:$u, password:$p, long_token:true}
   + (if $t == "" then {} else {totp_passcode:$t} end)')
unset PW

JWT=$(curl -sS --fail-with-body -X POST "$BOARD/api/v2/login" \
  -H 'Content-Type: application/json' -d "$BODY" | jq -r '.token // empty')
unset BODY

if [ -z "$JWT" ]; then
  echo "login failed — no token returned. Wrong password, or 2FA is on and the passcode was blank." >&2
  exit 1
fi
case "$JWT" in
  eyJ*) : ;;   # a JWT, not a tk_ API token: setup calls /user/bots, which rejects API tokens
  *) echo "that is not a JWT (got '${JWT:0:3}…') — setup needs a session token" >&2; exit 1 ;;
esac
echo "got a session token (${#JWT} chars). running marshal setup…"
echo

# marshal lives in the container, not on this host, and /repo there is the
# same checkout as $REPO here.
docker exec -i -w /repo -e JWT="$JWT" deploy-marshal-1   sh -c 'marshal setup --token "$JWT"' 
