#!/bin/sh
# Watches go-vikunja/vikunja for commits this fork has not taken, and says so
# once per change rather than once per check.
#
# The fork shares history with upstream, so the count is a real answer:
# `git rev-list origin/main..upstream/main`. Workman does not share that
# history — its root commit is absent upstream — which is why this runs
# against the vikunja-pm checkout and not the deployment one.
#
# Reports to Discord when a webhook is configured, and to the log always. A
# silent watcher that has been failing for a fortnight is the failure this is
# shaped to avoid, so every pass logs its result either way.
set -u

REPO="${WATCH_REPO:-/repo}"
INTERVAL="${WATCH_INTERVAL:-21600}"     # six hours
STATE="${WATCH_STATE:-/state/last-seen}"
HOOK="${DISCORD_WEBHOOK_URL:-}"

log() { printf '%s upstream-watch: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Anything whose subject suggests it is not merely a version bump. Deliberately
# broad: a false positive costs a glance, a missed advisory costs more. Upstream
# ships security fixes with messages that say only "update module X" — that is
# exactly how four x/crypto advisories reached this fork unnoticed.
notable() {
	printf '%s' "$1" | grep -qiE 'secur|vulnerab|cve-|auth|token|permission|leak|inject|xss|csrf|migration|crypto|password|session'
}

post() {
	[ -n "$HOOK" ] || return 0
	# Escape for JSON by hand: no jq in this image, and the payload is ours.
	body=$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')
	wget -q -O - --header='Content-Type: application/json' \
		--post-data="{\"content\":\"${body}\"}" "$HOOK" >/dev/null 2>&1 \
		&& log "posted to Discord" || log "FAILED to post to Discord"
}

log "started — checking $REPO against upstream every ${INTERVAL}s"
[ -n "$HOOK" ] || log "no DISCORD_WEBHOOK_URL — reporting to this log only"

while :; do
	started=$(date +%s)

	if ! git -C "$REPO" fetch --quiet upstream 2>/dev/null; then
		log "FAILED to fetch upstream"
	else
		behind=$(git -C "$REPO" rev-list --count origin/main..upstream/main 2>/dev/null || echo "")
		head=$(git -C "$REPO" rev-parse --short upstream/main 2>/dev/null || echo "")
		seen=$(cat "$STATE" 2>/dev/null || echo "")

		if [ -z "$behind" ] || [ -z "$head" ]; then
			log "FAILED to read the range — is the upstream remote configured?"
		elif [ "$head" = "$seen" ]; then
			log "no change (still $behind behind, upstream at $head)"
		else
			log "upstream moved to $head — $behind commit(s) ahead of the fork"
			subjects=$(git -C "$REPO" log --no-merges --format='%h %s' origin/main..upstream/main 2>/dev/null | head -20)

			flagged=""
			# Read line by line so a subject with spaces stays one entry.
			printf '%s\n' "$subjects" | while IFS= read -r line; do
				[ -n "$line" ] && notable "$line" && printf '  %s\n' "$line"
			done > /tmp/flagged
			flagged=$(cat /tmp/flagged 2>/dev/null)

			msg="**Upstream Vikunja moved.** The fork is **${behind}** commit(s) behind (\`${head}\`)."
			if [ -n "$flagged" ]; then
				msg="${msg}

Worth a look — these mention security, auth, migrations or crypto:
\`\`\`
${flagged}\`\`\`"
			else
				msg="${msg} Nothing in the subjects looks security-shaped, but subjects lie: upstream ships advisories as \"update module X\"."
			fi
			msg="${msg}
Review with: cd ~/srv/vikunja-pm && git log --oneline origin/main..upstream/main"

			post "$msg"
			printf '%s' "$head" > "$STATE" 2>/dev/null || log "could not write $STATE"
		fi
	fi

	rem=$(( INTERVAL - ( $(date +%s) - started ) ))
	[ "$rem" -gt 0 ] || rem=60
	sleep "$rem"
done
