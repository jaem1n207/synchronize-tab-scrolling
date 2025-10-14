# shadcn/ui Component Research for Tab List UI

## Project Context

Browser extension popup that displays a list of browser tabs with various states. The popup uses React with TypeScript and needs accessible UI components for showing tab status, availability indicators, and visual separators.

## Installation Commands

### Already Installed Components

```bash
# These components are already in your project
# Located in: src/shared/components/ui/

✅ Tooltip - src/shared/components/ui/tooltip.tsx
✅ Badge - src/shared/components/ui/badge.tsx
✅ Separator - src/shared/components/ui/separator.tsx
```

### Component to Install

```bash
# Avatar component (not yet installed)
pnpm dlx shadcn@latest add avatar
```

## Component Analysis

### 1. Tooltip Component ✅ (Already Installed)

**Purpose**: Display information about why tabs are unavailable for sync (e.g., web store pages, browser internal pages).

**Installation**: Already installed at `src/shared/components/ui/tooltip.tsx`

**Key Features**:

- Built on Radix UI primitives (`@radix-ui/react-tooltip`)
- Accessible by default with proper ARIA attributes
- Smooth animations with fade-in/zoom-in effects
- Configurable side positioning and offset
- Supports keyboard navigation

**Component API**:

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';

// Props for TooltipContent
interface TooltipContentProps {
  sideOffset?: number; // Default: 4
  className?: string;
  // Plus all Radix Tooltip.Content props
}
```

**Implementation Pattern for Tab List**:

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';

// Wrap your entire tab list with TooltipProvider
function TabList() {
  return (
    <TooltipProvider>
      <div className="space-y-2">
        {tabs.map(tab => (
          <TabItem key={tab.id} tab={tab} />
        ))}
      </div>
    </TooltipProvider>
  );
}

// Individual tab with tooltip for unavailable tabs
function TabItem({ tab }) {
  if (!tab.canSync) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="opacity-50 cursor-not-allowed">
            {/* Tab content */}
            <span>{tab.title}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getUnavailableReason(tab)}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <div>{/* Normal tab */}</div>;
}

// Helper function for unavailable reasons
function getUnavailableReason(tab) {
  if (tab.url.startsWith('chrome://')) {
    return 'Browser internal pages cannot be synced';
  }
  if (tab.url.includes('chrome.google.com/webstore')) {
    return 'Chrome Web Store pages cannot be synced';
  }
  if (tab.url.startsWith('about:')) {
    return 'Browser configuration pages cannot be synced';
  }
  return 'This tab cannot be synced';
}
```

**Accessibility Features**:

- Automatic ARIA attributes from Radix UI
- Keyboard accessible (focus trigger, Escape to close)
- Screen reader friendly
- Respects `prefers-reduced-motion`

**Styling Customization**:

```typescript
// Custom positioning
<TooltipContent side="right" sideOffset={10}>
  <p>Content</p>
</TooltipContent>

// Custom styling
<TooltipContent className="max-w-xs bg-destructive text-destructive-foreground">
  <p>Error message</p>
</TooltipContent>
```

---

### 2. Badge Component ✅ (Already Installed)

**Purpose**: Display tab status like "Syncing", "Selected", "Primary" with different color variants.

**Installation**: Already installed at `src/shared/components/ui/badge.tsx`

**Key Features**:

- Built with class-variance-authority (CVA)
- Four built-in variants: default, secondary, destructive, outline
- Supports icons and custom content
- Focus ring for accessibility
- Fully customizable with className

**Component API**:

```typescript
import { Badge, type BadgeProps } from '~/shared/components/ui/badge';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  // Plus all div HTML attributes
}
```

**Available Variants**:

- `default` - Primary blue background (uses theme primary color)
- `secondary` - Muted gray background
- `destructive` - Red for errors/warnings
- `outline` - Transparent with border

**Implementation Patterns for Tab Status**:

