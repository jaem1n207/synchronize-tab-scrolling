import { useState, useCallback } from 'react';

import { AnimatePresence, motion } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/shared/components/ui/dialog';
import { ScrollArea } from '~/shared/components/ui/scroll-area';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
} from '~/shared/lib/animations';

import IconGlobe from '~icons/lucide/globe';
import IconPlus from '~icons/lucide/plus';
import IconX from '~icons/lucide/x';

type DomainErrorKey = 'invalidDomain' | 'domainAlreadyExcluded';

interface ExcludedDomainsDialogProps {
  excludedDomains: Array<string>;
  onAddDomain: (input: string) => { success: boolean; domain?: string; error?: DomainErrorKey };
  onOpenChange: (open: boolean) => void;
  onRemoveDomain: (domain: string) => void;
  open: boolean;
}

export function ExcludedDomainsDialog({
  excludedDomains,
  onAddDomain,
  onOpenChange,
  onRemoveDomain,
  open,
}: ExcludedDomainsDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<DomainErrorKey | null>(null);

  const handleAdd = useCallback(() => {
    if (!inputValue.trim()) return;

    const result = onAddDomain(inputValue);
    if (result.success) {
      setInputValue('');
      setError(null);
    } else if (result.error) {
      setError(result.error);
    }
  }, [inputValue, onAddDomain]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setError(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('manageExcludedDomains')}</DialogTitle>
          <DialogDescription>{t('excludedDomainsDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('addDomainPlaceholder')}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <Button
                className="shrink-0"
                disabled={!inputValue.trim()}
                size="sm"
                variant="outline"
                onClick={handleAdd}
              >
                <IconPlus aria-hidden="true" className="w-4 h-4" />
                <span>{t('addDomain')}</span>
              </Button>
            </div>
            <AnimatePresence>
              {error && (
                <motion.p
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive"
                  exit={{ opacity: 0, y: -4 }}
                  initial={{ opacity: 0, y: -4 }}
                  transition={getMotionTransition(
                    ANIMATION_DURATIONS.fast,
                    EASING_FUNCTIONS.easeOut,
                  )}
                >
                  {t(error)}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {excludedDomains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <IconGlobe aria-hidden="true" className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">{t('noExcludedDomains')}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {t('noExcludedDomainsDescription')}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[240px]">
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {excludedDomains.map((domain) => (
                    <motion.div
                      key={domain}
                      layout
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 hover:bg-muted/50 transition-colors"
                      exit={{ opacity: 0, height: 0 }}
                      initial={{ opacity: 0, height: 0 }}
                      transition={getMotionTransition(
                        ANIMATION_DURATIONS.fast,
                        EASING_FUNCTIONS.easeOut,
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <IconGlobe
                          aria-hidden="true"
                          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                        />
                        <span className="text-sm truncate">{domain}</span>
                      </div>
                      <Button
                        aria-label={t('removeDomainAriaLabel', domain)}
                        className="shrink-0 h-7 w-7"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveDomain(domain)}
                      >
                        <IconX aria-hidden="true" className="w-3.5 h-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
