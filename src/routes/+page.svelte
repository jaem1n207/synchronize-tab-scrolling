<script lang="ts">
	import TabsCmdk from '$lib/tabs/tabs-cmdk.svelte';
</script>

<svelte:head>
	<title>Popup | Synchronize Tab Scrolling</title>
	<meta
		name="description"
		content="Browser extension that lets you synchronize the scrolling position of multiple tabs"
	/>
</svelte:head>

<div class="relative w-full min-w-96 overflow-auto rounded-xl border border-border">
	<TabsCmdk />
</div>
