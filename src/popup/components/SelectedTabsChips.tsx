import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Avatar, AvatarFallback, AvatarImage } from '~/shared/components/ui/avatar';
import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  motionVariants,
} from '~/shared/lib/animations';

import type { TabInfo } from '../types';

interface SelectedTabsChipsProps {
  tabs: Array<TabInfo>;
  isSyncActive: boolean;
  onRemoveTab: (tabId: number) => void;
}

export function SelectedTabsChips({ tabs, isSyncActive, onRemoveTab }: SelectedTabsChipsProps) {
  return (
    <div className="h-[64px] overflow-y-auto border rounded-lg p-2 bg-muted/30">
      {tabs.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-xs text-muted-foreground">{t('selectTwoOrMoreTabs')}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => (
              <motion.div
                key={tab.id}
                layout
                animate={motionVariants.scale.animate}
                exit={motionVariants.scale.exit}
                initial={motionVariants.scale.initial}
                transition={getMotionTransition(
                  ANIMATION_DURATIONS.fast,
                  EASING_FUNCTIONS.easeOutCubic,
                )}
              >
                <Badge
                  className="flex items-center gap-1.5 pr-1 py-1 max-w-[200px]"
                  variant="secondary"
                >
                  <Avatar className="w-4 h-4 shrink-0">
                    <AvatarImage alt="" src={tab.favIconUrl} />
                    <AvatarFallback className="bg-muted text-[8px] text-muted-foreground">
                      ?
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate flex-1">{tab.title}</span>
                  <Button
                    aria-label={
                      isSyncActive
                        ? t('cannotRemoveTabDuringSync', [tab.title])
                        : t('removeTab', [tab.title])
                    }
                    className="h-4 w-4 p-0 hover:bg-muted rounded-sm shrink-0"
                    disabled={isSyncActive}
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      if (!isSyncActive) {
                        e.stopPropagation();
                        onRemoveTab(tab.id);
                      }
                    }}
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </Button>
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
