# Browser Extension Popup Redesign Requirements

## Feature Name
**Raycast-Style Command Palette with Actions Menu for Tab Scroll Synchronization**

## Overview
Redesign the browser extension popup to implement a Raycast-inspired command palette pattern with an Actions submenu, smart filtering, real-time sync status feedback, and comprehensive keyboard shortcuts.

---

## Components Required

### 1. **Command** (existing, enhanced)
- **Purpose**: Main command palette for tab search and selection
- **Usage**: Primary interface for finding and selecting tabs to sync
- **Enhancements**: Add Actions trigger button in CommandInput area

### 2. **Popover**
- **Purpose**: Actions menu overlay (triggered by Cmd/Ctrl+K)
- **Usage**: Secondary menu containing sync controls, filters, and sort options
- **Behavior**: Opens on keyboard shortcut, closes on Escape or action selection

### 3. **Kbd**
- **Purpose**: Visual display of keyboard shortcuts
- **Usage**: Show shortcuts next to each action in Actions menu and footer
- **Examples**: `<Kbd>⌘</Kbd><Kbd>K</Kbd>`, `<Kbd>⌘</Kbd><Kbd>S</Kbd>`

### 4. **Badge**
- **Purpose**: Sync status indicators
- **Usage**: Display sync state (Active/Inactive/Syncing/Error) with color coding
- **Variants**:
  - Green: Active sync
  - Gray: Inactive
  - Yellow: Starting/Syncing
  - Red: Error

### 5. **Toggle**
- **Purpose**: Filter controls
- **Usage**: "Same Domain Only" filter toggle
- **Behavior**: Persists state to localStorage

### 6. **RadioGroup**
- **Purpose**: Sort option selection
- **Usage**: Switch between "Similarity" and "Recent Visits" sort modes
- **Behavior**: Updates displayed tab order in real-time

### 7. **Separator**
- **Purpose**: Visual dividers in Actions menu
- **Usage**: Separate action groups (Sync Controls | Filters | Sort)

### 8. **Button**
- **Purpose**: Action items and triggers
- **Usage**:
  - Actions menu trigger button
  - Individual action items in Popover
  - Sync control buttons (if kept as alternative to shortcuts)

### 9. **ScrollArea**
- **Purpose**: Scrollable content containers
- **Usage**: Tab list in Command palette, Actions menu if needed

### 10. **Icons** (lucide-react or unplugin-icons)
- **Purpose**: Visual recognition for actions and status
- **Icons Needed**:
  - Play/Pause for sync controls
  - CheckCircle for Select All
  - X for Clear All
  - Filter for filter options
  - ArrowUpDown for sort
  - Circle/CircleDot for connection status

---

## Component Hierarchy

