<script lang="ts">
	import * as Command from '$lib/components/ui/command';

	import { isEmptyString, isHTMLElement } from '../is';
	import { kbd } from '../kbd';
	import { getUserPreferredTheme } from '../media-query';
	import { cn } from '../utils';

	// const tabs = createQuery({
	// 	queryKey: tabKeys.lists(),
	// 	queryFn: () => chromeApi.getTabs()
	// });

	let tabs: {
		id?: number | undefined;
		title?: string | undefined;
		favIconUrl?: string | undefined;
		sessionId?: string | undefined;
		index: number;
	}[] = [
		{
			index: 0,
			id: 1,
			title: 'Google',
			favIconUrl: 'https://www.google.com/favicon.ico'
		},
		{
			index: 1,
			id: 2,
			title:
				'FacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebook',
			favIconUrl: 'https://www.facebook.com/favicon.ico'
		},
		{
			index: 2,
			sessionId: 'ac34adcb',
			title: 'Twitter',
			favIconUrl: 'https://www.twitter.com/favicon.ico'
		},
		{
			index: 3,
			id: 4,
			title: 'Instagram',
			favIconUrl: 'https://www.instagram.com/favicon.ico'
		},
		{
			index: 4,
			sessionId: 'svf5324th',
			title: 'Youtube',
			favIconUrl: 'https://www.youtube.com/favicon.ico'
		},
		{
			index: 5,
			id: 6,
			title: 'Linkedin',
			favIconUrl: 'https://www.linkedin.com/favicon.ico'
		},
		{
			index: 6,
			id: 7,
			title: 'Github',
			favIconUrl: 'https://www.github.com/favicon.ico'
		},
		{
			index: 7,
			id: 8,
			title: 'Stack Overflow',
			favIconUrl: 'https://www.stackoverflow.com/favicon.ico'
		}
	];

	let inputValue: string = '';

	let selectedTabs = new Map<string, (typeof tabs)[0]>();
	$: isEmptySelectedTabIds = selectedTabs.size === 0;

	/**
	 * 선택된 탭을 추가합니다.
	 *
	 * 새로운 Map 객체를 생성하고 할당하여 Svelte가 변경을 감지하고 UI를 업데이트하도록 합니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 선택할 탭 객체
	 */
	const addSelectedTab = (tab: (typeof tabs)[0]) => {
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

	const bounce = (node: HTMLElement) => {
		node.style.transform = 'scale(0.98)';
		setTimeout(() => {
			node.style.transform = '';
		}, 100);
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

	const handleKeydown = (e: KeyboardEvent) => {
		const currentTarget = e.currentTarget;
		if (!isHTMLElement(currentTarget)) return;

		if (isEmptySelectedTabIds || !isEmptyString(inputValue)) return;

		if (e.key === kbd.BACKSPACE) {
			e.preventDefault();
			removeLastSelectedTab();
			bounce(currentTarget);
		}
	};

	/**
	 * 탭 객체를 받아 고유 식별자를 문자열로 반환합니다. `id`가 있으면 `id`를 반환하고,
	 * 없으면 `sessionId`를, `sessionId`도 없으면 `index`를 반환합니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 사용자가 선택한 탭 객체
	 */
	const getTabIdentifier = (tab: (typeof tabs)[0]): string => {
		return tab.id?.toString() ?? tab.sessionId ?? tab.index.toString();
	};

	/**
	 * 사용자가 탭을 클릭할 때 호출됩니다.
	 *
	 * @param {chrome.tabs.Tab} tab - 사용자가 선택한 탭 객체
	 */
	const handleTabSelect = (tab: (typeof tabs)[0]) => {
		const identifier = getTabIdentifier(tab);

		if (selectedTabs.has(identifier)) {
			removeSelectedTab(identifier);
		} else {
			addSelectedTab(tab);
		}
	};

	const handleFaviconError = (event: Event) => {
		const theme = getUserPreferredTheme();
		const target = event.target as HTMLImageElement;
		target.src = `/images/${theme}-fallback-favicon.svg`;
	};
</script>

<Command.Root onKeydown={handleKeydown} class="vercel">
	<div class="select-none p-1">
		{#if selectedTabs.size === 0}
			<div class="invisible mx-0.5 mb-1 h-6 px-2 opacity-0" aria-hidden="true">제목 없음</div>
		{/if}
		{#each Array.from(selectedTabs.values()) as tab}
			<div
				class="mx-0.5 mb-1 inline-flex h-6 max-w-24 items-center rounded-sm bg-muted px-2 text-xs font-medium capitalize"
			>
				<div class="relative mr-1 flex size-4 shrink-0 overflow-hidden rounded-full">
					<img
						class="aspect-square size-full object-cover"
						src={tab.favIconUrl}
						alt=""
						on:error={handleFaviconError}
					/>
				</div>
				<div class="truncate">{tab.title ?? '제목 없음'}</div>
			</div>
		{/each}
	</div>
	<Command.Input placeholder="Type a command or search..." autofocus bind:value={inputValue} />
	<Command.List>
		<Command.Empty>No results found.</Command.Empty>
		<Command.Group heading="Tabs">
			{#each tabs as tab}
				<Command.Item
					onSelect={() => handleTabSelect(tab)}
					class={cn('my-0.5 cursor-pointer py-2 transition-colors aria-selected:bg-muted/50', {
						'bg-muted': selectedTabs.has(getTabIdentifier(tab))
					})}
				>
					<div class="relative mr-2 flex size-6 shrink-0 overflow-hidden rounded-full">
						<img
							class="aspect-square size-full object-cover"
							src={tab.favIconUrl}
							alt=""
							on:error={handleFaviconError}
						/>
					</div>
					<span class="line-clamp-2 text-sm">{tab.title}</span>
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Root>

<!-- <Command.Root onKeydown={handleKeydown} class="vercel">
	<Command.Input placeholder="Type a command or search..." autofocus bind:value={inputValue} />
	<Command.List>
		{#if $tabs.status === 'pending'}
			<Command.Loading>Loading...</Command.Loading>
		{:else if $tabs.status === 'error'}
			<Command.Item>Error: {$tabs.error.message}</Command.Item>
		{:else if $tabs.isFetching}
			<Command.Loading>Background Updating...</Command.Loading>
		{:else}
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Tabs">
				{#each $tabs.data as tab}
					<Command.Item
						onSelect={() => handleTabSelect(tab.id ?? tab.index)}
						class={cn('cursor-pointer space-y-1', {
							'bg-primary-foreground/90': selectedTabIds.has(tab.id ?? tab.index)
						})}
					>
						<img
							class="mr-2 size-4 min-h-4 min-w-4"
							src={tab.favIconUrl}
							alt=""
							on:error={handleFaviconError}
						/>
						<span class="line-clamp-2">{tab.title}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Root> -->
