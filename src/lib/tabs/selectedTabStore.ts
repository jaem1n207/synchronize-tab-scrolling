import { writable } from 'svelte/store';
import { getTabIdentifier } from './utils.tabs';

interface TabState {
	selectedTabs: Map<number, chrome.tabs.Tab>;
}

const createSelectedTabStore = () => {
	const { subscribe, set, update } = writable<TabState>({
		selectedTabs: new Map()
	});

	return {
		subscribe,
		toggle: (tab: chrome.tabs.Tab) =>
			update((state) => {
				const identifier = getTabIdentifier(tab.id);

				if (state.selectedTabs.has(identifier)) {
					const newSelectedTabs = new Map(state.selectedTabs);
					newSelectedTabs.delete(identifier);

					return { selectedTabs: newSelectedTabs };
				} else {
					const newSelectedTabs = new Map(state.selectedTabs);
					newSelectedTabs.set(identifier, tab);

					return { selectedTabs: newSelectedTabs };
				}
			}),
		add: (tab: chrome.tabs.Tab) =>
			update((state) => {
				const identifier = getTabIdentifier(tab.id);

				if (state.selectedTabs.has(identifier)) {
					console.warn('Tab already exists in selectedTabs');
					return state;
				}

				// 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
				const newSelectedTabs = new Map(state.selectedTabs);
				newSelectedTabs.set(identifier, tab);

				return { selectedTabs: newSelectedTabs };
			}),
		remove: (tabId: chrome.tabs.Tab['id']) =>
			update((state) => {
				const identifier = getTabIdentifier(tabId);

				if (!state.selectedTabs.has(identifier)) {
					console.warn('Tab does not exist in selectedTabs');
					return state;
				}

				// 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
				const newSelectedTabs = new Map(state.selectedTabs);
				newSelectedTabs.delete(identifier);

				return { selectedTabs: newSelectedTabs };
			}),
		pop: () =>
			update((state) => {
				if (state.selectedTabs.size === 0) {
					console.warn('selectedTabs is empty');
					return state;
				}

				// 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
				const newSelectedTabs = new Map(state.selectedTabs);
				newSelectedTabs.delete(Array.from(newSelectedTabs.keys()).pop()!);

				return { selectedTabs: newSelectedTabs };
			}),
		reset: () => set({ selectedTabs: new Map() })
	};
};

export const selectedTabStore = createSelectedTabStore();