```
ScrollSyncPopup (main container)
│
├── SyncStatusHeader (new component)
│   ├── Badge (sync status indicator)
│   │   ├── Icon (status icon)
│   │   └── Text ("Active Sync" | "Inactive" | "Syncing...")
│   └── ConnectionIndicatorsList
│       └── ConnectionIndicator[] (per synced tab)
│           ├── Icon (●=connected, ○=disconnected)
│           └── Text (tab title)
│
├── TabCommandPalette (enhanced existing component)
│   ├── CommandInput (search input)
│   │   ├── SearchIcon
│   │   ├── Input (search field)
│   │   └── ActionsMenuTrigger (button)
│   │       ├── Text ("Actions")
│   │       ├── Kbd ("⌘K")
│   │       └── ChevronDown Icon
│   │
│   ├── CommandList (scrollable tab list)
│   │   ├── CommandGroup "Available Tabs"
│   │   │   └── CommandItem[] (selectable tabs)
│   │   │       ├── Icon (tab favicon)
│   │   │       ├── Text (tab title)
│   │   │       ├── Text (tab URL - muted)
│   │   │       └── CheckIcon (if selected)
│   │   │
│   │   └── CommandGroup "Unavailable Tabs"
│   │       └── CommandItem[] (disabled tabs)
│   │           ├── Icon (tab favicon - grayscale)
│   │           ├── Text (tab title - muted)
│   │           └── Text (reason - e.g., "not eligible")
│   │
│   └── SelectedTabsChips (selected tabs display)
│       └── Chip[] (removable chips for selected tabs)
│
├── ActionsMenu (new component - Popover)
│   ├── PopoverTrigger (programmatic, linked to Cmd+K)
│   └── PopoverContent
│       ├── PopoverHeader
│       │   └── Text ("Actions")
│       │
│       ├── ActionsList
│       │   ├── ActionItem (Start/Stop Sync)
│       │   │   ├── Icon (Play/Pause)
│       │   │   ├── Text ("Start Sync" | "Stop Sync")
│       │   │   └── Kbd ("⌘S")
│       │   │
│       │   ├── ActionItem (Select All)
│       │   │   ├── Icon (CheckCircle)
│       │   │   ├── Text ("Select All Eligible Tabs")
│       │   │   └── Kbd ("⌘A")
│       │   │
│       │   ├── ActionItem (Clear All)
│       │   │   ├── Icon (X)
│       │   │   ├── Text ("Clear All Selections")
│       │   │   └── Kbd ("⌘⇧X")
│       │   │
│       │   ├── Separator
│       │   │
│       │   ├── FilterSection
│       │   │   ├── SectionLabel ("Filters")
│       │   │   └── Toggle (Same Domain Only)
│       │   │       ├── Icon (Filter)
│       │   │       ├── Text ("Same Domain Only")
│       │   │       └── Kbd ("⌘D")
│       │   │
│       │   ├── Separator
│       │   │
│       │   └── SortSection
│       │       ├── SectionLabel ("Sort By")
│       │       └── RadioGroup
│       │           ├── RadioGroupItem ("Similarity")
│       │           └── RadioGroupItem ("Recent Visits")
│       │
│       └── PopoverFooter (optional)
│
└── FooterInfo (new component)
    └── HelpText
        ├── Kbd ("⌘K")
        ├── Text ("for actions")
        ├── Text ("•")
        ├── Kbd ("↵")
        └── Text ("to select")
```

---

## Data Flow Patterns

### 1. Tab Filtering Flow
```
allTabs (from React Query)
  ↓
[Filter: Same Domain Only?]
  ↓ YES: currentTab.domain === tab.domain
  ↓ NO: pass through
  ↓
filteredTabs
  ↓
[Sort: Similarity | Recent Visits]
  ↓
displayedTabs
  ↓
Command Palette Rendering
```

### 2. Sync Status Flow
```
User Action (Start Sync via Cmd+S or Actions menu)
  ↓
Send Message to Background Script
  ↓
Background Script: Initiate Sync
  ↓
Content Scripts: Connect and Listen
  ↓
Background Script: Send Status Updates
  ↓
Popup (React Query): Receive Updates
  ↓
Update State: syncStatus, connectedTabs
  ↓
Re-render: Badge, ConnectionIndicators
```

### 3. Actions Menu Interaction Flow
```
User: Press Cmd+K
  ↓
Toggle isActionsMenuOpen = true
  ↓
Popover Appears
  ↓
Focus Management: Focus first action item
  ↓
User: Select Action or Press Shortcut
  ↓
Execute Action Handler
  ↓
Update Relevant State (sync, filters, selections)
  ↓
Close Actions Menu (if appropriate)
  ↓
Focus Management: Return to Command Input
```

### 4. Keyboard Shortcut Flow
```
User: Press Keyboard Shortcut
  ↓
Keyboard Event Listener: Capture Event
  ↓
preventDefault() to prevent default browser behavior
  ↓
Check Context: Actions menu open? Command palette focused?
  ↓
Route to Appropriate Handler
  ↓
Execute Action
  ↓
Update UI State
  ↓
Provide Visual/Audio Feedback
```

---

## Keyboard Shortcuts

