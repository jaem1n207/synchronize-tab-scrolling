<script lang="ts">
	import { Image } from 'lucide-svelte';

	import * as Avatar from '$lib/components/ui/avatar';
	import * as Command from '$lib/components/ui/command';
	import { selectedTabStore } from '$lib/tabs/selectedTabStore';
	import { cn } from '$lib/utils';
	import { getTabIdentifier } from './utils.tabs';

	export let tab: chrome.tabs.Tab;
	export let isSyncing: boolean;

	const handleSelect = () => {
		if (isSyncing) return;

		selectedTabStore.toggle(tab);
	};
</script>

<Command.Item
	value={`${tab.title}${tab.index}`}
	title={tab.title}
	disabled={isSyncing}
	aria-disabled={isSyncing}
	onSelect={handleSelect}
	class={cn('my-0.5 cursor-pointer py-2 transition-colors aria-selected:bg-muted/50', {
		'bg-muted': $selectedTabStore.selectedTabs.has(getTabIdentifier(tab.id))
	})}
>
	<Avatar.Root class="mr-2">
		<Avatar.Image src={tab.favIconUrl} alt={tab.title} />
		<Avatar.Fallback><Image /></Avatar.Fallback>
	</Avatar.Root>
	<span class="line-clamp-2 text-xs">{tab.title}</span>
</Command.Item>
