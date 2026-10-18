# Contributing

How changes get into this repository.

## The short version

1. Branch off `main`, named `dev/<something>`.
2. Commit your work.
3. Push the branch and open a pull request **into `main`**.
4. CI must pass. One approval is required.
5. Someone (not the author, if the author is not an admin) approves and merges.

**Never push directly to `main`.** It is blocked by a repository ruleset, and the
CI guard fails any PR that does not follow the convention below.

## Branch naming

Branches must start with `dev/`:

```bash
git checkout main
git pull --ff-only
git checkout -b dev/add-device-list
```

Good names:

```
dev/add-device-list
dev/fix-token-refresh
dev/docs-update
```

### Why not `main/dev/...`

The convention `main/dev/<name>` is **impossible** while the trunk branch is
called `main`. Git stores branches as files, so `refs/heads/main` is a file and
`refs/heads/main/dev/x` would need it to be a directory. Both local git and
GitHub reject it:

```
$ git checkout -b main/dev/probe
fatal: cannot lock ref 'refs/heads/main/dev/probe': 'refs/heads/main' exists;
cannot create 'refs/heads/main/dev/probe'

$ git push origin HEAD:refs/heads/main/dev/probe
! [remote rejected] ... (cannot lock ref ...)
```

`dev/<name>` is the working equivalent. If you ever want `main/dev/<name>`
literally, the trunk branch has to be renamed first — which changes every clone,
so it is not worth it.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) style is used, so
the history reads clearly:

```
feat: add device discovery endpoint
fix: handle expired Playground token
docs: explain the branch convention
chore: bump dependencies
ci: cache Docker layers
```

## Pull requests

Open a PR with `main` as the base. The `guard` job checks three things:

| Check | Requirement |
|---|---|
| Target | Base branch must be `main` |
| Name | Head branch must match `dev/*` |
| History | No merge commits — rebase instead |

To fix merge commits:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Use `--force-with-lease`, never a bare `--force`: it refuses to overwrite
someone else's newer work.

## Required checks and approvals

- **CI must be green.** The merge button stays disabled while any check is red.
- **One approving review is required.** The author cannot approve their own PR.
- **Conversations must be resolved** before merging.

Because this repo has a single collaborator (the owner), an admin can merge with
approval satisfied by the ruleset's administrator bypass. If you add teammates,
their PRs will need a genuine second-person approval.

## Docker

The image is built and pushed **only from `main`**, by the `Release` workflow —
i.e. after a PR is merged. PRs run a build check without pushing, so a broken
`Dockerfile` fails the PR rather than the release.

Required repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | A Docker Hub **access token**, not your password |

Create the token at https://hub.docker.com/settings/security. Use an access
token rather than the account password: it can be scoped and revoked
independently.

Image tags produced:

| Tag | Meaning |
|---|---|
| `latest` | The current tip of `main` |
| `sha-<short>` | That exact commit — use this for reproducible deploys |

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | PRs into `main`; pushes to non-main branches | Guard, tests, Docker build check (no push) |
| `.github/workflows/release.yml` | Pushes to `main`; manual dispatch | Builds and pushes the image to Docker Hub |

The guard lives in `ci.yml` on purpose: one red check on the PR blocks the merge
button. Splitting it into its own workflow would still work, but keeping the
builds and the guard together means a single status to watch.
