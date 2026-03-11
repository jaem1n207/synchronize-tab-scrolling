import { motion } from 'motion/react';

import { GITHUB_REPO_URL, DEMO_VIDEO_URL, SUPPORT_EMAIL } from '~/landing/lib/constants';
import { useTranslation } from '~/landing/lib/i18n';

import IconExternalLink from '~icons/lucide/external-link';

const BUG_REPORT_URL = `${GITHUB_REPO_URL}/issues/new?title=Bug%20Report&labels=bug&assignees=jaem1n207`;

export function Footer() {
  const t = useTranslation();

  return (
    <motion.footer
      className="border-t border-border bg-muted"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1 }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-3 md:gap-8 md:py-16">
        <div className="space-y-2">
          <h3 className="text-base font-bold text-foreground">Synchronize Tab Scrolling</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{t.footer.tagline}</p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">{t.footer.links}</h4>
          <ul className="space-y-2">
            <li>
              <ExternalLink href={GITHUB_REPO_URL}>{t.footer.github}</ExternalLink>
            </li>
            <li>
              <ExternalLink href={DEMO_VIDEO_URL}>Demo</ExternalLink>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">{t.footer.support}</h4>
          <ul className="space-y-2">
            <li>
              <ExternalLink href={BUG_REPORT_URL}>{t.footer.reportBug}</ExternalLink>
            </li>
            <li>
              <ExternalLink href={`mailto:${SUPPORT_EMAIL}`}>{t.footer.email}</ExternalLink>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
          <span>{t.footer.license}</span>
          <span>
            {t.footer.madeBy}{' '}
            <a
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="https://github.com/jaem1n207"
              rel="noopener noreferrer"
              target="_blank"
            >
              jaem1n207
            </a>
          </span>
        </div>
      </div>
    </motion.footer>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <IconExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
