import { motion, AnimatePresence } from 'motion/react';
import IconMenu from '~icons/lucide/menu';
import IconX from '~icons/lucide/x';

import { cn } from '~/shared/lib/utils';
import { Button } from '~/shared/components/ui/button';
import { ANIMATION_DURATIONS } from '~/shared/lib/animations';
import { useTranslation } from '~/landing/lib/i18n';
import { ThemeToggle } from '~/landing/components/theme-toggle';
import { LanguageToggle } from '~/landing/components/language-toggle';
import { InstallButtons } from '~/landing/components/install-buttons';

interface NavLink {
  label: string;
  href: string;
}

export function Header() {
  const t = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 50);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const navLinks: NavLink[] = useMemo(
    () => [
      { label: t.header.features, href: '#features' },
      { label: t.header.useCases, href: '#use-cases' },
    ],
    [t.header.features, t.header.useCases],
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 z-50 w-full transition-all duration-300',
        scrolled ? 'border-b border-border bg-background/80 backdrop-blur-lg' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0 })}
          className="flex items-center gap-2 text-foreground font-bold tracking-tight bg-transparent border-none cursor-pointer p-0"
        >
          <span className="md:hidden text-lg">STS</span>
          <span className="hidden md:inline text-base">Synchronize Tab Scrolling</span>
        </button>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />

          <div className="hidden md:block ml-2">
            <InstallButtons variant="compact" />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="md:hidden"
          >
            {mobileOpen ? <IconX className="size-5" /> : <IconMenu className="size-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.normal }}
            className="overflow-hidden border-b border-border bg-background md:hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMobile}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-3 pb-1">
                <InstallButtons variant="hero" />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
