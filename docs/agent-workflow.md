# Running your team's agents on a Workman board

Workman is built for boards where the work is done by coding agents and the
humans plan, review and merge. This is the shortest path from an empty
project to that loop. The moving parts are the board itself, the `veans` CLI
each agent talks through, and the GitHub merge hook.

## 1. One project, one kanban view

Create a project with a kanban view whose buckets are `Todo`, `In Progress`,
`In Review`, `Done` and `Scrapped`; `veans init` offers to create them. The
`Todo` bucket is the queue: everything the server's readiness check looks at
lives there.

## 2. One bot per teammate

Each teammate runs `veans init` in their checkout. It creates a bot user
owned by that person, shares the project with it, mints an API token with
exactly the permissions the server offers, writes `.veans.yml` and installs a
`veans prime` hook so their agent starts every session with the board
instructions. Bots set up before an upgrade run `veans login` to pick up new
permissions. Add `--install-git-hook` (or run `veans hooks install` later) and
git refuses commits that stray outside the agent's tasks before they exist.

The board never shows a bare bot. The Leases panel, the task's scope section
and the kanban's "By assignee" lanes all say `bot-alice · for Alice`, and
`veans agents` lists the same: who is working, which human is behind each
bot, and how many tasks and leases each holds.

## 3. The owner's agent decomposes the PRD

Tasks carry a **scope**: the files they own, the files they touch and the
endpoints they change. Write the whole breakdown as one plan and let the
server lint it before anything exists:

```
veans plan --dry-run plan.json   # duplicate/unknown keys, cycles, overlapping paths with no order
veans plan plan.json             # tasks + relations + scopes in one transaction
```

`plan.json` is a `tasks` array with plan-local keys, `parent_key`,
`blocked_by`, `follows` and a `scope` per task (`veans prime` shows the
shape). To extend a board that already has work on it, `veans plan --export`
prints the open tasks in the same shape keyed by identifier, and a new plan
may reference those keys without redefining them. Single tasks still work
one at a time:

```
veans create "atomic task claim" \
  --paths-owned pkg/models/task_claim.go --paths-owned pkg/routes/api/v2/task_claim.go \
  --paths-affected pkg/models/tasks.go \
  --endpoint "POST /api/v2/tasks/{id}/claim" \
  --scope-notes "<p>No frontend changes.</p>"
veans create "board badges" --paths-owned frontend/src/components/tasks/** --blocked-by PROJ-12
```

Ordering comes from relations: `--blocked-by` for hard prerequisites,
`follows`/`precedes` for sequence, `--parent` for epics. A parent with open
subtasks is not claimable; with `service.autocompleteparenttasks: true` it
closes itself when the last subtask lands.

Multi-repo projects prefix paths with the repository (`api:pkg/**`,
`web:src/**`), or set `repository: api` in each checkout's `.veans.yml` and
let veans do it.

## 4. Agents pick work without stepping on each other

```
veans ready                  # every queued task, with why it is not ready
veans list --ready           # only the claimable ones, in queue order
veans list --ready --first   # the top of the queue
veans claim PROJ-12          # atomic: assign, move to In Progress, lease paths_owned
```

The queue is the Todo column's drag order: the owner drags cards up to make
agents pick them first, and each `READY · n` badge shows the rank. The
**By assignee** toggle regroups every column by who holds the task, with the
lease count per lane — the "who is doing what" view.

The claim is a single transaction. It is refused with `CONFLICT` when someone
else holds the task, when a blocker is open, or when one of the task's owned
paths overlaps a lease held by another in-progress task. Two agents racing
for the same task get exactly one winner. `veans leases` shows who holds
## Landing a pull request

Agents raise pull requests. **A human lands them** — and once that human has
said so, it lands by itself, without anyone watching the test run.

That needs the agents to have their own GitHub identity, and this is the part
worth understanding before configuring anything: agents currently push as
`subinsayzz`, the same account that would review their work, and **GitHub does
not let anyone approve their own pull request**. While author and reviewer are
one account, nothing on GitHub's side can tell an agent apart from the person
reviewing it — not a required review, not a label, not a comment trigger. A
workflow asking "did subinsayzz approve this?" cannot tell either.

So the identity comes first; the enforcement follows from it.

### 1. A machine account for the agents

Create a GitHub account for the fleet (`capyard-agent`, say), invite it to the
repository with **write** access, and mint a fine-grained personal access token
for it with `contents: write` and `pull requests: write`. Point the agents'
git credentials at that token rather than the human's.

This also fixes attribution. Every agent commit currently reads
`Subin Raj <subinrajs18@gmail.com>`, so git history cannot say which work was
an agent's and which was a person's — the board knows, and git does not.

### 2. Branch protection on `main`

*Settings → Branches → Add rule for `main`*

- **Require a pull request before merging**, with **1 approving review**
- **Require status checks to pass**: `api-lint`, `veans-lint`, `veans-test`,
  `test-veans-e2e`, `test-api (postgres, web)`, `check-frontend-client`,
  `hook-scripts`
- **Require branches to be up to date before merging**

The review requirement is what makes merging yours. The agent can open the PR
and even enable auto-merge; it cannot approve, so nothing lands until you do.

