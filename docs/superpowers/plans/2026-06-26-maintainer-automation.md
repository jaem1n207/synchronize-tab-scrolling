# Maintainer Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PR label automation and conservative issue stale marking for `synchronize-tab-scrolling` without touching release, landing deploy, store stats, or semantic-release behavior.

**Architecture:** Add one label-only `pull_request_target` workflow, one `.github/labeler.yml`, and one scheduled stale workflow. Existing release/deploy workflows and `release.config.js` remain untouched because extension store release automation already uses secrets and semantic-release.

**Tech Stack:** GitHub Actions, actions/labeler pinned to `v6.1.0`, actions/stale pinned to `v10.3.0`, existing pnpm extension/landing workflows.

---

## File Structure

Create or modify these files inside `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling`.

- Create: `.github/workflows/labeler.yml`
  - Responsibility: Apply PR labels without checking out or executing PR code.
- Create: `.github/labeler.yml`
  - Responsibility: Define file and branch matching rules for extension, landing, i18n, release-risk, docs, e2e, and CI labels.
- Create: `.github/workflows/stale.yml`
  - Responsibility: Mark inactive issues stale without closing issues or mutating PRs automatically.
- Preserve: `.github/workflows/release.yml`
  - Responsibility: Existing semantic-release and store publishing flow; do not modify.
- Preserve: `.github/workflows/deploy-landing.yml`
  - Responsibility: Existing landing deployment; do not modify.
- Preserve: `.github/workflows/update-store-stats.yml`
  - Responsibility: Existing weekly store stats automation; do not modify.
- Preserve: `release.config.js`
  - Responsibility: Existing semantic-release configuration; do not modify.

## Task 1: Add PR Labeler

**Files:**

- Create: `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/workflows/labeler.yml`
- Create: `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/labeler.yml`

- [ ] **Step 1: Add the labeler workflow**

Create `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/workflows/labeler.yml`:

```yaml
name: Label PRs

on:
  pull_request_target:
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  label:
    name: Label
    runs-on: ubuntu-latest
    steps:
      - name: Apply labels
        uses: actions/labeler@f27b608878404679385c85cfa523b85ccb86e213 # v6.1.0
        with:
          sync-labels: true
```

Expected: The workflow never checks out code and cannot execute pull request changes. `issues: write` allows `actions/labeler` to create missing configured labels on first run.

- [ ] **Step 2: Add the labeler config**

Create `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/labeler.yml`:

```yaml
'area:ci':
  - changed-files:
      - any-glob-to-any-file:
          - '.github/**'

'area:docs':
  - changed-files:
      - any-glob-to-any-file:
          - 'docs/**'
          - 'README.md'
          - 'README-ko_kr.md'
          - 'AGENTS.md'

'area:extension':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/background/**'
          - 'src/contentScripts/**'
          - 'src/popup/**'
          - 'src/shared/**'
          - 'src/manifest.ts'
          - 'extension/**'
          - 'vite.config.background.mts'
          - 'vite.config.content.mts'
          - 'vite.config.ts'

'area:landing':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/landing/**'
          - 'vite.config.landing.mts'
          - 'scripts/prerender-landing.ts'
          - 'scripts/fetch-store-stats.ts'
          - 'e2e/landing/**'

'area:i18n':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/**/i18n/**'
          - 'src/**/translations/**'
          - 'src/**/locales/**'
          - 'src/landing/lib/translations/**'
          - 'scripts/validate-i18n.ts'

'area:e2e':
  - changed-files:
      - any-glob-to-any-file:
          - 'e2e/**'
          - 'playwright.config*.ts'

'area:release':
  - changed-files:
      - any-glob-to-any-file:
          - 'release.config.js'
          - 'scripts/publish-edge.mjs'
          - 'docs/guides/store-deployment.md'
          - '.github/workflows/release.yml'

'area:package':
  - changed-files:
      - any-glob-to-any-file:
          - 'package.json'
          - 'pnpm-lock.yaml'
          - 'pnpm-workspace.yaml'
          - 'tsconfig.json'

'area:store-stats':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/landing/public/store-stats.json'
          - 'scripts/fetch-store-stats.ts'
          - '.github/workflows/update-store-stats.yml'

'area:security':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/**/permissions**'
          - 'src/**/excluded**'
          - 'src/manifest.ts'

'area:browser-compat':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/shared/lib/platform*'
          - 'src/**/browser**'
          - 'src/**/firefox**'
          - 'src/**/chrome**'
          - 'src/**/edge**'

'area:release-risk':
  - changed-files:
      - any-glob-to-any-file:
          - 'release.config.js'
          - '.github/workflows/release.yml'
          - 'scripts/publish-edge.mjs'
          - 'package.json'
          - 'pnpm-lock.yaml'
          - 'src/manifest.ts'

'area:landing-release-risk':
  - changed-files:
      - any-glob-to-any-file:
          - 'src/landing/**'
          - 'vite.config.landing.mts'
          - '.github/workflows/deploy-landing.yml'

'area:design-spec':
  - changed-files:
      - any-glob-to-any-file:
          - 'docs/superpowers/specs/**'
          - 'docs/superpowers/plans/**'

'type:feature':
  - head-branch:
      - '^feat[/-]'
      - '^feature[/-]'

'type:fix':
  - head-branch:
      - '^fix[/-]'
      - '^hotfix[/-]'

'type:docs':
  - head-branch:
      - '^docs[/-]'

'type:ci':
  - head-branch:
      - '^ci[/-]'

'target:main':
  - base-branch:
      - '^main$'
```