### Global Shortcuts (work anywhere in popup)

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Cmd/Ctrl + K` | Toggle Actions Menu | Open/close the Actions popover |
| `Cmd/Ctrl + S` | Start/Stop Sync | Toggle sync on/off (replaces Cmd+Enter) |
| `Cmd/Ctrl + A` | Select All | Select all eligible tabs |
| `Cmd/Ctrl + Shift + X` | Clear All | Clear all tab selections |
| `Cmd/Ctrl + D` | Toggle Filter | Toggle "Same Domain Only" filter |
| `Escape` | Context-aware Close | Close Actions menu OR clear search |

### Context-Specific Shortcuts

| Context | Shortcut | Action |
|---------|----------|--------|
| Command Palette | `Enter` | Select/Deselect tab |
| Command Palette | `↑` / `↓` | Navigate tabs |
| Actions Menu | `↑` / `↓` | Navigate actions |
| Actions Menu | `Tab` | Navigate focusable elements |
| Actions Menu | `Escape` | Close menu, return focus |

### Platform Detection
- **Windows/Linux**: Show `Ctrl` modifier
- **macOS**: Show `⌘` (Cmd) modifier
- **Implementation**: Use `navigator.platform` or `mod` key in event handler

---

## Implementation Notes

### State Management

#### 1. Sync State (React Query + Local State)
```typescript
interface SyncState {
  isSyncing: boolean;
  syncStatus: 'idle' | 'starting' | 'active' | 'stopping' | 'error';
  connectedTabs: Map<TabId, ConnectionStatus>;
  errorMessage?: string;
}

interface ConnectionStatus {
  tabId: number;
  title: string;
  isConnected: boolean;
  lastUpdate: Date;
}
```

#### 2. Filter/Sort State (Local State + localStorage)
```typescript
interface FilterSortState {
  filterSameDomain: boolean; // persisted
  sortBy: 'similarity' | 'recentVisits'; // persisted
}
```

#### 3. UI State (Local State)
```typescript
interface UIState {
  isActionsMenuOpen: boolean;
  searchQuery: string;
  selectedTabIds: Set<number>;
}
```

#### 4. Computed State (useMemo)
```typescript
const filteredTabs = useMemo(() => {
  let tabs = allTabs;

  if (filterSameDomain && currentTab) {
    const currentDomain = new URL(currentTab.url).hostname;
    tabs = tabs.filter(tab => {
      const tabDomain = new URL(tab.url).hostname;
      return tabDomain === currentDomain;
    });
  }

  return tabs;
}, [allTabs, filterSameDomain, currentTab]);

const sortedTabs = useMemo(() => {
  if (sortBy === 'recentVisits') {
    return [...filteredTabs].sort((a, b) =>
      (b.lastAccessed || 0) - (a.lastAccessed || 0)
    );
  }
  // Default: similarity sorting (domain grouping)
  return filteredTabs;
}, [filteredTabs, sortBy]);
```

### Custom Hooks

#### 1. useKeyboardShortcuts
```typescript
useKeyboardShortcuts({
  'mod+k': (e) => {
    e.preventDefault();
    setIsActionsMenuOpen(prev => !prev);
  },
  'mod+s': (e) => {
    e.preventDefault();
    toggleSync();
  },
  'mod+a': (e) => {
    e.preventDefault();
    selectAllEligibleTabs();
  },
  'mod+shift+x': (e) => {
    e.preventDefault();
    clearAllSelections();
  },
  'mod+d': (e) => {
    e.preventDefault();
    setFilterSameDomain(prev => !prev);
  },
  'escape': (e) => {
    if (isActionsMenuOpen) {
      e.preventDefault();
      setIsActionsMenuOpen(false);
    } else if (searchQuery) {
      e.preventDefault();
      setSearchQuery('');
    }
  }
});
```

#### 2. useSyncStatus (React Query)
```typescript
const { data: syncStatus, refetch } = useQuery({
  queryKey: ['syncStatus'],
  queryFn: async () => {
    const response = await browser.runtime.sendMessage({
      type: 'GET_SYNC_STATUS'
    });
    return response.status;
  },
  refetchInterval: 1000, // Poll every second for real-time updates
});
```

#### 3. usePersistentState (localStorage wrapper)
```typescript
const [filterSameDomain, setFilterSameDomain] = usePersistentState(
  'filter-same-domain',
  false
);

const [sortBy, setSortBy] = usePersistentState(
  'sort-by',
  'similarity'
);
```

### Focus Management Strategy

#### 1. Popup Opens
```typescript
useEffect(() => {
  // Auto-focus search input when popup opens
  commandInputRef.current?.focus();
}, []);
```

#### 2. Actions Menu Opens
```typescript
useEffect(() => {
  if (isActionsMenuOpen) {
    // Focus first action item
    firstActionRef.current?.focus();
  }
}, [isActionsMenuOpen]);
```

#### 3. Actions Menu Closes
```typescript
const closeActionsMenu = () => {
  setIsActionsMenuOpen(false);
  // Return focus to command input
  commandInputRef.current?.focus();
};
```

#### 4. Tab Selection
```typescript
const handleTabSelect = (tabId: number) => {
  toggleTabSelection(tabId);
  // Keep focus on Command palette for continuous selection
  commandInputRef.current?.focus();
};
```

### Event Prevention & Propagation

```typescript
// Prevent default browser behavior for custom shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  const isMod = e.metaKey || e.ctrlKey;

  if (isMod && e.key === 'k') {
    e.preventDefault(); // Prevent browser search
    e.stopPropagation();
    toggleActionsMenu();
  }

  if (isMod && e.key === 's') {
    e.preventDefault(); // Prevent browser save
    e.stopPropagation();
    toggleSync();
  }
};

