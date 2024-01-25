<script lang="ts">
	import { Image } from 'lucide-svelte';

	import * as Avatar from '$lib/components/ui/avatar';
	import { getLocalMessage } from '$lib/locales';
	import { selectedTabStore } from '$lib/tabs/selectedTabStore';

	$: selectedTabs = $selectedTabStore.selectedTabs;
</script>

<div class="select-none border-b px-1 pt-1">
	{#if selectedTabs.size === 0}
		<div class="invisible mx-0.5 mb-1 h-6 px-2 opacity-0" aria-hidden="true">제목 없음</div>
	{/if}
	{#each Array.from(selectedTabs.values()) as tab (tab.id)}
		<div
			class="mx-0.5 mb-1 inline-flex h-6 max-w-24 items-center rounded-sm bg-muted px-2 text-xs font-medium capitalize"
		>
			<Avatar.Root class="mr-1 size-4">
				<Avatar.Image src={tab.favIconUrl} alt={tab.title} />
				<Avatar.Fallback><Image /></Avatar.Fallback>
			</Avatar.Root>
			<div class="truncate">{tab.title ?? getLocalMessage('noTitle')}</div>
		</div>
	{/each}
</div>
