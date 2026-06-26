# Maintainer Automation Design

Date: 2026-06-26

## Shared Baseline

This project is part of a four-repository maintainer automation rollout covering:

- `synchronize-tab-scrolling`
- `truck-harvester`
- `eslint-config`
- `bendd`

The rollout uses a common maintainer baseline with repository-specific exceptions. The baseline automates repetitive triage without replacing the repository's existing release, build, or deployment contract.

Common rules:

- Use a consistent label taxonomy: `area:*`, `type:*`, `scope:*`, and `status:*`.
- Add `actions/labeler` for PR triage based on file paths and branch names.
- Run label/comment workflows with `pull_request_target` only when they do not checkout or execute untrusted PR code.
- Apply stale handling conservatively, starting with issues and avoiding PR mutation unless explicitly enabled later.
- Use `peter-evans/create-or-update-comment` only when a stable marker prevents duplicate bot comments.
- Prefer repository-native validation scripts over broad Super-Linter defaults.
- Preserve existing release/deploy workflows unless the repository-specific section explicitly says otherwise.

## Latest Action Versions

The latest tags below were verified from live GitHub tag refs on 2026-06-26 KST. Implementation should use these versions or newer if re-verified, and should pin third-party actions to the full tag SHA rather than floating version tags.

| Action                                 | Latest tag verified on 2026-06-26 KST | Tag SHA to pin during implementation       |
| -------------------------------------- | ------------------------------------- | ------------------------------------------ |
| `actions/labeler`                      | `v6.1.0`                              | `f27b608878404679385c85cfa523b85ccb86e213` |
| `actions/stale`                        | `v10.3.0`                             | `eb5cf3af3ac0a1aa4c9c45633dd1ae542a27a899` |
| `release-drafter/release-drafter`      | `v7.5.1`                              | `3832cfb52f98ab0f0e5b62aecf94909e334d4da6` |
| `peter-evans/create-or-update-comment` | `v5.0.0`                              | `e8674b075228eee787fea43ef493e45ece1004c9` |
| `actions/checkout`                     | `v7.0.0`                              | `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` |
| `actions/setup-node`                   | `v6.4.0`                              | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `pnpm/action-setup`                    | `v6.0.9`                              | `008330803749db0355799c700092d9a85fd074e9` |
| `oven-sh/setup-bun`                    | `v2.2.0`                              | `0c5077e51419868618aeaa5fe8019c62421857d6` |

## Security Requirements

- Every workflow must declare minimal `permissions`.
- `pull_request_target` workflows may label or comment, but must not checkout, build, test, or run code from the pull request branch.
- Third-party actions must be pinned to full commit SHA in the implementation plan.
- Secret-bearing release or deploy workflows are out of scope unless the repository already has them and this design explicitly preserves them.

## Error Handling

- Labeler failures caused by fork permissions should be handled by the label-only `pull_request_target` design with no checkout or shell execution. Include `issues: write` only so `actions/labeler` can create missing configured labels on first run.
- Stale automation must exempt `security`, `pinned`, `in-progress`, `needs-decision`, and release-critical work.
- Comment automation must update an existing bot comment by marker; duplicate comments are considered a design failure.
- If a workflow begins producing noisy labels or stale events, the rollback is to disable the single new workflow file rather than touching build or release jobs.

## Repository Context

`synchronize-tab-scrolling` is an actively shipped browser extension with Chrome, Edge, and Firefox distribution. It already has release, landing deploy, and store stats workflows. Release is handled by `semantic-release`, which writes changelog/release assets and publishes store packages. Landing commits use the `(landing)` scope to avoid triggering extension store releases.

Because release automation is already sensitive and secret-bearing, this rollout must avoid changing release/deploy behavior.

## Proposed Automation

Add Labeler:

- `area:extension` for extension runtime, popup, background, content scripts, manifest, and shared extension logic.
- `area:landing` for `src/landing/**`, `vite.config.landing.mts`, landing e2e tests, and landing docs.
- `area:i18n` for extension or landing translation files.
- `area:e2e` for Playwright tests.
- `area:release` for `release.config.js`, packaging scripts, and store deployment docs.
- `area:ci` for `.github/**`.
- `area:docs` for `docs/**` and README changes.

Add conservative Stale:

- Issue-only stale behavior with exemptions for `security`, `pinned`, `in-progress`, `needs-decision`, `store-review`, and browser compatibility issues.
- Do not mutate or auto-close PRs.

Optional PR checklist comment:

- Use `peter-evans/create-or-update-comment@v5.0.0`, pinned to `e8674b075228eee787fea43ef493e45ece1004c9` during implementation, only for PRs that touch release, store, or landing deployment paths.
- Comment should remind maintainers which manual checks are relevant, such as landing-only scope safety, store release risk, or browser-specific verification.

## Explicit Non-Goals

- Do not add Release Drafter. `semantic-release` is already the source of truth for changelog and GitHub releases.
- Do not modify `release.yml`, `deploy-landing.yml`, `update-store-stats.yml`, or `release.config.js` in this phase.
- Do not add Super-Linter; existing extension and landing checks are more specific.

## Testing Plan

- Validate Labeler and Stale YAML/config files without triggering release workflows.
- Confirm added workflows do not request secret access.
- Confirm `pull_request_target` workflows do not checkout or execute PR code.
- Confirm landing path labels do not interfere with the existing `(landing)` commit-scope release guard.
