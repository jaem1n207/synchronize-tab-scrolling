import { useState, useCallback } from 'react';

import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
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

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
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

            return (
              <Button
                key={tab.id}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={`${tab.title} - ${status}${isCurrent ? ' (current tab)' : ''}`}
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
                <span className="flex-1 text-left truncate text-sm">{tab.title}</span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