// In Actions menu, prevent events from reaching Command palette
const handleActionsMenuKeyDown = (e: KeyboardEvent) => {
  e.stopPropagation(); // Prevent Command palette from handling

  if (e.key === 'Escape') {
    e.preventDefault();
    closeActionsMenu();
  }
};
```

---

## Accessibility Requirements

### Keyboard Navigation
- ✅ All interactive elements keyboard accessible
- ✅ Logical tab order: Header → Command Input → Actions Button → Tab List → Footer
- ✅ Focus indicators with 3:1 contrast ratio
- ✅ No keyboard traps in Actions menu
- ✅ Escape key exits overlays and returns focus appropriately

### Screen Reader Support

#### ARIA Labels
```typescript
// Actions trigger button
<Button aria-label="Open actions menu" aria-expanded={isActionsMenuOpen}>
  Actions <Kbd>⌘K</Kbd>
</Button>

// Same domain filter toggle
<Toggle
  aria-label="Filter to show only tabs from the same domain as current tab"
  aria-pressed={filterSameDomain}
>
  Same Domain Only
</Toggle>

// Sort radio group
<RadioGroup aria-label="Sort tabs by">
  <RadioGroupItem value="similarity" aria-label="Sort by domain similarity" />
  <RadioGroupItem value="recentVisits" aria-label="Sort by recent visits" />
</RadioGroup>
```

#### ARIA States & Properties
```typescript
// Actions menu popover
<Popover>
  <PopoverContent role="dialog" aria-label="Actions menu">
    {/* Content */}
  </PopoverContent>
</Popover>

// Command palette items
<CommandItem
  aria-selected={isSelected}
  aria-disabled={!isEligible}
>
  {/* Tab info */}
</CommandItem>
```

#### ARIA Live Regions
```typescript
// Sync status announcements
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {syncStatus === 'active' && 'Sync started successfully'}
  {syncStatus === 'stopping' && 'Sync stopped'}
  {syncStatus === 'error' && `Sync error: ${errorMessage}`}
</div>

// Tab selection announcements
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {selectionMessage} {/* e.g., "Tab selected: Google Docs" */}
</div>
```

### Visual Accessibility

#### Color Independence
- **Don't**: Rely solely on color for connection status
- **Do**: Use icon + text + color
  ```typescript
  // Connected tab
  <div>
    <CircleDot className="text-green-500" aria-hidden="true" />
    <span>Connected</span>
  </div>

  // Disconnected tab
  <div>
    <Circle className="text-gray-400" aria-hidden="true" />
    <span>Disconnected</span>
  </div>
  ```

#### Contrast Ratios
- Normal text: 4.5:1 minimum
- Large text (18pt+): 3:1 minimum
- UI components: 3:1 minimum
- Focus indicators: 3:1 minimum

#### Status Badge Design
```typescript
<Badge variant="success"> {/* Green background */}
  <PlayIcon className="w-3 h-3" aria-hidden="true" />
  <span>Active Sync</span> {/* High contrast text */}
</Badge>

<Badge variant="default"> {/* Gray background */}
  <PauseIcon className="w-3 h-3" aria-hidden="true" />
  <span>Inactive</span>