"Up to date" is not bureaucracy. Two PRs can each be green and still break
`main` together: one renames a field, the other adds a caller of the old name,
and neither branch ever saw the other. CI can only test what it can see, and a
stale branch was tested against a `main` that no longer exists. With this on,
GitHub updates the branch and re-runs the checks against what will actually
land.

### 3. Auto-merge

*Settings → General → Pull Requests → **Allow auto-merge***

Without required checks, auto-merge has no gate and lands a PR almost at
once — automatic-looking and unsafe. Configure step 2 first.

### What this gets you

The agent opens the PR, enables auto-merge, moves to the next ticket. You press
**Approve** when you are happy with it. GitHub then updates the branch if
`main` has moved, waits for the checks, merges, and the merge hook closes the
task from the `Refs:` trailer. One action from you, none of the waiting, and no
agent can land its own work.

### What is still deliberately manual

**Deploying.** Merging updates GitHub; the running containers keep the old
image until someone rebuilds. Nothing here deploys on merge, and the checkout
the stack builds from (`~/srv/workman`) does not update itself — pull it before
building, or you will ship the previous commit and wonder why the fix is not
live.

## Handing over, not waiting

An agent that opens a pull request is done with that ticket. It moves the task
to `in-review`, posts a summary, and takes the next one. It does not watch the
test run, and it does not wait for the merge.

The merge is a human decision, and GitHub makes it a one-click one: open the
PR, press **Enable auto-merge**, and it lands by itself when the checks go
green. The merge hook then reads the `Refs:` trailer and closes the task. The
`auto-merge` label is kept in sync with that state by
`.github/workflows/automerge-label.yml`, so the board and the PR list agree
about what is waiting on CI.

**Prerequisite:** *Settings → General → Pull Requests → Allow auto-merge* must
be ticked on the repository. It is off by default, and the button does not
appear until it is on.

Two things this does not remove:

- `in-review` does not release leases. An agent that moves on must pick a
  ticket whose files do not overlap the ones it just claimed, or it will be
  refused — correctly.
- A red PR comes back. An agent stacking four tickets behind four failing
  pull requests has not saved anyone time.

what; `veans release` gives paths back without changing status, and
`veans unclaim` hands the whole task back — assignee off, bucket back to Todo,
leases dropped, branch label removed — for work you are not going to do. Doing
only some of those leaves a ticket nobody can claim: readiness turns on the
assignee, not on the bucket. The board
shows the same answer: `READY`, `BLOCKED`, `PATH LEASED` badges on queued
cards, a lock count on in-progress ones, a **Leases** panel and a
**Ready only** toggle.

## 5. Finish through a pull request

Before opening the PR an agent runs `veans check`: every changed file must
be inside its tasks' `paths_owned` and outside every other task's lease, or
the command exits `CONFLICT` with the offending files. Agents then move the
task to `In Review`, post a summary comment and put `Refs: PROJ-12` in their
commits.

The `workman-merge-hook` GitHub Action does the rest (examples in
`veans/examples/`):

* `opened` links the PR on its tasks and parks them In Review.
* `check` runs the same scope check on the PR and fails it on strays or
  collisions, posting the verdict as a PR comment.
* `ci-failed` comments failed runs on the tasks.
* `close` marks the tasks done when the PR merges — which releases their
  leases — and comments the PR link. Never mark tasks done by hand.

## 5b. Crashed agents

Leases remember the holder's last activity. After `service.leasestaleafter`
(default 4h) without a claim, update, comment or `veans heartbeat`, the
board and `veans ready` flag the lease `stale`. It still blocks; a human
releases it from the Leases panel when nobody is working on the task.

A server cron checks every five minutes and notifies the bot's owner once
per stale lease (in-app and by mail, like any notification), so a crashed
agent does not go unnoticed. Set `service.leaseautoreleaseafter` (for
example `24h`; default off) and leases silent for that long are released
automatically: the task keeps its status, gets a comment saying why its
paths were freed, and the `task.leases.released` webhook fires.

## 6. Watch it

Webhooks fire `task.claimed` and `task.leases.released` alongside the usual
task events, so an orchestrator can wake idle agents instead of polling.

Without a webhook receiver, `veans watch` is the orchestrator loop: it
prints one JSON line per change — `task.ready`, `task.unready`,
`lease.stale` — and `--exec CMD` runs a command per event with the JSON on
stdin, which is enough to start an agent on a freshly ready task or ping a
human about a stale lease. `--once` fits a cron.

## 7. Marshal

For a board that coordinates a repository with a written spec, `marshal`
adds the checks a human otherwise re-runs by hand: references resolve from
the spec at read time and drift is announced, the In Progress column is the
ownership lock, "done" needs CI's receipt, CODEOWNERS files get a queue,
every worker gets a worktree with its own database and port, and Discord
gets a card per event. See `docs/marshal.md`.

## Reference

* `veans/README.md` — every command and flag.
* `GET /api/v2/projects/{id}/views/{view}/readiness` — the ready queue.
* `GET /api/v2/projects/{id}/leases`, `PUT /api/v2/tasks/{id}/scope` — the
  data behind the board.
* `GET /api/v2/projects/{id}/agents` — who is working, with bot owners.
* `service.leasestaleafter`, `service.leaseautoreleaseafter` — stale policy.
