import { useLocale, SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES } from '~/landing/lib/i18n';
import type { Locale } from '~/landing/lib/i18n';
import { Button } from '~/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/shared/components/ui/dropdown-menu';

const LOCALE_SHORT_LABEL: Record<Locale, string> = {
  en: 'EN',
  ko: 'KO',
  de: 'DE',
  ru: 'RU',
  it: 'IT',
  vi: 'VI',
  id: 'ID',
  pl: 'PL',
  tr: 'TR',
  zh_TW: '繁中',
};

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${LOCALE_DISPLAY_NAMES[locale]}: Change language`}
          className="font-semibold tabular-nums"
          data-umami-event="language-toggle"
          data-umami-event-current={locale}
          size="sm"
          variant="ghost"
        >
          {LOCALE_SHORT_LABEL[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {SUPPORTED_LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            className={locale === loc ? 'bg-accent' : ''}
            data-umami-event="language-select"
            data-umami-event-from={locale}
            data-umami-event-locale={loc}
            onSelect={() => setLocale(loc)}
          >
            <span className="min-w-8 font-mono text-xs text-muted-foreground">
              {LOCALE_SHORT_LABEL[loc]}
            </span>
            <span>{LOCALE_DISPLAY_NAMES[loc]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
