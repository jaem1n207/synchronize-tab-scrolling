<script lang="ts">
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
</script>

<header
	class="flex w-full items-center justify-between border-b border-border/40 bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
	<h1 class="text-xl font-bold leading-tight">Synchronize Tab Scrolling</h1>
	<ThemeSwitcher />
</header>
