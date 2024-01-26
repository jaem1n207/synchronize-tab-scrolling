<script lang="ts">
	import { Check, Image } from 'lucide-svelte';

	import * as Avatar from '$lib/components/ui/avatar';
	import * as Command from '$lib/components/ui/command';
	import { selectedTabStore } from '$lib/tabs/selectedTabStore';
	import { cn } from '$lib/utils';

	import { getTabIdentifier } from './utils.tabs';

	export let tab: chrome.tabs.Tab;
	export let isDisabled: boolean;

	const handleSelect = () => {
		if (isDisabled) return;

		selectedTabStore.toggle(tab);
	};

	$: isSelected = $selectedTabStore.selectedTabs.has(getTabIdentifier(tab.id));
</script>

<Command.Item
	value={`${tab.title}${tab.index}`}
	title={tab.title}
	disabled={isDisabled}
	aria-disabled={isDisabled}
	onSelect={handleSelect}
	class={cn('my-0.5 grid cursor-pointer grid-cols-[20px,auto,20px] gap-2 py-2 transition-colors', {
		'grid-cols-[16px,20px,auto,20px]': isSelected
	})}
>
	{#if isSelected}
		<Check strokeWidth={3.5} class="size-4 text-green-500 dark:text-green-400" />
	{/if}
	<Avatar.Root>
		<Avatar.Image src={tab.favIconUrl} alt={tab.title} />
		<Avatar.Fallback><Image /></Avatar.Fallback>
	</Avatar.Root>
	<span class="line-clamp-2 text-xs">{tab.title}</span>
	<Command.CommandShortcut class="size-5">↵</Command.CommandShortcut>
</Command.Item>
