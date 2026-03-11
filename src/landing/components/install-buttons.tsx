import { motion } from 'motion/react';
import IconChrome from '~icons/simple-icons/googlechrome';
import IconFirefox from '~icons/simple-icons/firefox';
import IconEdge from '~icons/simple-icons/microsoftedge';
import IconBrave from '~icons/simple-icons/brave';

import { cn } from '~/shared/lib/utils';
import { useTranslation } from '~/landing/lib/i18n';
import { STORE_URLS } from '~/landing/lib/constants';
import { detectBrowser } from '~/landing/lib/detect-browser';

import type { BrowserName } from '~/landing/lib/detect-browser';
import type { BrowserKey } from '~/landing/lib/constants';

interface InstallButtonsProps {
  variant?: 'hero' | 'compact';
}

interface BrowserConfig {
  key: BrowserKey;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}

const BROWSERS: BrowserConfig[] = [
  { key: 'chrome', icon: IconChrome, label: 'Chrome' },
  { key: 'firefox', icon: IconFirefox, label: 'Firefox' },
  { key: 'edge', icon: IconEdge, label: 'Edge' },
  { key: 'brave', icon: IconBrave, label: 'Brave' },
];

function toPrimaryBrowserKey(browser: BrowserName): BrowserKey {
  if (browser === 'brave') return 'brave';
  if (browser === 'firefox') return 'firefox';
  if (browser === 'edge') return 'edge';
  return 'chrome';
}

export function InstallButtons({ variant = 'hero' }: InstallButtonsProps) {
  const t = useTranslation();
  const primaryKey = useMemo(() => toPrimaryBrowserKey(detectBrowser()), []);
  const primaryBrowser = useMemo(
    () => BROWSERS.find((b) => b.key === primaryKey) ?? BROWSERS[0],
    [primaryKey],
  );
  const secondaryBrowsers = useMemo(
    () => BROWSERS.filter((b) => b.key !== primaryKey),
    [primaryKey],
  );

  const isHero = variant === 'hero';
  const PrimaryIcon = primaryBrowser.icon;

  return (
    <div className={cn('flex flex-col items-center gap-3', isHero ? 'gap-4' : 'gap-2')}>
      <motion.a
        href={STORE_URLS[primaryBrowser.key]}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        data-umami-event="install-primary"
        data-umami-event-browser={primaryBrowser.label}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm transition-colors',
          isHero ? 'px-7 py-3.5 text-base' : 'px-5 py-2 text-sm',
        )}
      >
        <PrimaryIcon className={cn(isHero ? 'size-5' : 'size-4')} />
        <span>
          {t.common.addTo} {primaryBrowser.label}
        </span>
      </motion.a>

      {isHero && secondaryBrowsers.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t.common.alsoAvailableOn}</span>
          <div className="flex items-center gap-1.5">
            {secondaryBrowsers.map((browser) => {
              const Icon = browser.icon;
              return (
                <a
                  key={browser.key}
                  href={STORE_URLS[browser.key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t.common.addTo} ${browser.label}`}
                  data-umami-event="install-secondary"
                  data-umami-event-browser={browser.label}
                  className="rounded-md p-1.5 transition-colors hover:bg-accent"
                >
                  <Icon className="size-4" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
