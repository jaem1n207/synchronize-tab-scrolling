import { motion, AnimatePresence } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { useSystemTheme } from '~/shared/hooks/use-system-theme';
import { ANIMATION_DURATIONS } from '~/shared/lib/animations';

import IconMoon from '~icons/lucide/moon';
import IconSun from '~icons/lucide/sun';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'landing-theme';

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function applyThemeToDOM(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function persistThemeChoice(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const systemTheme = useSystemTheme();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? systemTheme);
  const [isExplicit, setIsExplicit] = useState<boolean>(() => getStoredTheme() !== null);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  useEffect(() => {
    if (!isExplicit) {
      setTheme(systemTheme);
    }
  }, [systemTheme, isExplicit]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      persistThemeChoice(next);
      setIsExplicit(true);
      return next;
    });
  }, []);

  const isDark = theme === 'dark';

  return (
    <Button
      aria-label="Toggle dark mode"
      className="relative overflow-hidden"
      data-umami-event="theme-toggle"
      data-umami-event-theme={isDark ? 'light' : 'dark'}
      size="icon"
      variant="ghost"
      onClick={toggle}
    >
      <AnimatePresence initial={false} mode="wait">
        {isDark ? (
          <motion.div
            key="moon"
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 180, opacity: 0 }}
            initial={{ rotate: -180, opacity: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.normal }}
          >
            <IconMoon className="size-5" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -180, opacity: 0 }}
            initial={{ rotate: 180, opacity: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.normal }}
          >
            <IconSun className="size-5" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
