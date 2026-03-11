import type { ComponentType, SVGProps } from 'react';

import { motion } from 'motion/react';

import { IconDia } from '~/landing/components/icons/icon-dia';
import { SectionContainer } from '~/landing/components/layout/section-container';
import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

import IconAccessibility from '~icons/lucide/accessibility';
import IconCode2 from '~icons/lucide/code-2';
import IconDatabase from '~icons/lucide/database';
import IconEyeOff from '~icons/lucide/eye-off';
import IconGlobe from '~icons/lucide/globe';
import IconWifiOff from '~icons/lucide/wifi-off';
import IconArc from '~icons/simple-icons/arc';
import IconBrave from '~icons/simple-icons/brave';
import IconFirefox from '~icons/simple-icons/firefox';
import IconChrome from '~icons/simple-icons/googlechrome';
import IconEdge from '~icons/simple-icons/microsoftedge';

type TrustBadgeKey =
  | 'noData'
  | 'noAnalytics'
  | 'offline'
  | 'openSource'
  | 'languages'
  | 'accessible';

interface TrustBadgeConfig {
  key: TrustBadgeKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TRUST_BADGES: TrustBadgeConfig[] = [
  { key: 'noData', icon: IconDatabase },
  { key: 'noAnalytics', icon: IconEyeOff },
  { key: 'offline', icon: IconWifiOff },
  { key: 'openSource', icon: IconCode2 },
  { key: 'languages', icon: IconGlobe },
  { key: 'accessible', icon: IconAccessibility },
];

const BROWSER_ICONS: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }[] = [
  { icon: IconChrome, label: 'Chrome' },
  { icon: IconFirefox, label: 'Firefox' },
  { icon: IconEdge, label: 'Edge' },
  { icon: IconArc, label: 'Arc' },
  { icon: IconBrave, label: 'Brave' },
  { icon: IconDia, label: 'Dia' },
];

export function TrustSection() {
  const t = useTranslation();

  return (
    <SectionContainer>
      <h2 className="mb-10 text-center text-2xl font-bold text-foreground md:text-3xl">
        {t.trust.title}
      </h2>

      <div className="flex flex-wrap justify-center gap-3">
        {TRUST_BADGES.map((badge, i) => {
          const Icon = badge.icon;
          return (
            <motion.div
              key={badge.key}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground"
              initial={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: ANIMATION_DURATIONS.slow,
                ease: EASING_FUNCTIONS.easeOut,
                delay: i * 0.06,
              }}
              viewport={{ once: true, margin: '-40px' }}
              whileInView={{ opacity: 1, scale: 1 }}
            >
              <Icon className="size-4 shrink-0" />
              <span>{t.trust.badges[badge.key]}</span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <p className="text-center text-sm text-muted-foreground">{t.trust.browsers}</p>
        <div className="flex items-center gap-3">
          {BROWSER_ICONS.map((browser) => {
            const Icon = browser.icon;
            return (
              <Icon
                key={browser.label}
                aria-label={browser.label}
                className="size-6 opacity-60 transition-opacity hover:opacity-100"
              />
            );
          })}
        </div>
      </div>
    </SectionContainer>
  );
}
