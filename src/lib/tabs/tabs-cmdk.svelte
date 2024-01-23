<script lang="ts">
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';

	import * as Avatar from '$lib/components/ui/avatar';
	import * as Command from '$lib/components/ui/command';
	import { Image } from 'lucide-svelte';
	import { isEmptyString, isHTMLElement } from '../is';
	import { kbd } from '../kbd';
	import { cn } from '../utils';
	import SelectedTabs from './selected-tabs.svelte';
	import SubCommand from './sub-command.svelte';
	import { chromeApi, tabKeys } from './tabs';
	import { getLocalMessage } from '../locales';

	const tabs = createQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	const syncTabIds = createQuery({
		queryKey: tabKeys.sync(),
		queryFn: () => chromeApi.getSyncTabIds()
	});

	const queryClient = useQueryClient();

	const mutateSyncTabIds = createMutation({
		mutationFn: async (syncTabIds: number[]) => {
			return new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{ command: 'setSyncTabIds', data: { syncTabIds } },
					(response) => {
						if (chrome.runtime.lastError) {
							reject(chrome.runtime.lastError);
						} else {
							resolve(response);
						}
					}
				);
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: tabKeys.sync()
			});
		}
	});

	let inputValue: string = '';

	let selectedTabs = new Map<string, chrome.tabs.Tab>();
	$: isEmptySelectedTabIds = selectedTabs.size === 0;
	$: hasMultipleSelectedTabs = selectedTabs.size >= 2;

	let isSyncing = false;
	$: syncTabIds.subscribe(({ data }) => {
		if ((data?.length ?? 0) > 0) {
			isSyncing = true;
		} else {
			isSyncing = false;
		}
	});

	const resetInputValue = () => (inputValue = '');

	const resetSelectedTabs = () => (selectedTabs = new Map());

	const handleStartSync = () => {
		if (isSyncing || !hasMultipleSelectedTabs) return;

		chrome.runtime.sendMessage<{
			command: 'startSync';
			data: number[];
		}>({ command: 'startSync', data: Array.from(selectedTabs.keys()).map(Number) });
		$mutateSyncTabIds.mutate(Array.from(selectedTabs.keys()).map(Number));

		resetInputValue();
	};

	const handleStopSync = () => {
		if (!isSyncing) return;

		chrome.runtime.sendMessage({ command: 'stopSync' });
		$mutateSyncTabIds.mutate([]);

		resetSelectedTabs();
	};

	/**
	 * 탭 객체를 받아 고유 식별자를 문자열로 반환합니다. `id`가 있으면 `id`를 반환하고,
	 * 없으면 `sessionId`를, `sessionId`도 없으면 `index`를 반환합니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 사용자가 선택한 탭 객체
	 */
	const getTabIdentifier = (tab: chrome.tabs.Tab): string => {
		return tab.id?.toString() ?? tab.sessionId ?? tab.index.toString();
	};

	/**
	 * 선택된 탭을 추가합니다.
	 *
	 * 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 선택할 탭 객체
	 */
	const addSelectedTab = (tab: chrome.tabs.Tab) => {
		const identifier = getTabIdentifier(tab);
		selectedTabs = new Map(selectedTabs.set(identifier, tab));
	};

	/**
	 * 선택된 탭을 제거합니다.
	 *
	 * 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
	 *
	 * @param {string} identifier - 제거할 탭의 고유 식별자
	 */
	const removeSelectedTab = (identifier: string) => {
		if (selectedTabs.has(identifier)) {
			selectedTabs = new Map(selectedTabs);
			selectedTabs.delete(identifier);
		}
	};

	/**
	 * 마지막으로 선택된 탭을 제거합니다. 선택된 탭이 없으면 아무 작업도 수행하지 않습니다.
	 */
	const removeLastSelectedTab = () => {
		if (isEmptySelectedTabIds) return;

		const lastIdentifier = Array.from(selectedTabs.keys()).pop();
		if (lastIdentifier) {
			removeSelectedTab(lastIdentifier);
		}
	};

	const bounce = (node: HTMLElement) => {
		node.style.transform = 'scale(0.98)';
		setTimeout(() => {
			node.style.transform = '';
		}, 100);
	};

	const handleKeydown = (e: KeyboardEvent) => {
		const currentTarget = e.currentTarget;
		if (!isHTMLElement(currentTarget)) return;

		if (isEmptySelectedTabIds || !isEmptyString(inputValue) || isSyncing) return;

		if (e.key === kbd.BACKSPACE) {
			e.preventDefault();
			removeLastSelectedTab();
			bounce(currentTarget);
		}
	};

	/**
	 * 사용자가 탭을 클릭할 때 호출됩니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 사용자가 선택한 탭 객체
	 */
	const handleTabSelect = (tab: chrome.tabs.Tab) => {
		if (isSyncing) return;

		const identifier = getTabIdentifier(tab);

		if (selectedTabs.has(identifier)) {
			removeSelectedTab(identifier);
		} else {
			addSelectedTab(tab);
		}
	};

	onMount(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (isSyncing) {
				if (e.key === kbd.E && (e.metaKey || e.ctrlKey)) {
					handleStopSync();
				}
			} else {
				if (e.key === kbd.S && (e.metaKey || e.ctrlKey)) {
					handleStartSync();
				}
			}
		};

		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<Command.Root onKeydown={handleKeydown} class="py-2">
	<SelectedTabs {selectedTabs} />
	<Command.Input
		autofocus
		placeholder={getLocalMessage('searchPlaceholder')}
		bind:value={inputValue}
		class="py-1"
	/>
	<Command.List class="px-2 pb-10">
		{#if $tabs.status === 'pending'}
			<Command.Loading>{getLocalMessage('loading')}</Command.Loading>
		{:else if $tabs.status === 'error'}
			<Command.Item>{getLocalMessage('error')}: {$tabs.error.message}</Command.Item>
		{:else if $tabs.isFetching}
			<Command.Loading>{getLocalMessage('backgroundUpdate')}</Command.Loading>
		{:else}
			<Command.Empty>{getLocalMessage('noSearchFound')}</Command.Empty>
			<Command.Group heading={getLocalMessage('tabs')}>
				{#each $tabs.data as tab}
					<Command.Item
						disabled={isSyncing}
						aria-disabled={isSyncing}
						onSelect={() => handleTabSelect(tab)}
						class={cn('my-0.5 cursor-pointer py-2 transition-colors aria-selected:bg-muted/50', {
							'bg-muted': selectedTabs.has(getTabIdentifier(tab))
						})}
					>
						<Avatar.Root class="mr-2">
							<Avatar.Image src={tab.favIconUrl} alt={tab.title} />
							<Avatar.Fallback><Image /></Avatar.Fallback>
						</Avatar.Root>
						<span class="line-clamp-2 text-xs">{tab.title}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
	<SubCommand {handleStartSync} {handleStopSync} {hasMultipleSelectedTabs} {isSyncing} />
</Command.Root>
