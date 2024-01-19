import type { Config } from 'tailwindcss';

export default {
	future: {
		// https://github.com/tailwindlabs/tailwindcss/pull/8394
		hoverOnlyWhenSupported: true
	},
	darkMode: ['class'],
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				basic: 'hsl(var(--basic))',
				['basic-500']: 'hsl(var(--basic-500))',
				['background-primary']: 'hsl(var(--background-primary))',
				['background-secondary']: 'hsl(var(--background-secondary))',
				['background-modifier-accent']: 'hsl(var(--background-modifier-accent))',
				['header-primary']: 'hsl(var(--header-primary))',
				['brand-experiment-360']: 'hsl(var(--brand-experiment-360))',
				['status-danger']: 'hsl(var(--status-danger))',
				['button-danger-background']: 'hsl(var(--button-danger-background))'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			}
		}
	},
	plugins: []
} satisfies Config;
