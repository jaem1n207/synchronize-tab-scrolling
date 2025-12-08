# Catchup Command

Restore context by reading all changed files in the current git branch.

## Task

Quickly restore Claude Code's understanding of your current work by automatically reading all files that have changed in your current branch compared to the main branch. This eliminates the need to manually select files or explain context after running `/clear` or starting a new session.

## Process

### 1. Identify Current Branch and Changes

First, determine the current branch and list all files that have changed compared to the main branch:

```bash
# Get current branch name
git branch --show-current

# Get list of changed files (exclude deleted files)
git diff --name-only --diff-filter=d main...HEAD

# Get commit count for context
git rev-list --count main..HEAD
git rev-list --count HEAD..main
```

### 2. Filter and Categorize Files

Apply intelligent filtering to focus on relevant files:

**Skip these patterns:**

- `node_modules/`
- `dist/`, `build/`, `extension/`, `.output/`
- `*.lock`, `*.lockb`, `pnpm-lock.yaml`
- `*.map` files
- Binary files (`.png`, `.jpg`, `.woff`, `.woff2`, `.ttf`, `.ico`)
- `.crx`, `.xpi`, `.zip` files

**Categorize files by type:**

- Components: Files in `src/**/*.tsx`, `src/**/*.jsx`
- Utilities: Files in `src/**/lib/`, `src/**/utils/`
- UI Components: Files in `src/shared/components/ui/`
- Internationalization: Files in `src/**/i18n/`
- Configuration: `*.json`, `*.config.*`, `*.mts`
- Styles: `*.css`, `*.scss`
- Documentation: `*.md`

### 3. Read Files in Batches

Read the filtered files efficiently:

1. **Prioritize source code files** (.ts, .tsx, .js, .jsx) over configuration and documentation
2. **Batch read files** in groups of 10 for parallel processing
3. **Show progress** during reading for large changesets
4. **Collect file information** for summary generation

### 4. Parse Recent Commit History

Gather context from recent commits:

```bash
# Get last 5 commit messages
git log -5 --pretty=format:"%s" main..HEAD

# Get files changed in recent commits with stats
git log -5 --name-only --pretty=format:"" main..HEAD | sort | uniq
```

### 5. Generate Context Summary

Provide a comprehensive summary of restored context:

```markdown
## Catchup Complete

**Branch**: [branch-name] ([N] commits ahead, [M] commits behind main)
**Files analyzed**: [total-count] total

**Context restored from**:

- [N] React components (src/popup/, src/contentScripts/, src/shared/)
- [N] TypeScript utility files
- [N] UI components (shadcn/ui)
- [N] i18n localization files
- [N] configuration files
- [N] documentation files
- [N] other files

**Recent focus areas** (last 5 commits):

- [commit message 1]
- [commit message 2]
- [commit message 3]
- [commit message 4]
- [commit message 5]

**Key directories modified**:

- [directory 1]: [file count] files
- [directory 2]: [file count] files
- [directory 3]: [file count] files

**Ready to continue work on**: [Infer from commit messages and file changes]
```

## Arguments

### Optional Flags

- `--limit <n>`: Read only the N most recently modified files (useful for large branches)
- `--important`: Only read source code files, skip configs and documentation
- `--summary`: Show file list and statistics without reading files (dry run)
- `--since <commit>`: Read files changed since specific commit instead of main branch

### Examples

```bash
# Standard usage - read all changed files
/catchup

# Limit to 50 most recent files for quick context
/catchup --limit 50

# Focus only on source code
/catchup --important

# Preview what would be read without reading
/catchup --summary

# Catch up since specific commit
/catchup --since abc123
```

## When to Use

- **After `/clear`**: Restore context after resetting the session
- **New session**: When starting a new Claude Code session and need current work context
- **Context window cleared**: When context is automatically cleared due to size limits
- **Task switching**: When returning to this project after working on something else
- **Large branches**: Use with `--limit` flag for massive changesets

## Performance Considerations

- **Small branches** (<50 files): ~10-20 seconds
- **Medium branches** (50-150 files): ~30-45 seconds
- **Large branches** (>150 files): ~60-90 seconds
- **Tip**: Use `--limit 50 --important` for fastest context restoration on large branches

## Integration with Other Commands

- **Restart workflow**: `/clear` → `/catchup` → continue development
- **Before `/build`**: Run `/catchup` to ensure full context before builds
- **Before `/test`**: Restore context before running test suites
- **After long breaks**: Quick way to understand what you were working on

## Notes

- This command is read-only and makes no modifications
- Files are read in parallel batches for optimal performance
- Binary files and build artifacts are automatically skipped
- Works with any git branch, not just main comparisons (via `--since`)
- Token usage scales with number and size of changed files
