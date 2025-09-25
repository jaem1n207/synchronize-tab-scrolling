import { useEffect } from 'react';

// Component to handle global accessibility enhancements
export function AccessibilityEnhancements() {
  useEffect(() => {
    // Add keyboard navigation handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip to main content with Alt+M
      if (e.altKey && e.key === 'm') {
        const main = document.querySelector('main, [role="main"]');
        if (main instanceof HTMLElement) {
          main.focus();
          main.scrollIntoView({ behavior: 'smooth' });
        }
      }

      // Toggle high contrast mode with Alt+H
      if (e.altKey && e.key === 'h') {
        document.documentElement.classList.toggle('high-contrast');
        const isHighContrast = document.documentElement.classList.contains('high-contrast');
        localStorage.setItem('highContrast', isHighContrast.toString());
        announceToScreenReader(
          isHighContrast ? 'High contrast mode enabled' : 'High contrast mode disabled',
        );
      }

      // Announce current focus with Alt+F
      if (e.altKey && e.key === 'f') {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement) {
          const label =
            focused.getAttribute('aria-label') || focused.textContent || 'No label available';
          announceToScreenReader(`Current focus: ${label}`);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Restore high contrast preference
    const highContrastPref = localStorage.getItem('highContrast');
    if (highContrastPref === 'true') {
      document.documentElement.classList.add('high-contrast');
    }

    // Add focus visible class for keyboard navigation
    document.documentElement.classList.add('focus-visible');

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      {/* Skip to main content link */}
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.querySelector('#main-content, main, [role="main"]');
          if (main instanceof HTMLElement) {
            main.focus();
            main.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      >
        Skip to main content
      </a>

      {/* Screen reader announcements container */}
      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        id="screen-reader-announcements"
        role="status"
      />
    </>
  );
}

// Helper function to announce messages to screen readers
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite',
) {
  const container = document.getElementById('screen-reader-announcements');
  if (container) {
    container.setAttribute('aria-live', priority);
    container.textContent = message;
    // Clear after announcement
    setTimeout(() => {
      container.textContent = '';
    }, 1000);
  }
}
