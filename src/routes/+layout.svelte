<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { QueryClientProvider } from '@tanstack/svelte-query';

	import '@/app.pcss';
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;
</script>

<ModeWatcher />
<div>
	<header
		class="flex w-full items-center justify-between border-b border-border/40 bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<h1 class="text-2xl font-bold leading-tight md:text-6xl">Synchronize Tab Scrolling</h1>
		<ThemeSwitcher />
	</header>
	<QueryClientProvider client={data.queryClient}><slot /></QueryClientProvider>
</div>
