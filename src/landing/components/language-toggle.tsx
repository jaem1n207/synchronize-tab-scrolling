import { motion } from 'motion/react';

import { useLocale } from '~/landing/lib/i18n';
import type { Locale } from '~/landing/lib/i18n';
import { Button } from '~/shared/components/ui/button';

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
        aria-label={`${LOCALE_LABEL[locale]}: Switch language`}
        className="font-semibold tabular-nums"
        data-umami-event="language-toggle"
        size="sm"
        variant="ghost"
        onClick={toggle}
      >
        {LOCALE_LABEL[locale]}
      </Button>
    </motion.div>
  );
}
