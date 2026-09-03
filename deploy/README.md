# Deploying Workman + Marshal behind a Cloudflare tunnel

One always-on machine, two public hostnames, one tunnel. The board reaches
Marshal through the public hostname (webhooks), GitHub reaches the board the
same way (receipts and merge hooks), and Discord is a plain outgoing webhook.

```
GitHub Actions ──(receipts, close)──▶ https://board.<domain>  ──▶ workman:3456
Workman webhooks ──(task.*, receipt)──▶ https://marshal.<domain> ──▶ marshal:8090 ──▶ Discord
agents (veans / marshal mcp) ────────▶ https://board.<domain>
```

## 1. Cloudflare

1. Zero Trust → Networks → Tunnels → *Create a tunnel* (Cloudflared). Copy the
   token into `CLOUDFLARE_TUNNEL_TOKEN`.
2. Public hostnames on that tunnel:
   - `board.<domain>` → `http://workman:3456`
   - `marshal.<domain>` → `http://marshal:8090`

   Service names resolve inside the compose network, so no ports are published
   on the host.

## 2. Configure

```bash
cd deploy
cp .env.example .env
$EDITOR .env          # hostnames, tunnel token, secrets, REPO_PATH
```

`REPO_PATH` is a clone of the coordinated repository (CapYard) on this
machine. Marshal reads specs and git history from it and fetches
`MARSHAL_SPEC_REV` on every poll; it never writes to it. Give the clone a
read-only deploy key if the repository is private.

When the clone's remote is SSH, put that key on the `marshal-ssh` volume as
`/home/marshal/.ssh/id_ed25519` with a `known_hosts` beside it. The image
carries `openssh-client` and `GIT_SSH_COMMAND` pins the key with
`IdentitiesOnly=yes`, so git never offers another identity and never stops to
ask — `GIT_TERMINAL_PROMPT=0` would fail the fetch rather than hang.

## 3. Start the board

```bash
docker compose up -d workman db cloudflared
docker compose exec workman /app/vikunja/vikunja user create -u you -e you@example.com -p '...'
```

Open `https://board.<domain>`, sign in, create the project. Registration is
off by default (`WORKMAN_ENABLE_REGISTRATION`).

## 4. Wire the repository

In a checkout of the coordinated repository, once:

```bash
veans init --server https://board.<domain>        # bot, buckets, .veans.yml, hooks
marshal init --app-root captain-yard-web \
  --prd _bmad-output/prds/prd-captain-yard-networks-2026-09-01/prd.md \
  --spine _bmad-output/architecture/architecture-captain-yard-networks-2026-09-01/ARCHITECTURE-SPINE.md \
  --epics _bmad-output/epics.md \
  --public-url https://marshal.<domain> \
  --ports 3100-3110 --database mongodb://127.0.0.1:27101/cy1 --database mongodb://127.0.0.1:27102/cy2
marshal setup --token <a session JWT, see below>
```

**`--token` must be a session JWT, not an API token.** The board's *Settings →
API tokens* page mints `tk_…` tokens, and `setup` rejects them: it calls
`GET /user/bots`, and Vikunja does not accept API tokens on `/user/*` routes
whatever scopes are ticked. The error is a flat `401 ... missing, malformed,
expired or otherwise invalid token provided`, which reads like a bad credential
rather than the wrong kind of one. Use a login JWT (`eyJ…`) instead:

```bash
curl -s -X POST https://board.<domain>/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"you","password":"..."}' | jq -r .token
```

Write it to a file with `umask 077` and pass it as `MARSHAL_SETUP_TOKEN` rather
than on the command line. Session JWTs are short-lived, so mint it immediately
before the run.

`marshal setup` creates `bot-marshal-<repo>` and `bot-ci-<repo>`, shares the
project with them, mints their tokens, sets the project's receipt bot and the
kanban view's claim bucket, and registers the signed webhook to
`https://marshal.<domain>/webhooks/workman`. It prints the CI token once:

- put it in the CapYard repository as the GitHub secret `WORKMAN_TOKEN`;
- copy the Marshal token (credential store, account `bot-marshal-<repo>`) into
  `.env` as `MARSHAL_TOKEN`;
- copy `.marshal/webhook-secret` into `.env` as `MARSHAL_WEBHOOK_SECRET`.

### Rotating

`marshal setup --rotate --skip-webhook` mints fresh bot tokens, and prints only
the **CI** token. Marshal's own token is not shown: it goes into the veans
credential store, and since the container has no `dbus-launch` the keyring
write fails and it falls back to
`/home/marshal/.config/veans/credentials.yml` — which is why `.config` is a
volume. A fresh `marshal-config` volume comes up root-owned, because that
directory is not in the image; `chown marshal:marshal /home/marshal/.config`
before `veans login` writes to it.

Minting does not revoke the previous token. A running `marshal serve` keeps
polling on the value already in `.env`, so a rotation needs no restart and
`MARSHAL_TOKEN` does not have to be replaced. If Marshal's token is ever
genuinely lost, `veans login` mints a new one for the bot user.

Commit `.veans.yml` and `.marshal.yml`; `.marshal/` is gitignored.

## 5. Start Marshal

```bash
docker compose up -d marshal
docker compose logs -f marshal      # "listening on 0.0.0.0:8090", then one tick line per poll
curl https://marshal.<domain>/healthz
```

## 6. Discord

Server settings → Integrations → Webhooks → *New Webhook* on the channel;
copy the URL into `DISCORD_WEBHOOK_URL` and restart Marshal. Then:

```bash
docker compose exec marshal marshal notify test
```

Cards posted: claimed, files released, done, created, deleted, gate receipts
(green/red with every gate's duration, docs:api state, merged flag, run
link), pull request linked, and Marshal's own findings: spec drift, broken
reference, pasted spec text, stale claim, out-of-scope change, board health.

## 7. GitHub

Copy `veans/examples/capyard-gates.yml` into the repository's
`.github/workflows/` (and `pr-hooks.yml` for the scope check on pull
requests). With the receipt bot set, a task closes only when the merge job's
receipt is green; the `Gates` workflow posts a red receipt otherwise and the
task stays in review.

## Updating

Both services build from this checkout, so an update is a pull and a rebuild
in the same directory:

```bash
cd <this checkout>
git pull origin main

cd deploy
docker compose exec db pg_dump -U workman workman > backup-$(date +%F).sql
docker compose up -d --build
docker compose logs -f workman        # migrations apply during startup
```

**`--build` is not optional.** Each service names an `image:` as well as a
`build:`, so once an image exists locally a plain `docker compose up -d`
reuses it: the containers restart, everything looks healthy, and none of the
new code is running.

**Take the dump first.** Migrations apply themselves when the API starts
(`pkg/initialize`) and they do not roll back, so the backup has to predate
the new container.

`WORKMAN_IMAGE` and `MARSHAL_IMAGE` exist for the day these are published to
a registry. Nothing publishes them today — the upstream release pipeline is
deliberately unwired and pushed to its own namespace — so the default tags do
not resolve and `docker compose pull` fails. Build locally.

Marshal is built from `../veans`, meaning the copy inside *this* repository.
If veans is developed in its own repository, bring the change back here
before rebuilding, or the deployment silently keeps running the vendored
copy.

State lives in three volumes: `workman-db` (Postgres), `workman-files`
(attachments) and `marshal-state` (`.marshal/` — ledger, pool registry,
dedupe flags). Marshal holds nothing else, so it can be recreated freely.
