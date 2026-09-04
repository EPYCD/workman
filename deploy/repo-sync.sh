#!/bin/sh
# Keeps the coordinated clone's WORKING TREE current, and restarts Marshal when
# — and only when — a file it reads at startup has changed.
#
# Marshal resolves the spec at origin/main and fetches every tick, so a
# teammate's push is visible within a minute with no help from this. What it
# does NOT re-read is its own configuration: .marshal.yml (reference prefixes,
# spec paths, app_root, the pool, paste_min_words) and .veans.yml (the project
# binding) are loaded from the working tree at process start. Merging a change
# to either used to look like it had been ignored, because the working tree was
# still whatever was checked out weeks ago.
#
# Runs as uid 10001 — the clone's owner. Never as root: a root-owned object in
# .git breaks Marshal's own fetch, which is the failure this must not cause.
set -u

REPO="${SYNC_REPO:-/repo}"
TARGET="${SYNC_REF:-origin/main}"
INTERVAL="${SYNC_INTERVAL:-300}"
MARSHAL="${MARSHAL_CONTAINER:-deploy-marshal-1}"
# The files Marshal only reads at startup.
CONFIG=".marshal.yml .veans.yml"

log() { printf '%s repo-sync: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
short() { printf '%.8s' "$1"; }

command -v git >/dev/null 2>&1 || { log "git is missing from this image"; exit 1; }

log "started — fast-forwarding $REPO to $TARGET every ${INTERVAL}s"

while :; do
  started=$(date +%s)
  before=$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "")

  if ! git -C "$REPO" fetch --quiet origin 2>/dev/null; then
    log "FAILED to fetch — deploy key or network"
  else
    # --ff-only on purpose: this clone is read-only to Marshal and must never
    # acquire a merge commit. A divergence is a human's problem, not ours.
    if git -C "$REPO" merge --ff-only "$TARGET" >/dev/null 2>&1; then
      after=$(git -C "$REPO" rev-parse HEAD)
      if [ "$before" != "$after" ]; then
        changed=$(git -C "$REPO" diff --name-only "$before" "$after" -- $CONFIG 2>/dev/null)
        log "fast-forwarded $(short "$before") -> $(short "$after")"
        if [ -n "$changed" ]; then
          # Marshal loaded these at startup and will not notice on its own.
          # Restarting needs the docker socket, which is root-equivalent on the
          # host and deliberately not mounted by default — so say loudly what
          # has to happen instead of failing quietly.
          if command -v docker >/dev/null 2>&1 && docker restart "$MARSHAL" >/dev/null 2>&1; then
            log "config changed ($(echo $changed | tr '\n' ' ')) — restarted $MARSHAL"
          else
            log "ACTION NEEDED — config changed ($(echo $changed | tr '\n' ' ')); run 'docker compose restart marshal', it is still on the old config"
          fi
        fi
      fi
    else
      log "NOT fast-forwardable — the clone has diverged from $TARGET, leaving it alone"
    fi
  fi

  rem=$(( INTERVAL - ( $(date +%s) - started ) ))
  [ "$rem" -gt 0 ] || rem=1
  sleep "$rem"
done