</Badge>
```

### Focus Management for Accessibility
- Announce menu opening: "Actions menu opened"
- Announce menu closing: "Actions menu closed"
- Announce focus changes for screen readers
- Ensure focus visibility in high contrast mode

---

## Validation Rules

### Input Validation
- Search query: Accept any string, filter as user types
- Tab selection: Only allow eligible tabs to be selected
- Filter state: Boolean, validate before persisting
- Sort option: Enum validation ('similarity' | 'recentVisits')

### State Validation
- At least 2 tabs must be selected to start sync
- Current tab cannot be selected (only other tabs can be synced)
- Disconnected tabs should be marked but not prevent sync

### Error Handling
```typescript
// Sync start validation
const validateSyncStart = (): ValidationResult => {
  if (selectedTabIds.size < 1) {
    return {
      isValid: false,
      error: 'Select at least one tab to sync'
    };
  }

  if (selectedTabIds.has(currentTab.id)) {
    return {
      isValid: false,
      error: 'Cannot sync current tab with itself'
    };
  }

  return { isValid: true };
};

// Display validation errors
if (!validation.isValid) {
  toast.error(validation.error);
  return;
}
```

### Performance Validation
- Filter/sort operations: Complete within 100ms
- Search debounce: 150ms to avoid excessive filtering
- Status updates: Poll interval ≤ 1 second
- Actions menu: Open/close within 200ms

---

## UI Layout Recommendations

### Visual Hierarchy

```
┌─────────────────────────────────────────────────────┐
│  SYNC STATUS HEADER                                 │
│  ┌────────────────────────────────────────────────┐ │
│  │ [●] Active Sync  |  3 tabs connected          │ │
│  │ Connected: Tab 1, Tab 2, Tab 3                │ │
│  └────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  COMMAND PALETTE                                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ [🔍] Search tabs...      [⌘K Actions ▼]       │ │
│  ├────────────────────────────────────────────────┤ │
│  │ Available Tabs                                 │ │
│  │ › docs.google.com - Document Title      [✓]   │ │
│  │   github.com - Repository Name                │ │
│  │   stackoverflow.com - Question Title          │ │
│  │                                                │ │
│  │ Unavailable Tabs                              │ │
│  │   chrome://extensions (not eligible)          │ │
│  ├────────────────────────────────────────────────┤ │
│  │ Selected: [docs.google.com ×]                 │ │
│  └────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  FOOTER                                             │
│  ┌────────────────────────────────────────────────┐ │
│  │ Press ⌘K for actions • ↵ to select            │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

         ┌──────────────────────────────┐
         │ ACTIONS MENU (Popover)       │
         ├──────────────────────────────┤
         │ ▶ Start Sync          ⌘S    │
         │ ⊕ Select All          ⌘A    │
         │ ✕ Clear All           ⌘⇧X   │
         ├──────────────────────────────┤
         │ Filters                      │
         │ ☐ Same Domain Only    ⌘D    │
         ├──────────────────────────────┤
         │ Sort By                      │
         │ ◉ Similarity (current)       │
         │ ○ Recent Visits              │
         └──────────────────────────────┘
