# Shared Hooks

Reusable React hooks shared across popup and content script components.

## Hooks

| Hook                        | Responsibility                                                                | Tests |
| --------------------------- | ----------------------------------------------------------------------------- | ----- |
| `use-keyboard-shortcuts.ts` | Global keyboard shortcut registration with modifier key support               | Yes   |
| `use-modifier-key.ts`       | Tracks Option/Alt key state for manual scroll adjustment                      | Yes   |
| `use-persistent-state.ts`   | React state backed by `browser.storage.local` for persistence across sessions | Yes   |
| `use-system-theme.ts`       | Detects system dark/light mode preference via `matchMedia`                    | Yes   |
| `index.ts`                  | Barrel file re-exporting all hooks                                            | —     |

## Import Pattern

```typescript
import { useKeyboardShortcuts, useModifierKey } from '~/shared/hooks';
```

## Design Principles

- **Framework-agnostic logic**: Hooks wrap browser APIs in React-friendly patterns
- **No component coupling**: Hooks are independent of specific component implementations
- **Cross-context**: Work in both popup (extension page) and content script (Shadow DOM) environments
