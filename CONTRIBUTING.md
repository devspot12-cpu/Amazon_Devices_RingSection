# Contributing

How changes get into this repository.

## The short version

1. Branch off `main`, named `dev/<something>`.
3. Push the branch and open a pull request **into `main`**.
4. CI must pass. One approval other than author is required.

**Never push directly to `main`.** It is blocked by a repository ruleset, and the
CI guard fails any PR that does not follow the convention below.

## Branch naming

Branches must start with `dev/`:

Good names:

```
dev/add-device-list
dev/fix-token-refresh
dev/docs-update
```

### Why not `main/dev/...`
GitHub reject it:

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

## Required checks and approvals

- **CI must be green.** The merge button stays disabled while any check is red.
- **One approving review is required.** The author cannot approve their own PR.
- **Conversations must be resolved** before merging.

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | PRs into `main`; pushes to non-main branches | Guard (branch convention) + Node type-check and build |

The guard job runs on pull requests only. It lives in `ci.yml` on purpose: one red check on
the PR blocks the merge button.
