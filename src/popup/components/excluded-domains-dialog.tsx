import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

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
import { cn } from '~/shared/lib/utils';

import IconArrowRight from '~icons/lucide/arrow-right';
import IconGlobe from '~icons/lucide/globe';
import IconPlus from '~icons/lucide/plus';
import IconX from '~icons/lucide/x';

type DomainErrorKey = 'invalidDomain' | 'domainAlreadyExcluded';

function domainToId(domain: string): string {
  return `excluded-domain-${domain.replace(/\./g, '-')}`;
}

interface ExcludedDomainsDialogProps {
  excludedDomains: Array<string>;
  onAddDomain: (input: string) => { success: boolean; domain?: string; error?: DomainErrorKey };
  onOpenChange: (open: boolean) => void;
  onPreviewDomain: (input: string) => { domain: string; isDuplicate: boolean } | null;
  onRemoveDomain: (domain: string) => void;
  open: boolean;
}

export function ExcludedDomainsDialog({
  excludedDomains,
  onAddDomain,
  onOpenChange,
  onPreviewDomain,
  onRemoveDomain,
  open,
}: ExcludedDomainsDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<DomainErrorKey | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => onPreviewDomain(inputValue), [inputValue, onPreviewDomain]);

  const selectedItemId =
    selectedDomain && excludedDomains.includes(selectedDomain)
      ? domainToId(selectedDomain)
      : undefined;

  useEffect(() => {
    if (!open) {
      setSelectedDomain(null);
      setInputValue('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectedDomain && !excludedDomains.includes(selectedDomain)) {
      setSelectedDomain(null);
    }
  }, [excludedDomains, selectedDomain]);

  useEffect(() => {
    if (selectedItemId) {
      const element = document.getElementById(selectedItemId);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedItemId]);

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

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Guard: skip during IME composition (CJK input)
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      switch (e.key) {
        case 'Enter': {
          if (selectedDomain) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          handleAdd();
          return;
        }
        case 'ArrowDown': {
          if (excludedDomains.length === 0) return;
          e.preventDefault();
          if (!selectedDomain) {
            setSelectedDomain(excludedDomains[0]);
          } else {
            const currentIndex = excludedDomains.indexOf(selectedDomain);
            if (currentIndex < excludedDomains.length - 1) {
              setSelectedDomain(excludedDomains[currentIndex + 1]);
            }
          }
          return;
        }
        case 'ArrowUp': {
          if (!selectedDomain || excludedDomains.length === 0) return;
          e.preventDefault();
          const currentIndex = excludedDomains.indexOf(selectedDomain);
          if (currentIndex <= 0) {
            setSelectedDomain(null);
          } else {
            setSelectedDomain(excludedDomains[currentIndex - 1]);
          }
          return;
        }
        case 'Backspace': {
          if (selectedDomain && inputRef.current?.value === '') {
            e.preventDefault();
            const currentIndex = excludedDomains.indexOf(selectedDomain);
            onRemoveDomain(selectedDomain);
            const remaining = excludedDomains.filter((d) => d !== selectedDomain);
            setSelectedDomain(
              remaining.length === 0
                ? null
                : remaining[Math.min(currentIndex, remaining.length - 1)],
            );
          }
          return;
        }
        case 'Delete': {
          if (selectedDomain) {
            e.preventDefault();
            const currentIndex = excludedDomains.indexOf(selectedDomain);
            onRemoveDomain(selectedDomain);
            const remaining = excludedDomains.filter((d) => d !== selectedDomain);
            setSelectedDomain(
              remaining.length === 0
                ? null
                : remaining[Math.min(currentIndex, remaining.length - 1)],
            );
          }
          return;
        }
        case 'Escape': {
          if (selectedDomain) {
            e.preventDefault();
            e.stopPropagation();
            setSelectedDomain(null);
          }
          return;
        }
        default: {
          if (selectedDomain && e.key.length === 1) {
            setSelectedDomain(null);
          }
        }
      }
    },
    [selectedDomain, excludedDomains, handleAdd, onRemoveDomain],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setError(null);
    setSelectedDomain(null);
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
                ref={inputRef}
                aria-activedescendant={selectedItemId}
                aria-controls={excludedDomains.length > 0 ? 'excluded-domains-list' : undefined}
                aria-expanded={excludedDomains.length > 0}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('addDomainPlaceholder')}
                role="combobox"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
              />
              <Button
                className="shrink-0"
                disabled={!inputValue.trim() || (preview?.isDuplicate ?? false)}
                size="sm"
                tabIndex={-1}
                variant="outline"
                onClick={handleAdd}
              >
                <IconPlus aria-hidden="true" className="w-4 h-4" />
                <span>{t('addDomain')}</span>
              </Button>
            </div>
            <AnimatePresence mode="wait">
              {error ? (
                <motion.p
                  key="error"
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
              ) : preview ? (
                <motion.div
                  key="preview"
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 text-xs"
                  exit={{ opacity: 0, y: -4 }}
                  initial={{ opacity: 0, y: -4 }}
                  transition={getMotionTransition(
                    ANIMATION_DURATIONS.fast,
                    EASING_FUNCTIONS.easeOut,
                  )}
                >
                  <IconArrowRight
                    aria-hidden="true"
                    className="w-3 h-3 text-muted-foreground shrink-0"
                  />
                  <span
                    className={
                      preview.isDuplicate ? 'text-destructive font-medium' : 'text-muted-foreground'
                    }
                  >
                    {preview.domain}
                  </span>
                  {preview.isDuplicate && (
                    <span className="text-destructive">&mdash; {t('domainAlreadyExcluded')}</span>
                  )}
                </motion.div>
              ) : null}
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
              <div
                aria-label={t('excludedDomainsDescription')}
                className="space-y-1.5"
                id="excluded-domains-list"
                role="listbox"
                tabIndex={-1}
              >
                <AnimatePresence initial={false}>
                  {excludedDomains.map((domain) => {
                    const isSelected = domain === selectedDomain;
                    return (
                      <motion.div
                        key={domain}
                        layout
                        animate={{ opacity: 1, height: 'auto' }}
                        aria-selected={isSelected}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors',
                          isSelected
                            ? 'border-ring bg-accent'
                            : 'border-border/50 hover:bg-muted/50',
                        )}
                        data-value={domain}
                        exit={{ opacity: 0, height: 0 }}
                        id={domainToId(domain)}
                        initial={{ opacity: 0, height: 0 }}
                        role="option"
                        transition={getMotionTransition(
                          ANIMATION_DURATIONS.fast,
                          EASING_FUNCTIONS.easeOut,
                        )}
                        onClick={() => {
                          setSelectedDomain(isSelected ? null : domain);
                          inputRef.current?.focus();
                        }}
                        onPointerMove={() => {
                          if (!isSelected) setSelectedDomain(domain);
                        }}
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
                          tabIndex={-1}
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveDomain(domain);
                          }}
                        >
                          <IconX aria-hidden="true" className="w-3.5 h-3.5" />
                        </Button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
