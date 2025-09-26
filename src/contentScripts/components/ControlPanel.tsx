import { useState, useRef, useEffect } from 'react';

import { Monitor, X } from 'lucide-react';
import { motion, useMotionValue, animate } from 'motion/react';
import { sendMessage, onMessage } from 'webext-bridge/content-script';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '~/shared/components/ui/command';
import { t } from '~/shared/i18n';

import { getCurrentSyncGroup, isCurrentlySyncing } from '../features/scrollSync';

import type { SyncGroup } from '~/shared/types';

interface ControlPanelProps {
  initialPosition?: { x: number; y: number };
}

export function ControlPanel({ initialPosition = { x: 20, y: 20 } }: ControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<SyncGroup | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tabs, setTabs] = useState<Array<{ id: number; title: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(initialPosition.x);
  const y = useMotionValue(initialPosition.y);

  // Initialize state from current sync status
  useEffect(() => {
    const group = getCurrentSyncGroup();
    if (group && isCurrentlySyncing()) {
      setCurrentGroup(group);
      setIsSyncing(true);

      // Get tab info immediately
      if (group.tabs.length > 0) {
        Promise.all(
          group.tabs.map(async (tabId) => {
            try {
              const response = await sendMessage('get-tab-info', { tabId }, 'background');
              return response as { id: number; title: string };
            } catch {
              return { id: tabId, title: `Tab ${tabId}` };
            }
          }),
        ).then(setTabs);
      }
    } else {
      // If no sync group or not syncing, ensure state is cleared
      setCurrentGroup(null);
      setIsSyncing(false);
      setTabs([]);
    }
  }, []);

  // Listen for sync status changes
  useEffect(() => {
    const handleSyncStarted = ({
      data,
    }: {
      data: { group: SyncGroup; showControlPanel?: boolean };
    }) => {
      // Update state based on the sync-started message
      setCurrentGroup(data.group);
      setIsSyncing(true);

      // Get tab info
      if (data.group.tabs.length > 0) {
        Promise.all(
          data.group.tabs.map(async (tabId) => {
            try {
              const response = await sendMessage('get-tab-info', { tabId }, 'background');
              return response as { id: number; title: string };
            } catch {
              return { id: tabId, title: `Tab ${tabId}` };
            }
          }),
        ).then(setTabs);
      }
    };

    const handleSyncStopped = () => {
      // Clear state when sync stops
      setCurrentGroup(null);
      setIsSyncing(false);
      setTabs([]);
    };

    // Register listeners
    onMessage('sync-started', handleSyncStarted);
    onMessage('sync-stopped', handleSyncStopped);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Handle edge snapping for drag
  const handleDragEnd = () => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const SNAP_DISTANCE = 50;
    const EDGE_PADDING = 20;

    let targetX = rect.left;
    let targetY = rect.top;

    // Snap to edges
    if (rect.left < SNAP_DISTANCE) {
      targetX = EDGE_PADDING;
    } else if (rect.right > windowWidth - SNAP_DISTANCE) {
      targetX = windowWidth - rect.width - EDGE_PADDING;
    }

    if (rect.top < EDGE_PADDING) {
      targetY = EDGE_PADDING;
    } else if (rect.bottom > windowHeight - EDGE_PADDING) {
      targetY = windowHeight - rect.height - EDGE_PADDING;
    }

    // Animate to snapped position
    animate(x, targetX, {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quad
    });
    animate(y, targetY, {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quad
    });
  };

  const handleStopSync = async () => {
    if (currentGroup) {
      await sendMessage('stop-sync', { groupId: currentGroup.id }, 'background');
      setIsOpen(false);
    }
  };

  const handleSwitchTab = async (tabId: number) => {
    await sendMessage('switch-tab', { tabId }, 'background');
  };

  const handleToggleUrlSync = async () => {
    if (currentGroup) {
      await sendMessage(
        'toggle-url-sync',
        {
          groupId: currentGroup.id,
          enabled: !currentGroup.urlSync,
        },
        'background',
      );
    }
  };

  const handleChangeSyncMode = async (mode: 'ratio' | 'element') => {
    if (currentGroup) {
      await sendMessage(
        'update-sync-mode',
        {
          groupId: currentGroup.id,
          mode,
        },
        'background',
      );
    }
  };

  // Calculate command position based on button position
  const getCommandPosition = () => {
    if (!buttonRef.current) return { top: 50, left: 50 };

    const rect = buttonRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const commandWidth = 320;
    const commandHeight = 400;

    let commandX = rect.left;
    let commandY = rect.bottom + 10;

    // Adjust if it would go off screen
    if (commandX + commandWidth > windowWidth) {
      commandX = windowWidth - commandWidth - 20;
    }
    if (commandY + commandHeight > windowHeight) {
      commandY = rect.top - commandHeight - 10;
    }

    return { left: commandX, top: commandY };
  };

  const commandPosition = getCommandPosition();

  return (
    <>
      {/* Persistent Toggle Button */}
      <motion.button
        ref={buttonRef}
        drag
        animate={{ scale: 1 }}
        aria-label={isSyncing ? t('controlPanel.stopSync') : t('controlPanel.openPanel')}
        className="fixed w-[30px] h-[30px] bg-background border border-border rounded-lg shadow-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
        dragMomentum={false}
        initial={{ scale: 0 }}
        style={{
          x,
          y,
          pointerEvents: 'auto',
        }}
        transition={{
          duration: 0.25,
          ease: [0.16, 1, 0.3, 1], // ease-out-cubic
        }}
        onClick={() => {
          if (!isDragging) {
            setIsOpen(!isOpen);
          }
        }}
        onDragEnd={() => {
          handleDragEnd();
          // Delay to prevent click after drag
          setTimeout(() => setIsDragging(false), 100);
        }}
        onDragStart={() => setIsDragging(true)}
      >
        {isSyncing ? (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        ) : (
          <Monitor className="w-4 h-4" />
        )}
      </motion.button>

      {/* Command UI Panel */}
      {isOpen && (
        <motion.div
          ref={commandRef}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed bg-background border border-border rounded-lg shadow-xl w-[320px] max-h-[400px] overflow-hidden"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 0.95 }}
          style={{
            ...commandPosition,
            pointerEvents: 'auto',
          }}
          transition={{
            duration: 0.2,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <Command className="rounded-lg border-none">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{t('controlPanel.title')}</span>
              </div>
              <button
                aria-label={t('controlPanel.close')}
                className="p-1 hover:bg-accent rounded transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {isSyncing && currentGroup ? (
              <>
                <CommandInput placeholder={t('controlPanel.searchActions')} />
                <CommandList>
                  <CommandEmpty>{t('controlPanel.noActionsFound')}</CommandEmpty>

                  {/* Sync Status */}
                  <CommandGroup heading={t('controlPanel.syncStatus')}>
                    <CommandItem disabled>
                      <Monitor className="mr-2 h-4 w-4" />
                      <span className="text-xs">
                        {t('popup.status.syncing', { count: currentGroup.tabs.length })}
                      </span>
                      <div className="ml-auto w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </CommandItem>
                  </CommandGroup>

                  <CommandSeparator />

                  {/* Linked Tabs */}
                  <CommandGroup heading={t('controlPanel.linkedSites', { count: tabs.length })}>
                    {tabs.map((tab) => (
                      <CommandItem key={tab.id} onSelect={() => handleSwitchTab(tab.id)}>
                        <span className="text-xs truncate">{tab.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>

                  <CommandSeparator />

                  {/* Sync Options */}
                  <CommandGroup heading={t('controlPanel.syncOptions')}>
                    <CommandItem onSelect={() => handleChangeSyncMode('ratio')}>
                      <span
                        className={`text-xs ${currentGroup.syncMode === 'ratio' ? 'font-semibold' : ''}`}
                      >
                        {t('controlPanel.syncMode.ratio')}
                      </span>
                      {currentGroup.syncMode === 'ratio' && (
                        <span className="ml-auto text-xs text-primary">✓</span>
                      )}
                    </CommandItem>
                    <CommandItem onSelect={() => handleChangeSyncMode('element')}>
                      <span
                        className={`text-xs ${currentGroup.syncMode === 'element' ? 'font-semibold' : ''}`}
                      >
                        {t('controlPanel.syncMode.element')}
                      </span>
                      {currentGroup.syncMode === 'element' && (
                        <span className="ml-auto text-xs text-primary">✓</span>
                      )}
                    </CommandItem>
                    <CommandItem onSelect={handleToggleUrlSync}>
                      <span className="text-xs">
                        {currentGroup.urlSync
                          ? t('popup.urlSync.disable')
                          : t('popup.urlSync.enable')}
                      </span>
                      {currentGroup.urlSync && (
                        <span className="ml-auto text-xs text-primary">✓</span>
                      )}
                    </CommandItem>
                  </CommandGroup>

                  <CommandSeparator />

                  {/* Actions */}
                  <CommandGroup heading={t('controlPanel.actions')}>
                    <CommandItem className="text-destructive" onSelect={handleStopSync}>
                      <span className="text-xs font-medium">{t('controlPanel.stopSync')}</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('controlPanel.notSyncing')}</p>
                <p className="text-xs text-muted-foreground">{t('controlPanel.usePopup')}</p>
              </div>
            )}
          </Command>
        </motion.div>
      )}
    </>
  );
}
