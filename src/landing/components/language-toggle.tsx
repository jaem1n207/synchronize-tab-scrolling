import { motion } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { useLocale } from '~/landing/lib/i18n';

import type { Locale } from '~/landing/lib/i18n';

const NEXT_LOCALE: Record<Locale, Locale> = {
  en: 'ko',
  ko: 'en',
};

const LOCALE_LABEL: Record<Locale, string> = {
  en: 'EN',
  ko: 'KO',
};

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  const toggle = useCallback(() => {
    setLocale(NEXT_LOCALE[locale]);
  }, [locale, setLocale]);

  return (
    <motion.div whileTap={{ scale: 0.92 }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-label="Switch language"
        data-umami-event="language-toggle"
        className="font-semibold tabular-nums"
      >
        {LOCALE_LABEL[locale]}
      </Button>
    </motion.div>
  );
}
