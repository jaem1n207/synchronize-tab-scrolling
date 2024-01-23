import { systemPrefersMode, userPrefersMode } from 'mode-watcher';

let userTheme: 'dark' | 'light' | 'system';
userPrefersMode.subscribe((value) => {
	userTheme = value;
});

let systemTheme: 'dark' | 'light' | undefined;
systemPrefersMode.subscribe((value) => {
	systemTheme = value;
});

/**
 * @example
 * ```ts
 * import { getUserPreferredTheme } from 'lib/media-query';
 *
 * const handleImageError = (event: Event) => {
 *   const theme = getUserPreferredTheme();
 *   const target = event.target as HTMLImageElement;
 *   target.src = `/images/fallback-favicon.${theme}.svg`;
 * };
 * ```
 */
export const getUserPreferredTheme = (): string => {
	if (userTheme === 'system') {
		return systemTheme ?? 'light';
	}
	return userTheme;
};
