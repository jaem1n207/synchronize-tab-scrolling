<script lang="ts">
	import { cn } from '$lib/utils';
	import { Avatar as AvatarPrimitive } from 'bits-ui';

	type $$Props = AvatarPrimitive.FallbackProps;

	let className: $$Props['class'] = undefined;
	export { className as class };
</script>

<AvatarPrimitive.Fallback
	class={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
	{...$$restProps}
>
	<slot />
</AvatarPrimitive.Fallback>
