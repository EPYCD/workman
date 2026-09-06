# Setting this up for a team

Three kinds of identity exist here, and most of the confusion comes from
collapsing them. Keep them apart and the rest follows.

| Identity | What it is | Example |
|---|---|---|
| **A person** | Reviews and lands work. Has a GitHub account and a board account. | `subinsayzz` |
| **A person's agent** | Writes code and opens pull requests. Has a GitHub machine account and a board bot. | `capyard-agent-subin` / `bot-capyard` |
| **The services** | Marshal and CI. Board bots only; they never push code. | `bot-marshal-capyard`, `bot-ci-capyard` |

The rule the whole setup rests on: **an agent must never share a GitHub account
with the person who reviews its work.** GitHub does not let anyone approve their
own pull request, so if an agent opens a PR as you, you cannot approve it — and
no label, comment or workflow can tell the two of you apart either. Everything
below assumes that separation.

---

## Part 1 — Repository, once

Admin on the repository. Do these **in order**: step 3 blocks merging until
step 2 exists, and step 2 is unsafe without step 1.

### 1. Machine accounts for the agents

One GitHub account per person's agent, mirroring the board bots that already
exist (`bot-capyard`, `bot-akshat`). A single shared bot works, but then git
history cannot say whose agent wrote what — which is the problem you are
solving, half-solved.

For each:

1. Create the account (`capyard-agent-<name>`).
2. Invite it to the repository with **Write** access — not Maintain, not Admin.
   It must not be able to change protection rules or land its own work.
3. Sign in as it once and mint a **fine-grained personal access token**, scoped
   to this repository, with **Contents: read and write** and
   **Pull requests: read and write**. Nothing else. Not `admin`, not `workflow`.

### 2. Branch protection on `main`

*Settings → Branches → Add branch protection rule*, pattern `main`:

- ☑ **Require a pull request before merging** → **Require approvals: 1**
- ☑ **Require status checks to pass before merging**, selecting:
  `api-lint`, `veans-lint`, `veans-test`, `test-veans-e2e`,
  `test-api (postgres, web)`, `check-frontend-client`, `hook-scripts`
- ☑ **Require branches to be up to date before merging**
- ☑ **Require review from Code Owners** (`.github/CODEOWNERS` names the
  reviewers, so the request is raised automatically rather than waiting to be
  noticed)

The approval requirement is what makes landing a human decision. "Up to date"
is not bureaucracy: two pull requests can each be green and still break `main`
together — one renames a field, the other adds a caller of the old name, and
neither branch ever saw the other. CI can only test what it can see.

### 3. Auto-merge

*Settings → General → Pull Requests → ☑ **Allow auto-merge***

**Last.** Auto-merge waits for *required* checks; with no branch protection
there are none, so it lands a pull request almost at once — automatic-looking
and unsafe.

---

## Part 2 — Each person, once

1. **GitHub**: invite them to the repository with **Write**. Add them to
   `.github/CODEOWNERS` if they should be able to approve.
2. **Board account**: registration is off by default, so an admin creates it:
   ```bash
   docker compose exec workman /app/vikunja/vikunja user create \
     -u <name> -e <email> -p '<password>'
   ```
3. **Their machine**: clone the repository, then
   ```bash
   veans login --server https://board.<domain>
   ```
   which mints their agent's board bot and writes `.veans.yml`.

## Part 3 — Each agent, once

On the machine the agent runs on, in the checkout it works in:

```bash
scripts/agent-identity.sh capyard-agent-<name> ~/path/to/checkout
```

It asks for that account's PAT without echoing it, writes it to
`~/.config/capyard-agent/credentials` at mode 0600, and points the checkout's
git config at it. The token deliberately does **not** go into the remote URL:
`.git/config` is readable by anything that can read the repository, and
`git remote -v` prints it on any screen share.

The config is repository-local, never `--global` — the same machine usually
also holds the person's own checkout, and that one stays theirs.

The script refuses if the account you name is the one `gh` is logged in as,
because that is the exact mistake this whole arrangement exists to prevent.

### Verify it before trusting it

Configuration is not proof. Push a real branch, open a pull request, then:

```bash
gh pr list --repo <owner>/<repo> --limit 1 --json author --jq '.[].author.login'
```

If that prints a **person's** name, the agent is still pushing as them and
nothing below is enforcement — only convention. Everything else can be
correct and this one line still wrong.

## Who merges

**Merging is one person's job, and here that person is the repository owner.**
Not whoever is free, and not the other developer as a favour — one account
lands work, so there is one answer to "who let this in" and one person whose
approval the branch protection is actually waiting for.

That is why every agent needs its own machine account. If an agent pushes as
the person who reviews, GitHub will not let that person approve it, and the
only way out is to have somebody else approve instead — which quietly moves
the merge decision to whoever happens to be around. Separate accounts keep it
where it belongs.

`.github/CODEOWNERS` names the reviewer, so the request is raised on every
pull request automatically rather than waiting to be noticed.
