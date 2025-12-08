import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Avatar, AvatarFallback, AvatarImage } from '~/shared/components/ui/avatar';
import { Badge } from '~/shared/components/ui/badge';
import { ScrollArea } from '~/shared/components/ui/scroll-area';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  motionVariants,
} from '~/shared/lib/animations';

import type { TabInfo, ConnectionStatus } from '../types';

interface SyncStatusHeaderProps {
  isActive: boolean;
  connectedTabs: Array<number>;
  connectionStatuses: Record<number, ConnectionStatus>;
  tabs: Array<TabInfo>;
}

export function SyncStatusHeader({
  isActive,
  connectedTabs,
  connectionStatuses,
  tabs,
}: SyncStatusHeaderProps) {
  const connectedTabsInfo = tabs.filter((tab) => connectedTabs.includes(tab.id));

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          animate={motionVariants.slideDown.animate}
          className="border rounded-lg p-3 bg-muted/30"
          exit={motionVariants.slideDown.exit}
          initial={motionVariants.slideDown.initial}
          transition={getMotionTransition(ANIMATION_DURATIONS.normal, EASING_FUNCTIONS.easeOut)}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className="flex items-center gap-1.5" variant="default">
                <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin" />
                <span>{t('syncingTabs', [String(connectedTabs.length)])}</span>
              </Badge>
            </div>
          </div>

          {connectedTabsInfo.length > 0 && (
            <ScrollArea className="h-[80px]">
              <div className="flex flex-col gap-1.5">
                {connectedTabsInfo.map((tab) => {
                  const status = connectionStatuses[tab.id] || 'connecting';
                  const isConnected = status === 'connected';
                  const isError = status === 'error' || status === 'disconnected';

                  return (
                    <div
                      key={tab.id}
                      className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50"
                    >
                      <Avatar className="w-4 h-4 shrink-0">
                        <AvatarImage alt="" src={tab.favIconUrl} />
                        <AvatarFallback className="bg-muted text-[8px] text-muted-foreground">
                          ?
                        </AvatarFallback>
                      </Avatar>

                      <span className="truncate flex-1" title={tab.title}>
                        {tab.title}
                      </span>

                      {isConnected && (
                        <CheckCircle2
                          aria-label={t('connected')}
                          className="w-3 h-3 shrink-0 text-green-600"
                        />
                      )}
                      {isError && (
                        <XCircle
                          aria-label={t('disconnected')}
                          className="w-3 h-3 shrink-0 text-destructive"
                        />
                      )}
                      {status === 'connecting' && (
                        <Loader2
                          aria-label={t('connecting')}
                          className="w-3 h-3 shrink-0 animate-spin text-muted-foreground"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
