import { useState, useRef, useEffect } from 'react';

import { ChevronDown, ChevronUp, Link, Maximize2, Minimize2, Monitor, Square } from 'lucide-react';
import { motion, useMotionValue, animate } from 'motion/react';
import { sendMessage } from 'webext-bridge/content-script';

import { t } from '~/shared/i18n';

import { getCurrentSyncGroup, isCurrentlySyncing } from '../features/scrollSync';

import type { SyncGroup } from '~/shared/types';

interface ControlPanelProps {
  initialPosition?: { x: number; y: number };
}

export function ControlPanel({ initialPosition = { x: 20, y: 20 } }: ControlPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLinkedSitesExpanded, setIsLinkedSitesExpanded] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<SyncGroup | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(initialPosition.x);
  const y = useMotionValue(initialPosition.y);

  // Update state when sync status changes
  useEffect(() => {
    const interval = setInterval(() => {
      const group = getCurrentSyncGroup();
      setCurrentGroup(group);
      setIsSyncing(isCurrentlySyncing());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Edge snapping logic
  const handleDragEnd = () => {
    if (!panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const SNAP_DISTANCE = 50;
    const EDGE_PADDING = 20;

    let targetX = rect.left;
    let targetY = rect.top;

    // Snap to left edge
    if (rect.left < SNAP_DISTANCE) {
      targetX = EDGE_PADDING;
    }
    // Snap to right edge
    else if (rect.right > windowWidth - SNAP_DISTANCE) {
      targetX = windowWidth - rect.width - EDGE_PADDING;
    }

    // Keep within vertical bounds
    if (rect.top < EDGE_PADDING) {
      targetY = EDGE_PADDING;
    } else if (rect.bottom > windowHeight - EDGE_PADDING) {
      targetY = windowHeight - rect.height - EDGE_PADDING;
    }

    // Animate to snapped position with ease-out-quad
    animate(x, targetX, {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quad
    });
    animate(y, targetY, {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quad
    });
  };

  const handleMinimizeToggle = () => {
    setIsMinimized(!isMinimized);
    if (isMinimized) {
      setIsLinkedSitesExpanded(false);
    }
  };

  const handleStopSync = async () => {
    if (currentGroup) {
      await sendMessage('stop-sync', { groupId: currentGroup.id }, 'background');
    }
  };

  const handleSwitchTab = async (tabId: number) => {
    // Switch to the selected tab
    // Note: Content scripts cannot directly access tabs API
    // We need to send a message to the background script
    await sendMessage('switch-tab', { tabId }, 'background');
  };

  if (isMinimized) {
    return (
      <motion.div
        ref={panelRef}
        drag
        animate={{ scale: 1 }}
        className="fixed w-[30px] h-[30px] bg-background border border-border rounded-lg shadow-lg flex items-center justify-center cursor-move hover:border-primary transition-colors"
        dragMomentum={false}
        initial={{ scale: 0 }}
        style={{ x, y }}
        transition={{
          duration: 0.25,
          ease: [0.16, 1, 0.3, 1], // ease-out-cubic
        }}
        onDragEnd={handleDragEnd}
      >
        <button
          aria-label={t('controlPanel.maximize')}
          className="w-full h-full flex items-center justify-center hover:bg-accent rounded-lg transition-colors"
          onClick={handleMinimizeToggle}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={panelRef}
      drag
      animate={{ opacity: 1, scale: 1 }}
      className="fixed bg-background border border-border rounded-lg shadow-xl"
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.95 }}
      style={{ x, y }}
      transition={{
        duration: 0.3,
        ease: [0.19, 1, 0.22, 1], // ease-out-expo
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border cursor-move">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{t('controlPanel.title')}</span>
        </div>
        <button
          aria-label={t('controlPanel.minimize')}
          className="p-1 hover:bg-accent rounded transition-colors"
          onClick={handleMinimizeToggle}
        >
          <Minimize2 className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Sync Status */}
        {isSyncing && currentGroup ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t('popup.status.syncing', { count: currentGroup.tabs.length })}
              </span>
              <div className="flex items-center gap-1">
                {currentGroup.urlSync && (
                  <Link aria-label={t('popup.urlSync.enabled')} className="w-3 h-3 text-primary" />
                )}
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
            </div>

            <button
              className="w-full px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-xs font-medium hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
              onClick={handleStopSync}
            >
              <Square className="w-3 h-3" />
              {t('controlPanel.stopSync')}
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground">{t('controlPanel.notSyncing')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('controlPanel.usePopup')}</p>
          </div>
        )}

        {/* Linked Sites */}
        {isSyncing && currentGroup && currentGroup.tabs.length > 0 && (
          <div className="border-t border-border pt-2">
            <button
              className="w-full flex items-center justify-between text-xs font-medium hover:bg-accent rounded px-2 py-1 transition-colors"
              onClick={() => setIsLinkedSitesExpanded(!isLinkedSitesExpanded)}
            >
              <span>{t('controlPanel.linkedSites', { count: currentGroup.tabs.length })}</span>
              {isLinkedSitesExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {isLinkedSitesExpanded && (
              <motion.div
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-2 space-y-1 max-h-[200px] overflow-y-auto"
                initial={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {currentGroup.tabs.map((tabId) => (
                  <button
                    key={tabId}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded transition-colors truncate"
                    onClick={() => handleSwitchTab(tabId)}
                  >
                    Tab {tabId}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Sync Mode Indicator */}
        {isSyncing && currentGroup && (
          <div className="text-xs text-center text-muted-foreground border-t border-border pt-2">
            {t('controlPanel.mode')}:{' '}
            {currentGroup.syncMode === 'ratio'
              ? t('controlPanel.syncMode.ratio')
              : t('controlPanel.syncMode.element')}
          </div>
        )}
      </div>
    </motion.div>
  );
}
