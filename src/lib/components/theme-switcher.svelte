<script lang="ts">
	import { resetMode, setMode } from 'mode-watcher';
	import { onMount } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { kbd } from '../kbd';
	import { Shortcut } from './ui/command';

	let open = false;

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === kbd.K && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				open = true;
			}
		}

		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<DropdownMenu.Root bind:open preventScroll={true}>
	<DropdownMenu.Trigger asChild let:builder>
		<Button
			aria-expanded={open}
			builders={[builder]}
			variant="ghost"
			class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
		>
			<span class="text-xs">Change Theme</span>
			<Shortcut class="ml-1 size-5">⌘</Shortcut>
			<Shortcut class="size-5">K</Shortcut>
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.Item on:click={() => setMode('light')}>Light</DropdownMenu.Item>
		<DropdownMenu.Item on:click={() => setMode('dark')}>Dark</DropdownMenu.Item>
		<DropdownMenu.Item on:click={() => resetMode()}>System</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
