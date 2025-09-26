import { useState, useEffect } from 'react';

import { Info, Play, Square, Link, Unlink, Globe, Hash } from 'lucide-react';
import { sendMessage } from 'webext-bridge/popup';

import { Button } from '~/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/shared/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { t } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';

import type { SyncTab, SyncGroup, SyncMode } from '~/shared/types';

const logger = new ExtensionLogger({ scope: 'popup-tab-list' });

export function TabList() {
  const [tabs, setTabs] = useState<SyncTab[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<number>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<SyncGroup | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('ratio');
  const [urlSync, setUrlSync] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch tabs on mount
  useEffect(() => {
    loadTabs();
    loadSyncState();
  }, []);

  const loadTabs = async () => {
    try {
      logger.info('Sending get-tabs message to background...');
      const tabList = await sendMessage('get-tabs', undefined, 'background');
      logger.info('Received tabs:', tabList);
      setTabs(tabList);
    } catch (error) {
      logger.error('Failed to load tabs', error);
      // Log more details about the error
      if (error instanceof Error) {
        logger.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSyncState = async () => {
    try {
      logger.info('Sending get-sync-state message to background...');
      const state = await sendMessage('get-sync-state', undefined, 'background');
      logger.info('Received sync state:', state);
      if (state.activeGroupId && state.groups.length > 0) {
        const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
        if (activeGroup) {
          setCurrentGroup(activeGroup);
          setIsSyncing(true);
          setSyncMode(activeGroup.syncMode);
          setUrlSync(activeGroup.urlSync);
          setSelectedTabs(new Set(activeGroup.tabs));
        }
      }
    } catch (error) {
      logger.error('Failed to load sync state', error);
      if (error instanceof Error) {
        logger.error('Sync state error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
    }
  };

  const handleTabSelect = (tabId: number) => {
    if (isSyncing) return; // Don't allow changes while syncing

    const newSelected = new Set(selectedTabs);
    if (newSelected.has(tabId)) {
      newSelected.delete(tabId);
    } else {
      newSelected.add(tabId);
    }
    setSelectedTabs(newSelected);
  };

  const handleStartSync = async () => {
    if (selectedTabs.size < 2) return;

    try {
      const tabIds = Array.from(selectedTabs);
      const group = await sendMessage(
        'create-sync-group',
        {
          tabIds,
          syncMode,
          urlSync,
        },
        'background',
      );

      setCurrentGroup(group);
      setIsSyncing(true);
      logger.info('Sync started', { group });
    } catch (error) {
      logger.error('Failed to start sync', error);
    }
  };

  const handleStopSync = async () => {
    if (!currentGroup) return;

    try {
      await sendMessage('stop-sync', { groupId: currentGroup.id }, 'background');
      setCurrentGroup(null);
      setIsSyncing(false);
      logger.info('Sync stopped');
    } catch (error) {
      logger.error('Failed to stop sync', error);
    }
  };

  const handleSyncModeChange = async (mode: SyncMode) => {
    setSyncMode(mode);
    if (currentGroup && isSyncing) {
      try {
        await sendMessage('update-sync-mode', { groupId: currentGroup.id, mode }, 'background');
      } catch (error) {
        logger.error('Failed to update sync mode', error);
      }
    }
  };

  const handleUrlSyncToggle = async () => {
    const newUrlSync = !urlSync;
    setUrlSync(newUrlSync);
    if (currentGroup && isSyncing) {
      try {
        await sendMessage(
          'toggle-url-sync',
          { groupId: currentGroup.id, enabled: newUrlSync },
          'background',
        );
      } catch (error) {
        logger.error('Failed to toggle URL sync', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const eligibleTabs = tabs.filter((tab) => tab.isEligible);
  const canStartSync = selectedTabs.size >= 2 && !isSyncing;

  return (
    <div aria-label={t('popup.title')} className="w-[400px] p-4 space-y-4" role="application">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t('popup.title')}</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs" side="left">
              <p>{t('popup.selectTabs')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Controls */}
      <div className="space-y-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <Select
            disabled={isSyncing}
            value={syncMode}
            onValueChange={(value) => handleSyncModeChange(value as SyncMode)}
          >
            <SelectTrigger aria-label={t('popup.syncMode.label')} className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ratio">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  <span>{t('popup.syncMode.ratio')}</span>
                </div>
              </SelectItem>
              <SelectItem value="element">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>{t('popup.syncMode.element')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={urlSync ? t('popup.urlSync.enabled') : t('popup.urlSync.disabled')}
                  disabled={isSyncing}
                  size="icon"
                  variant={urlSync ? 'default' : 'outline'}
                  onClick={handleUrlSyncToggle}
                >
                  {urlSync ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{urlSync ? t('popup.urlSync.enabled') : t('popup.urlSync.disabled')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Button
          className="w-full"
          disabled={!canStartSync && !isSyncing}
          variant={isSyncing ? 'destructive' : 'default'}
          onClick={isSyncing ? handleStopSync : handleStartSync}
        >
          {isSyncing ? (
            <>
              <Square className="mr-2 h-4 w-4" />
              {t('popup.stopSync')}
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              {t('popup.startSync')}
            </>
          )}
        </Button>

        {!isSyncing && selectedTabs.size < 2 && (
          <p className="text-xs text-muted-foreground text-center">
            {t('popup.tabSelection.minimum')}
          </p>
        )}
      </div>

      {/* Tab List */}
      <section aria-label="Available tabs" className="space-y-2 max-h-[400px] overflow-y-auto">
        {eligibleTabs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('popup.tabSelection.noEligible')}</p>
            <p className="text-xs mt-2">{t('popup.tabSelection.openPages')}</p>
          </div>
        ) : (
          eligibleTabs.map((tab) => (
            <TabItem
              key={tab.id}
              disabled={isSyncing}
              isSelected={selectedTabs.has(tab.id)}
              tab={tab}
              onSelect={handleTabSelect}
            />
          ))
        )}

        {/* Show ineligible tabs if any */}
        {tabs.filter((tab) => !tab.isEligible).length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              {t('popup.tabSelection.restricted')}
            </p>
            {tabs
              .filter((tab) => !tab.isEligible)
              .map((tab) => (
                <TabItem
                  key={tab.id}
                  disabled={true}
                  isSelected={false}
                  showReason={true}
                  tab={tab}
                  onSelect={() => {}}
                />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface TabItemProps {
  tab: SyncTab;
  isSelected: boolean;
  onSelect: (tabId: number) => void;
  disabled: boolean;
  showReason?: boolean;
}

function TabItem({ tab, isSelected, onSelect, disabled, showReason = false }: TabItemProps) {
  const handleClick = () => {
    if (!disabled && tab.isEligible) {
      onSelect(tab.id);
    }
  };

  return (
    <div
      aria-disabled={disabled || !tab.isEligible}
      aria-label={`${tab.title} - ${isSelected ? 'Selected' : 'Not selected'}`}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        tab.isEligible && !disabled
          ? 'hover:bg-accent cursor-pointer'
          : 'opacity-50 cursor-not-allowed'
      } ${isSelected ? 'bg-accent border-primary' : 'border-border'}`}
      role="button"
      tabIndex={disabled || !tab.isEligible ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="mt-0.5">
        <input
          aria-label={`Select ${tab.title}`}
          checked={isSelected}
          className="rounded border-border"
          disabled={disabled || !tab.isEligible}
          type="checkbox"
          onChange={() => {}}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {tab.favicon && <img alt="" className="w-4 h-4 flex-shrink-0" src={tab.favicon} />}
          <p className="font-medium text-sm truncate">{tab.title}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-1">{tab.url}</p>
        {showReason && tab.ineligibilityReason && (
          <p className="text-xs text-destructive mt-1">{tab.ineligibilityReason}</p>
        )}
      </div>
    </div>
  );
}