```typescript
import { Badge } from '~/shared/components/ui/badge';

// Status badges
function TabStatusBadge({ status }: { status: TabStatus }) {
  const variants = {
    syncing: 'default',
    selected: 'secondary',
    error: 'destructive',
    primary: 'outline',
  } as const;

  const labels = {
    syncing: 'Syncing',
    selected: 'Selected',
    error: 'Error',
    primary: 'Primary',
  };

  return (
    <Badge variant={variants[status]}>
      {labels[status]}
    </Badge>
  );
}

// Badge with icon
import { CheckIcon, SyncIcon } from 'lucide-react';

function TabBadgeWithIcon({ isSyncing }: { isSyncing: boolean }) {
  return (
    <Badge variant={isSyncing ? 'default' : 'secondary'} className="gap-1">
      {isSyncing ? (
        <>
          <SyncIcon className="h-3 w-3 animate-spin" />
          Syncing
        </>
      ) : (
        <>
          <CheckIcon className="h-3 w-3" />
          Synced
        </>
      )}
    </Badge>
  );
}

// Notification count badge
function NotificationBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="destructive"
      className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </Badge>
  );
}

// Custom colored badge
function CustomBadge() {
  return (
    <Badge
      variant="secondary"
      className="bg-blue-500 text-white dark:bg-blue-600"
    >
      Custom
    </Badge>
  );
}
```

**Best Practices**:

- Keep text short (1-2 words max)
- Use semantic variants (destructive for errors)
- Cap notification counts at 99+ or 9+
- Add icons for better visual communication
- Use custom colors sparingly (prefer semantic variants)

**Accessibility**:

- Proper color contrast ratios
- Focus ring included
- Can be made interactive with proper roles
- Screen reader accessible text

---

### 3. Avatar Component ⚠️ (Needs Installation)

**Purpose**: Display favicon or placeholder icon for tabs, maintaining consistent UI spacing when favicons are missing.

**Installation Required**:

```bash
pnpm dlx shadcn@latest add avatar
```

**Key Features**:

- Built on Radix UI Avatar primitive
- Automatic fallback handling
- Image loading state management
- Consistent sizing and styling
- Customizable with className

**Component API** (after installation):

```typescript
import { Avatar, AvatarFallback, AvatarImage } from '~/shared/components/ui/avatar';

// Basic structure
interface AvatarImageProps {
  src?: string;
  alt?: string;
}

interface AvatarFallbackProps {
  children: React.ReactNode;
}
```

**Implementation Patterns for Tab Favicons**:

```typescript
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '~/shared/components/ui/avatar';
import { GlobeIcon } from 'lucide-react';

// Tab favicon with fallback
function TabFavicon({ tab }: { tab: Tab }) {
  const initials = tab.title
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  return (
    <Avatar className="h-6 w-6">
      <AvatarImage
        src={tab.favIconUrl}
        alt={`${tab.title} favicon`}
      />
      <AvatarFallback>
        {tab.favIconUrl ? initials : <GlobeIcon className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

// Rounded square favicon (common for tabs)
function TabFaviconSquare({ tab }: { tab: Tab }) {
  return (
    <Avatar className="h-6 w-6 rounded-sm">
      <AvatarImage src={tab.favIconUrl} alt={tab.title} />
      <AvatarFallback className="rounded-sm bg-muted">
        <GlobeIcon className="h-4 w-4 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}

// Stacked tab favicons (for grouped tabs)
function StackedFavicons({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="-space-x-2 flex">
      {tabs.slice(0, 3).map(tab => (
        <Avatar key={tab.id} className="h-6 w-6 border-2 border-background">
          <AvatarImage src={tab.favIconUrl} alt={tab.title} />
          <AvatarFallback>
            {tab.title[0]}
          </AvatarFallback>
        </Avatar>
      ))}
      {tabs.length > 3 && (
        <Avatar className="h-6 w-6 border-2 border-background">
          <AvatarFallback className="text-xs">
            +{tabs.length - 3}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// Tab with status indicator
function TabFaviconWithStatus({ tab, isSyncing }: { tab: Tab; isSyncing: boolean }) {
  return (
    <div className="relative">
      <Avatar className="h-8 w-8">
        <AvatarImage src={tab.favIconUrl} alt={tab.title} />
        <AvatarFallback>
          <GlobeIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      {isSyncing && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
        </span>
      )}
    </div>
  );
}
```

