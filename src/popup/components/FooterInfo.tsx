import { Kbd } from '~/shared/components/ui/kbd';
import { t } from '~/shared/i18n';

export function FooterInfo() {
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground px-2 py-1.5 border-t">
      <div className="flex items-center gap-1.5">
        <span>{t('footerActions')}</span>
        <Kbd>⌘K</Kbd>
      </div>
      <div className="flex items-center gap-1.5">
        <span>{t('footerStartStop')}</span>
        <Kbd>⌘S</Kbd>
      </div>
      <div className="flex items-center gap-1.5">
        <span>{t('footerSelect')}</span>
        <Kbd>Enter</Kbd>
      </div>
    </div>
  );
}
