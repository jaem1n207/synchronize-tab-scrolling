/// <reference types="vitest/globals" />

import userEvent from '@testing-library/user-event';

import { render, screen } from '~/landing/__tests__/test-utils';
import { LanguageToggle } from '~/landing/components/language-toggle';
import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from '~/landing/lib/i18n';

describe('LanguageToggle', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('renders language trigger with analytics and accessibility label', () => {
    render(<LanguageToggle />);

    const trigger = screen.getByRole('button', { name: 'English: Change language' });

    expect(trigger).toHaveTextContent('EN');
    expect(trigger).toHaveAttribute('data-umami-event', 'language-toggle');
  });

  it('opens dropdown and shows all 10 supported languages', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);

    await user.click(screen.getByRole('button', { name: 'English: Change language' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(SUPPORTED_LOCALES.length);

    for (const locale of SUPPORTED_LOCALES) {
      expect(
        screen.getByRole('menuitem', { name: new RegExp(LOCALE_DISPLAY_NAMES[locale], 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('supports keyboard navigation and updates locale when selecting a language', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);

    const trigger = screen.getByRole('button', { name: 'English: Change language' });
    trigger.focus();

    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: /한국어/i }));

    expect(document.documentElement.lang).toBe('ko');
    expect(localStorage.setItem).toHaveBeenCalledWith('landing-locale', 'ko');
    expect(screen.getByRole('button', { name: '한국어: Change language' })).toHaveTextContent('KO');
  });
});
