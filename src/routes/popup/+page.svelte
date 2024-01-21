<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Tabs from '@/lib/tabs/tabs.svelte';
</script>

<svelte:head>
	<title>Popup | Synchronize Tab Scrolling</title>
	<meta
		name="description"
		content="Browser extension that lets you synchronize the scrolling position of multiple tabs"
	/>
</svelte:head>

<div class="max-h-96 min-h-96 w-80 overflow-auto">
	<Tabs />
	<Button>Hello</Button>
</div>
