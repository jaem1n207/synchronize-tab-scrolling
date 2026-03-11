import { motion, AnimatePresence } from 'motion/react';
import IconSun from '~icons/lucide/sun';
import IconMoon from '~icons/lucide/moon';

import { Button } from '~/shared/components/ui/button';
import { useSystemTheme } from '~/shared/hooks/use-system-theme';
import { ANIMATION_DURATIONS } from '~/shared/lib/animations';

type Theme = 'light' | 'dark';

function resolveInitialTheme(systemTheme: Theme): Theme {
  if (typeof window === 'undefined') return systemTheme;
  const stored = localStorage.getItem('landing-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return systemTheme;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('landing-theme', theme);
}

export function ThemeToggle() {
  const systemTheme = useSystemTheme();
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme(systemTheme));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle dark mode"
      data-umami-event="theme-toggle"
      className="relative overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ rotate: -180, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 180, opacity: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.normal }}
          >
            <IconMoon className="size-5" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 180, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -180, opacity: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.normal }}
          >
            <IconSun className="size-5" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