Expected: The config distinguishes extension runtime changes from landing, release-risk, browser compatibility, i18n, docs, and CI changes.

- [ ] **Step 3: Validate labeler files**

Run:

```bash
actionlint .github/workflows/labeler.yml
ruby -e 'require "yaml"; YAML.load_file(".github/labeler.yml"); puts "labeler config ok"'
```

Expected: `actionlint` prints no output, and Ruby prints `labeler config ok`.

- [ ] **Step 4: Confirm sensitive workflows are unchanged**

Run:

```bash
git diff -- .github/workflows/release.yml .github/workflows/deploy-landing.yml .github/workflows/update-store-stats.yml release.config.js
```

Expected: No output.

- [ ] **Step 5: Commit labeler automation**

Run:

```bash
git add .github/workflows/labeler.yml .github/labeler.yml docs/superpowers/plans/2026-06-26-maintainer-automation.md
git commit -m "ci: add pull request labeler"
```

Expected: One commit contains labeler files and this plan file; release/deploy files remain untouched.

## Task 2: Add Conservative Issue Stale Marking

**Files:**

- Create: `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/workflows/stale.yml`

- [ ] **Step 1: Add the stale workflow**

Create `/Users/jaemin/programming/projects/active/synchronize-tab-scrolling/.github/workflows/stale.yml`:

```yaml
name: Mark Stale Issues

on:
  schedule:
    - cron: '23 3 * * 1'
  workflow_dispatch:

permissions:
  issues: write

jobs:
  stale:
    name: Mark stale issues
    runs-on: ubuntu-latest
    steps:
      - name: Mark inactive issues
        uses: actions/stale@eb5cf3af3ac0a1aa4c9c45633dd1ae542a27a899 # v10.3.0
        with:
          stale-issue-label: 'status:stale'
          days-before-issue-stale: 90
          days-before-issue-close: -1
          days-before-pr-stale: -1
          days-before-pr-close: -1
          remove-pr-stale-when-updated: false
          stale-issue-message: >-
            This issue has had no activity for 90 days, so it is marked as stale.
            Comment or remove `status:stale` if it is still relevant.
          exempt-issue-labels: >-
            security,pinned,in-progress,needs-decision,store-review,browser-compatibility
          operations-per-run: 50
```

Expected: The workflow marks inactive issues stale after 90 days, never closes issues, and never marks, closes, or removes stale labels from PRs.

- [ ] **Step 2: Validate stale workflow syntax**

Run:

```bash
actionlint .github/workflows/stale.yml
```

Expected: No output and exit code `0`.

- [ ] **Step 3: Confirm semantic-release files are unchanged**

Run:

```bash
git diff -- .github/workflows/release.yml release.config.js CHANGELOG.md package.json
```

Expected: No output.

- [ ] **Step 4: Commit stale automation**

Run:

```bash
git add .github/workflows/stale.yml
git commit -m "ci: add stale issue marking"
```

Expected: One commit contains only the stale workflow.

## Self-Review Checklist

- [ ] Release, landing deploy, store stats, and semantic-release files remain unchanged.
- [ ] Labeler uses `pull_request_target` without checkout or code execution.
- [ ] Stale marks issues only and never auto-closes issues or mutates PRs.
- [ ] Release Drafter and PR checklist comments are not included in this first implementation.
- [ ] All third-party actions are pinned to full commit SHA.