**Sizing Guidelines**:

- Small tabs: `h-6 w-6` or `h-4 w-4`
- Medium tabs: `h-8 w-8`
- Large tabs: `h-10 w-10`
- Match your existing tab list item height

**Best Practices**:

- Always provide alt text for accessibility
- Use consistent sizing across all tab items
- Provide meaningful fallbacks (initials or icons)
- Consider rounded-sm for favicon-like appearance
- Add border for stacked avatars to improve visibility

**Accessibility**:

- Image alt text required
- Fallback content is accessible
- Proper ARIA attributes from Radix UI
- Respects prefers-reduced-motion for animations

---

### 4. Separator Component ✅ (Already Installed)

**Purpose**: Visually separate syncing tabs from regular tabs in the list.

**Installation**: Already installed at `src/shared/components/ui/separator.tsx`

**Key Features**:

- Built on Radix UI Separator primitive
- Supports horizontal and vertical orientations
- Semantic HTML with proper ARIA attributes
- Decorative or structural separation
- Minimal and clean design

**Component API**:

```typescript
import { Separator } from '~/shared/components/ui/separator';

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'; // Default: 'horizontal'
  decorative?: boolean; // Default: true
  className?: string;
}
```

**Implementation Patterns for Tab List**:

```typescript
import { Separator } from '~/shared/components/ui/separator';

// Separate syncing tabs from regular tabs
function TabList({ tabs }: { tabs: Tab[] }) {
  const syncingTabs = tabs.filter(t => t.isSyncing);
  const regularTabs = tabs.filter(t => !t.isSyncing);

  return (
    <div className="space-y-2">
      {/* Syncing tabs section */}
      {syncingTabs.length > 0 && (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground px-2">
              Syncing ({syncingTabs.length})
            </h3>
            {syncingTabs.map(tab => (
              <TabItem key={tab.id} tab={tab} />
            ))}
          </div>

          <Separator className="my-4" />
        </>
      )}

      {/* Regular tabs section */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-muted-foreground px-2">
          Available Tabs ({regularTabs.length})
        </h3>
        {regularTabs.map(tab => (
          <TabItem key={tab.id} tab={tab} />
        ))}
      </div>
    </div>
  );
}

// Separator with label
function SeparatorWithLabel({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <Separator />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

// Vertical separator in horizontal layout
function TabMetadata({ tab }: { tab: Tab }) {
  return (
    <div className="flex h-5 items-center space-x-2 text-sm text-muted-foreground">
      <span>{tab.windowId}</span>
      <Separator orientation="vertical" />
      <span>{tab.index}</span>
      <Separator orientation="vertical" />
      <span>{formatUrl(tab.url)}</span>
    </div>
  );
}

// Separator with custom styling
function ThemedSeparator() {
  return (
    <Separator className="my-6 bg-gradient-to-r from-transparent via-border to-transparent" />
  );
}
```

**Styling Options**:

```typescript
// Thick separator
<Separator className="h-px" /> // Default thin line
<Separator className="h-[2px]" /> // Thicker line

// Colored separator
<Separator className="bg-primary/20" />

// Dashed separator
<Separator className="border-t border-dashed border-border bg-transparent" />

// Gradient separator
<Separator className="bg-gradient-to-r from-transparent via-border to-transparent" />

// With spacing
<Separator className="my-4" /> // Vertical margin
<Separator className="mx-4" /> // Horizontal margin (for vertical)
```

**Best Practices**:

- Use `decorative={true}` (default) for visual-only separators
- Use `decorative={false}` for structural/semantic separators
- Add appropriate margins with className
- Match separator color with your theme
- Use vertical separators sparingly in horizontal layouts

**Accessibility**:

- Proper ARIA role from Radix UI
- `decorative` prop controls ARIA attributes
- Semantic separation for screen readers when non-decorative
- Respects user's contrast preferences

---

## Bonus Components for Tab List UI

