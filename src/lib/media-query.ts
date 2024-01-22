import { userPrefersMode, systemPrefersMode } from 'mode-watcher';

let userTheme: 'dark' | 'light' | 'system';
userPrefersMode.subscribe((value) => {
	userTheme = value;
});

let systemTheme: 'dark' | 'light' | undefined;
systemPrefersMode.subscribe((value) => {
	systemTheme = value;
});

export const getUserPreferredTheme = (): string => {
	if (userTheme === 'system') {
		return systemTheme ?? 'light';
	}
	return userTheme;
};
