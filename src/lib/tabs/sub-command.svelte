<script lang="ts">
	import { RefreshCwOff, Wand2 } from 'lucide-svelte';

	import * as Command from '$lib/components/ui/command';
	import ThemeSwitcher from '../components/theme-switcher.svelte';
	import { Button } from '../components/ui/button';
	import SyncIcon from './icons/sync-icon.svelte';

	export let handleStartSync: () => void;
	export let handleStopSync: () => void;
	export let hasMultipleSelectedTabs: boolean;
	export let isSyncing: boolean;
</script>

<div
	class="absolute bottom-0 flex h-10 w-full items-center rounded-b-xl border-t border-border bg-background px-2 py-1"
>
	<Wand2 class="mr-auto size-4 stroke-gray-500 dark:stroke-gray-400" />
	<ThemeSwitcher />
	<hr class="ml-3 mr-1 h-3 w-[1px] border-none bg-border" />
	{#if isSyncing}
		<Button
			class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
			variant="ghost"
			on:click={handleStopSync}
		>
			<RefreshCwOff class="size-4 stroke-black dark:stroke-white" />
			Stop Sync
			<Command.Shortcut class="ml-1 size-5">⌘</Command.Shortcut>
			<Command.Shortcut class="size-5">E</Command.Shortcut>
		</Button>
	{:else}
		<Button
			class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
			variant="ghost"
			on:click={handleStartSync}
			disabled={!hasMultipleSelectedTabs}
		>
			<SyncIcon class="size-4 stroke-black dark:stroke-white" />
			Start Sync
			<Command.Shortcut class="ml-1 size-5">⌘</Command.Shortcut>
			<Command.Shortcut class="size-5">S</Command.Shortcut>
		</Button>
	{/if}
</div>