### 5. Status Component (Advanced Badge Alternative)

**Purpose**: More sophisticated status indicators with animated pulsing dots.

**Installation**:

```bash
# This is from shadcn.io registry (not official shadcn/ui)
# Manual installation required
```

**Features**:

- Status Badge wrapper component
- Animated status indicator with pulse effect
- Pre-built status states: online, offline, maintenance, degraded
- Automatic label rendering

**Usage Pattern**:

```typescript
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status';

function TabStatus({ isOnline }: { isOnline: boolean }) {
  return (
    <Status status={isOnline ? 'online' : 'offline'}>
      <StatusIndicator />
      <StatusLabel />
    </Status>
  );
}
```

**Implementation for Tab Sync**:

```typescript
// Adapt status states for tab sync
type TabSyncStatus = 'syncing' | 'synced' | 'error' | 'paused';

function TabSyncStatus({ status }: { status: TabSyncStatus }) {
  const statusMap = {
    syncing: 'online',      // Green pulsing
    synced: 'online',       // Green solid
    error: 'offline',       // Red
    paused: 'maintenance',  // Blue
  };

  const labels = {
    syncing: 'Syncing',
    synced: 'Synced',
    error: 'Error',
    paused: 'Paused',
  };

  return (
    <Status status={statusMap[status] as any}>
      <StatusIndicator />
      <StatusLabel>{labels[status]}</StatusLabel>
    </Status>
  );
}
```

---

### 6. Pill Component (Enhanced Badge with Avatar Support)

**Purpose**: Rounded pill badges with built-in avatar, icon, and status indicator support.

**Installation**:

```bash
# This is from shadcn.io registry (not official shadcn/ui)
# Requires: avatar, badge, button components (you have these!)
# Manual installation of pill component required
```

**Features**:

- Pill base component (rounded Badge)
- PillAvatar - Small avatar for pills
- PillButton - Close/action buttons
- PillStatus - Status indicators
- PillIndicator - Colored dots (success, error, warning, info)
- PillAvatarGroup - Stacked avatars in pills

**Usage Pattern for Tab List**:

```typescript
import {
  Pill,
  PillAvatar,
  PillIndicator,
  PillButton,
} from '@/components/ui/pill';
import { XIcon } from 'lucide-react';

function TabPill({ tab, onRemove }: { tab: Tab; onRemove: () => void }) {
  return (
    <Pill variant="secondary">
      <PillAvatar
        src={tab.favIconUrl}
        fallback={tab.title[0]}
      />
      <span className="truncate max-w-[150px]">{tab.title}</span>
      <PillIndicator variant="success" pulse />
      <PillButton onClick={onRemove}>
        <XIcon className="h-3 w-3" />
      </PillButton>
    </Pill>
  );
}
```

---

## Complete Tab List Implementation Example

Here's a complete example combining all components:

