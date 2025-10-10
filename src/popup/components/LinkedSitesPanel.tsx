import { useState, useCallback, useEffect } from 'react';

import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
import { loadManualScrollOffsets, clearManualScrollOffset } from '~/shared/lib/storage';
import { cn } from '~/shared/lib/utils';

import { StatusIndicator } from './StatusIndicator';

import type { TabInfo, ConnectionStatus } from '../types';

interface LinkedSitesPanelProps {
  linkedTabs: Array<TabInfo>;
  connectionStatuses: Record<number, ConnectionStatus>;
  currentTabId?: number;
  onSwitchToTab: (tabId: number) => void;
}

export function LinkedSitesPanel({
  linkedTabs,
  connectionStatuses,
  currentTabId,
  onSwitchToTab,
}: LinkedSitesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [manualOffsets, setManualOffsets] = useState<Record<number, number>>({});

  // Load manual scroll offsets on mount and when linked tabs change
  useEffect(() => {
    const loadOffsets = async () => {
      const offsets = await loadManualScrollOffsets();
      setManualOffsets(offsets);
    };
    loadOffsets();
  }, [linkedTabs]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleResetOffset = useCallback(async (tabId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent tab switch
    await clearManualScrollOffset(tabId);
    // Reload offsets
    const offsets = await loadManualScrollOffsets();
    setManualOffsets(offsets);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  if (linkedTabs.length === 0) {
    return null;
  }

  return (
    <div className="border-t pt-3">
      <button
        aria-controls="linked-sites-content"
        aria-expanded={isExpanded}
        className="flex items-center justify-between w-full px-1 py-2 text-sm font-medium hover:bg-accent rounded-md transition-colors duration-200"
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <span>Linked Sites ({linkedTabs.length})</span>
        {isExpanded ? (
          <ChevronUp aria-hidden="true" className="w-4 h-4" />
        ) : (
          <ChevronDown aria-hidden="true" className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div
          aria-label="Linked synchronized tabs"
          className="mt-2 space-y-2"
          id="linked-sites-content"
          role="region"
        >
          {linkedTabs.map((tab) => {
            const status = connectionStatuses[tab.id] || 'disconnected';
            const isCurrent = tab.id === currentTabId;
            const offset = manualOffsets[tab.id];
            const hasOffset = offset !== undefined && offset !== 0;

            return (
              <div key={tab.id} className="relative">
                <Button
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`${tab.title} - ${status}${isCurrent ? ' (current tab)' : ''}${hasOffset ? ` - offset: ${offset > 0 ? '+' : ''}${Math.round(offset)}px` : ''}`}
                  className={cn(
                    'w-full justify-start gap-3 h-auto py-2 px-3 transition-colors duration-200',
                    isCurrent && 'bg-accent',
                  )}
                  disabled={isCurrent}
                  variant="ghost"
                  onClick={() => !isCurrent && onSwitchToTab(tab.id)}
                >
                  <StatusIndicator status={status} />
                  {tab.favIconUrl && (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="w-4 h-4 shrink-0"
                      src={tab.favIconUrl}
                    />
                  )}
                  <div className="flex-1 flex flex-col items-start gap-1">
                    <span className="text-left truncate text-sm w-full">{tab.title}</span>
                    {hasOffset && (
                      <span className="text-xs text-muted-foreground">
                        Offset: {offset > 0 ? '+' : ''}
                        {Math.round(offset)}px
                      </span>
                    )}
                  </div>
                  {hasOffset && (
                    <Button
                      aria-label={`Reset scroll offset for ${tab.title}`}
                      className="h-6 w-6 p-0 shrink-0"
                      size="icon"
                      variant="ghost"
                      onClick={(e) => handleResetOffset(tab.id, e)}
                    >
                      <RotateCcw aria-hidden="true" className="h-3 w-3" />
                    </Button>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