```

### Spacing & Sizing
- **Popup Width**: 400px (fixed)
- **Popup Max Height**: 600px (scrollable content)
- **Header Height**: Auto (based on content, max 80px)
- **Command Palette Height**: Flexible (fills remaining space)
- **Footer Height**: 32px (fixed)
- **Actions Menu Width**: 280px
- **Actions Menu Max Height**: 400px

### Color Scheme (Dark/Light Mode)

#### Status Colors
| Status | Light Mode | Dark Mode | Icon |
|--------|-----------|-----------|------|
| Active | Green 500 | Green 400 | PlayIcon |
| Inactive | Gray 400 | Gray 500 | PauseIcon |
| Syncing | Yellow 500 | Yellow 400 | LoaderIcon (spinning) |
| Error | Red 500 | Red 400 | AlertCircleIcon |

#### Connection Indicators
| State | Light Mode | Dark Mode | Icon |
|-------|-----------|-----------|------|
| Connected | Green 500 | Green 400 | CircleDot |
| Disconnected | Gray 400 | Gray 500 | Circle |

### Typography
- **Header Title**: font-semibold, text-sm
- **Tab Title**: font-medium, text-sm
- **Tab URL**: font-normal, text-xs, text-muted-foreground
- **Action Text**: font-medium, text-sm
- **Footer Help**: font-normal, text-xs, text-muted-foreground
- **Kbd**: font-mono, text-xs

---

## Edge Cases & Error Handling

### 1. No Eligible Tabs
**Scenario**: All tabs are unavailable for syncing
**Handling**:
- Show empty state in Command palette
- Display message: "No eligible tabs found. Open more web pages to sync."
- Disable sync controls
- Actions menu still accessible for filters

### 2. Sync Failure During Active Sync
**Scenario**: Sync fails while syncing is active
**Handling**:
- Update syncStatus to 'error'
- Display error badge with red color
- Show error message in toast notification
- Provide "Retry" action in Actions menu
- Log error details for debugging

### 3. Browser-Specific Keyboard Conflicts
**Scenario**: Shortcuts conflict with browser defaults
**Handling**:
- Use `e.preventDefault()` for all custom shortcuts
- Detect platform and show appropriate modifier key
- Provide alternative click-based actions
- Document known conflicts in help section

### 4. Actions Menu Open When Sync Starts
**Scenario**: User starts sync via shortcut while Actions menu is open
**Handling**:
- Execute sync action
- Close Actions menu automatically
- Return focus to Command input
- Show success feedback

### 5. Tab Becomes Unavailable During Selection
**Scenario**: Selected tab is closed or navigates to restricted URL
**Handling**:
- Remove tab from selected list automatically
- Show notification: "Tab X is no longer available"
- Update available tabs list in real-time
- Adjust sync state if affected

### 6. Empty Search Results
**Scenario**: Search query returns no matching tabs
**Handling**:
- Show empty state: "No tabs match your search"
- Provide "Clear search" option
- Keep Actions menu accessible
- Don't hide unavailable tabs section

### 7. Rapid Keyboard Shortcuts
**Scenario**: User presses shortcuts in quick succession
**Handling**:
- Debounce toggle actions (200ms)
- Queue non-toggle actions
- Prevent duplicate actions
- Provide visual feedback for each action

### 8. Popup Closed During Active Sync
**Scenario**: User closes popup while sync is running
**Handling**:
- Sync continues in background
- Persist sync state to storage
- Restore state when popup reopens
- Show accurate status on reopen

---

## Performance Considerations

### Optimization Strategies

#### 1. Memoization
```typescript
// Memoize filtered tabs
const filteredTabs = useMemo(() => {
  // Filtering logic
}, [allTabs, filterSameDomain, currentTab]);

// Memoize sorted tabs
const sortedTabs = useMemo(() => {
  // Sorting logic
}, [filteredTabs, sortBy]);