```typescript
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { Badge } from '~/shared/components/ui/badge';
import { Separator } from '~/shared/components/ui/separator';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '~/shared/components/ui/avatar';
import { CheckIcon, GlobeIcon, AlertCircleIcon } from 'lucide-react';
import { cn } from '~/shared/lib/utils';

interface Tab {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  canSync: boolean;
  isSyncing: boolean;
  isSelected: boolean;
  unavailableReason?: string;
}

export function TabList({ tabs }: { tabs: Tab[] }) {
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());

  const syncingTabs = tabs.filter(t => t.isSyncing);
  const availableTabs = tabs.filter(t => !t.isSyncing && t.canSync);
  const unavailableTabs = tabs.filter(t => !t.canSync);

  return (
    <TooltipProvider>
      <div className="space-y-4 p-4">
        {/* Syncing Tabs Section */}
        {syncingTabs.length > 0 && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Currently Syncing
                </h3>
                <Badge variant="default" className="h-5">
                  {syncingTabs.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {syncingTabs.map(tab => (
                  <TabItem
                    key={tab.id}
                    tab={tab}
                    isSelected={selectedTabIds.has(tab.id)}
                    onToggle={() => {
                      setSelectedTabIds(prev => {
                        const next = new Set(prev);
                        if (next.has(tab.id)) {
                          next.delete(tab.id);
                        } else {
                          next.add(tab.id);
                        }
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            </div>

            <Separator className="my-4" />
          </>
        )}

        {/* Available Tabs Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Available Tabs
            </h3>
            <Badge variant="secondary" className="h-5">
              {availableTabs.length}
            </Badge>
          </div>
          <div className="space-y-1">
            {availableTabs.map(tab => (
              <TabItem
                key={tab.id}
                tab={tab}
                isSelected={selectedTabIds.has(tab.id)}
                onToggle={() => {
                  setSelectedTabIds(prev => {
                    const next = new Set(prev);
                    if (next.has(tab.id)) {
                      next.delete(tab.id);
                    } else {
                      next.add(tab.id);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>

        {/* Unavailable Tabs Section */}
        {unavailableTabs.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Unavailable
                </h3>
                <Badge variant="outline" className="h-5">
                  {unavailableTabs.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {unavailableTabs.map(tab => (
                  <UnavailableTabItem key={tab.id} tab={tab} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function TabItem({
  tab,
  isSelected,
  onToggle,
}: {
  tab: Tab;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md',
        'hover:bg-accent hover:text-accent-foreground',
        'transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        isSelected && 'bg-accent'
      )}
    >
      {/* Favicon */}
      <Avatar className="h-6 w-6 rounded-sm flex-shrink-0">
        <AvatarImage src={tab.favIconUrl} alt={`${tab.title} favicon`} />
        <AvatarFallback className="rounded-sm bg-muted">
          <GlobeIcon className="h-4 w-4 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>

      {/* Tab Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{tab.title}</span>
          {tab.isSyncing && (
            <Badge variant="default" className="h-5 gap-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Syncing
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{tab.url}</p>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="flex-shrink-0">
          <CheckIcon className="h-4 w-4 text-primary" />
        </div>
      )}
    </button>
  );
}

function UnavailableTabItem({ tab }: { tab: Tab }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-md',
            'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Favicon */}
          <Avatar className="h-6 w-6 rounded-sm flex-shrink-0">
            <AvatarImage src={tab.favIconUrl} alt={`${tab.title} favicon`} />
            <AvatarFallback className="rounded-sm bg-muted">
              <GlobeIcon className="h-4 w-4 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          {/* Tab Info */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{tab.title}</span>
              <Badge variant="outline" className="h-5 gap-1">
                <AlertCircleIcon className="h-3 w-3" />
                Unavailable
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{tab.url}</p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">
          {tab.unavailableReason || 'This tab cannot be synced'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
```

## Integration Checklist

- [x] Tooltip - Already installed, wrap list with `TooltipProvider`
- [x] Badge - Already installed, use for status indicators
- [x] Separator - Already installed, use between sections
- [ ] Avatar - **Install required** for favicon display
- [ ] Test accessibility with keyboard navigation
- [ ] Test with screen readers
- [ ] Verify color contrast ratios
- [ ] Test responsive behavior in popup dimensions

## Next Steps

1. **Install Avatar component**:

   ```bash
   pnpm dlx shadcn@latest add avatar
   ```

2. **Identify existing tab list component** in your popup

3. **Wrap with TooltipProvider** at the root of your tab list

4. **Replace favicon placeholders** with Avatar components

5. **Add status badges** for syncing/selected states

6. **Use separators** between tab groups (syncing vs available)

7. **Add tooltips** for unavailable tabs with explanatory text

8. **Test accessibility**:
   - Keyboard navigation (Tab, Enter, Escape)
   - Screen reader announcements
   - Focus indicators
   - Color contrast

## References

- [shadcn/ui Tooltip](https://ui.shadcn.com/docs/components/tooltip)
- [shadcn/ui Badge](https://ui.shadcn.com/docs/components/badge)
- [shadcn/ui Avatar](https://ui.shadcn.com/docs/components/avatar)
- [shadcn/ui Separator](https://ui.shadcn.com/docs/components/separator)
- [Radix UI Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
