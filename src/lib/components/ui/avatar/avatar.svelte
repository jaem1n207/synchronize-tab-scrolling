<script lang="ts">
	import { cn } from '$lib/utils';
	import { Avatar as AvatarPrimitive } from 'bits-ui';

	type $$Props = AvatarPrimitive.Props;

	let className: $$Props['class'] = undefined;
	export let delayMs: $$Props['delayMs'] = undefined;
	export { className as class };
</script>

<AvatarPrimitive.Root
	{delayMs}
	class={cn('relative flex size-6 shrink-0 overflow-hidden rounded-full', className)}
	{...$$restProps}
>
	<slot />
</AvatarPrimitive.Root>