// Memoize domain extraction
const getDomain = useMemo(() =>
  memoize((url: string) => new URL(url).hostname),
  []
);
```

#### 2. React.memo for Components
```typescript
const TabItem = React.memo(({ tab, isSelected, onSelect }) => {
  // Component logic
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.tab.id === nextProps.tab.id &&
         prevProps.isSelected === nextProps.isSelected;
});
```

#### 3. Debouncing
```typescript
// Search input debouncing
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    setSearchQuery(query);
  }, 150),
  []
);
```

#### 4. Virtualization (if needed)
```typescript
// For large tab lists (>50 tabs), consider virtualization
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: filteredTabs.length,
  getScrollElement: () => scrollElementRef.current,
  estimateSize: () => 48, // Estimated tab item height
});
```

### Performance Budgets
- **Initial Render**: < 200ms
- **Search Filter**: < 100ms
- **Actions Menu Toggle**: < 200ms
- **Status Update**: < 50ms
- **Memory Usage**: < 50MB

---

## Testing Strategy

### Unit Tests
- Filter logic: Same domain filtering accuracy
- Sort logic: Correct ordering for similarity and recent visits
- Keyboard shortcut handlers: Correct action execution
- State management: Filter/sort state persistence
- Validation: Sync start validation rules

### Integration Tests
- Actions menu: Open/close with keyboard and mouse
- Tab selection: Select, deselect, select all, clear all
- Sync flow: Start sync → status updates → stop sync
- Filter + Sort: Combined filtering and sorting
- Focus management: Correct focus transitions

### Accessibility Tests
- Keyboard navigation: All interactive elements reachable
- Screen reader: Proper announcements for all state changes
- Focus indicators: Visible in light and dark mode
- Color contrast: All text meets 4.5:1 ratio
- ARIA attributes: Correct roles, labels, and states

### E2E Tests (Playwright)
- Complete user flow: Open popup → search → select tabs → start sync
- Actions menu usage: Open actions → toggle filter → start sync
- Error handling: No eligible tabs → show appropriate message
- Persistence: Close popup → reopen → state restored

---

## Success Metrics

### User Experience Metrics
- **Time to Start Sync**: < 5 seconds from popup open
- **Actions Discoverability**: 80% of users find Actions menu within first use
- **Keyboard Shortcut Adoption**: 40% of users use shortcuts after 5 sessions
- **Error Rate**: < 1% of sync attempts fail

### Performance Metrics
- **Popup Open Time**: < 300ms
- **Actions Menu Response**: < 200ms
- **Search Responsiveness**: < 100ms from last keystroke
- **Status Update Latency**: < 1 second

### Accessibility Metrics
- **Keyboard Task Completion**: 100% of tasks completable via keyboard
- **Screen Reader Compatibility**: 100% of features accessible
- **WCAG 2.1 AA Compliance**: 100% of criteria met

---

## Future Enhancements (Out of Scope)

1. **Tab Groups**: Group tabs by domain or custom tags
2. **Presets**: Save common tab selection configurations
3. **Advanced Filters**: Filter by URL pattern, title search, or tab type
4. **Sync History**: View past sync sessions
5. **Multi-Window Support**: Sync tabs across multiple browser windows
6. **Custom Keyboard Shortcuts**: Allow users to customize shortcuts
7. **Sync Profiles**: Different sync configurations for different use cases
8. **Analytics**: Track usage patterns for UX improvements

---

## Dependencies & Technical Requirements

### Required Libraries
- `@shadcn/ui` components (already installed)
- `cmdk` for Command palette (likely already installed)
- `lucide-react` or `unplugin-icons` for icons (already configured)
- `react-use` or custom hooks for keyboard shortcuts
- `webextension-polyfill` (already installed)
- `webext-bridge` (already installed)

### Browser Compatibility
- Chrome: 88+ (Manifest V3)
- Edge: 88+ (Manifest V3)
- Firefox: 109+ (Manifest V3 support)
- Brave: Chrome-based compatibility

### Development Tools
- TypeScript 5.x
- React 19
- Vite 6.x
- UnoCSS (already configured)

---

## Implementation Phases

### Phase 1: Core Structure (Week 1)
1. Create new component structure
2. Implement Actions menu with Popover
3. Add keyboard shortcut system
4. Set up state management

### Phase 2: Filtering & Sorting (Week 1-2)
1. Implement "Same Domain Only" filter
2. Add "Recent Visits" sort option
3. Persist filter/sort preferences
4. Add filter/sort to Actions menu

### Phase 3: Sync Status (Week 2)
1. Create SyncStatusHeader component
2. Implement real-time status updates
3. Add connection indicators per tab
4. Integrate with React Query

### Phase 4: Polish & Accessibility (Week 2-3)
1. Add Kbd components for shortcuts
2. Implement focus management
3. Add ARIA labels and live regions
4. Test keyboard navigation
5. Ensure WCAG 2.1 AA compliance

### Phase 5: Testing & Refinement (Week 3)
1. Write unit tests
2. Write integration tests
3. Conduct accessibility testing
4. User testing and feedback
5. Bug fixes and refinements

---

## Open Questions

1. **Sync Button Alternative**: Should we keep the Start/Stop buttons in addition to Cmd+S shortcut, or rely only on shortcuts + Actions menu?
   - **Recommendation**: Keep buttons as fallback for discoverability

2. **Actions Menu Position**: Should Actions menu anchor to the trigger button or appear centered in popup?
   - **Recommendation**: Anchor to trigger button (Raycast pattern)

3. **Filter Persistence**: Should filters persist across browser sessions or reset on popup close?
   - **Recommendation**: Persist for better UX

4. **Status Polling Interval**: How frequently should we poll for sync status updates?
   - **Recommendation**: 1 second for real-time feel, with exponential backoff if no changes

5. **Empty State Actions**: What actions should be available when no tabs are eligible?
   - **Recommendation**: Show help text and link to documentation

6. **Error Recovery**: Should sync auto-retry on failure, or require manual retry?
   - **Recommendation**: Show error, provide manual "Retry" action

---

## Conclusion

This redesign transforms the browser extension popup into a powerful, keyboard-first interface inspired by Raycast's command palette pattern. The Actions menu provides quick access to all sync controls, filters, and settings, while maintaining a clean and intuitive UI. Real-time sync status feedback ensures users always know the state of their tab synchronization.

The implementation prioritizes accessibility, performance, and user experience, ensuring the extension is usable by everyone and feels responsive and polished.
