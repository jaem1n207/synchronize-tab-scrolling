# SyncControlPanel Component

A clean, minimal floating control panel component for browser extensions that provides a toggle switch for URL navigation synchronization.

## Features

- **Modern Design**: Semi-transparent background with backdrop blur effect
- **Accessible**: Full WCAG 2.1 AA compliance with proper ARIA attributes
- **Compact**: Small, unobtrusive design that doesn't interfere with page content
- **Shadow DOM Compatible**: Works perfectly inside Shadow DOM environments
- **TypeScript**: Fully typed with TypeScript for type safety
- **Responsive**: Adapts to different screen sizes

## Usage

```tsx
import { useState } from 'react';
import { SyncControlPanel } from '~/contentScripts/components';

function MyContentScript() {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);

  const handleToggle = () => {
    setUrlSyncEnabled((prev) => !prev);
    // Add your synchronization logic here
  };

  return <SyncControlPanel urlSyncEnabled={urlSyncEnabled} onToggle={handleToggle} />;
}
```

## Props

### `SyncControlPanelProps`

| Prop             | Type         | Required | Description                                     |
| ---------------- | ------------ | -------- | ----------------------------------------------- |
| `urlSyncEnabled` | `boolean`    | Yes      | Current state of URL sync (checked/unchecked)   |
| `onToggle`       | `() => void` | Yes      | Callback function called when switch is toggled |
| `className`      | `string`     | No       | Optional CSS classes for custom styling         |

## Styling

The component uses:

- **Positioning**: Fixed position at top-right corner with 16px margin
- **Z-index**: Maximum value (2147483647) to ensure it stays on top
- **Background**: Semi-transparent with backdrop blur for modern glass effect
- **Dimensions**: 320px width (20rem), auto height based on content
- **Animations**: Fade-in and slide-in animations on mount

### Customization

You can customize the position by passing a `className`:

```tsx
<SyncControlPanel
  urlSyncEnabled={urlSyncEnabled}
  onToggle={handleToggle}
  className="top-8 right-8" // Custom positioning
/>
```

## Accessibility

The component includes comprehensive accessibility features:

- **Semantic HTML**: Proper label and switch associations
- **ARIA Attributes**:
  - `aria-label` for screen reader context
  - `aria-describedby` for detailed descriptions
- **Keyboard Navigation**: Full keyboard support (Tab, Space, Enter)
- **Focus Indicators**: Visible focus states for keyboard users
- **Screen Reader Support**: Hidden description text for context

## Implementation Details

### Component Structure

```
SyncControlPanel
├── Card (container)
│   └── CardContent
│       ├── Label (title + description)
│       │   ├── "Sync URL Navigation" (title)
│       │   └── "Preserves query parameters..." (description)
│       └── Switch (toggle control)
```

### Dependencies

- `@radix-ui/react-switch`: Accessible switch component
- `shadcn/ui Card`: Container component
- `shadcn/ui Label`: Accessible label component
- `class-variance-authority`: Utility for conditional classes

## Example with State Management

```tsx
import { useState, useEffect } from 'react';
import { SyncControlPanel } from '~/contentScripts/components';

function ContentScriptApp() {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(() => {
    // Load from storage
    return localStorage.getItem('urlSyncEnabled') === 'true';
  });

  useEffect(() => {
    // Persist to storage
    localStorage.setItem('urlSyncEnabled', String(urlSyncEnabled));

    // Send message to background script
    chrome.runtime.sendMessage({
      type: 'URL_SYNC_TOGGLE',
      enabled: urlSyncEnabled,
    });
  }, [urlSyncEnabled]);

  return (
    <SyncControlPanel
      urlSyncEnabled={urlSyncEnabled}
      onToggle={() => setUrlSyncEnabled((prev) => !prev)}
    />
  );
}
```

## Browser Compatibility

- Chrome/Edge (Manifest V3)
- Firefox
- Brave
- Any browser supporting Web Extensions API

## Notes

- The component is designed to work inside Shadow DOM for style isolation
- Uses fixed positioning to overlay on top of page content
- Maximum z-index ensures visibility above all page elements
- Backdrop blur may not be supported in older browsers (graceful degradation)
