<script lang="ts">
  import { Check, Image } from 'lucide-svelte';

  import * as Avatar from '$lib/components/ui/avatar';
  import * as Command from '$lib/components/ui/command';
  import { selectedTabStore } from '$lib/tabs/selectedTabStore';
  import { cn } from '$lib/utils';

  import HighlightMatches from '../components/highlight-matches.svelte';
  import { getTabIdentifier } from './utils.tabs';

  export let inputValue: string;
  export let tab: webExtension.tabs.Tab;
  export let isDisabled: boolean;

  const escapeCSSSelector = (selector: string) => {
    return selector.replace(/(["\\])/g, '\\$1');
  };

  const handleSelect = () => {
    if (isDisabled) return;

    selectedTabStore.toggle(tab);
  };

  $: isSelected = $selectedTabStore.selectedTabs.has(getTabIdentifier(tab.id));
</script>

<Command.Item
  value={escapeCSSSelector(`${tab.title}${tab.url}`)}
  title={tab.title}
  disabled={isDisabled}
  aria-disabled={isDisabled}
  onSelect={handleSelect}
  class={cn('my-0.5 grid cursor-pointer grid-cols-[20px,auto,20px] gap-2 py-2 transition-colors', {
    'grid-cols-[16px,20px,auto,20px]': isSelected
  })}
>
  {#if isSelected}
    <Check strokeWidth={3.5} class="size-4 text-green-500 dark:text-green-400" />
  {/if}
  <Avatar.Root>
    <Avatar.Image src={tab.favIconUrl} alt={tab.title} />
    <Avatar.Fallback><Image /></Avatar.Fallback>
  </Avatar.Root>
  <HighlightMatches class="line-clamp-2 text-xs" match={inputValue} value={tab.title} />
  <Command.CommandShortcut class="size-5">↵</Command.CommandShortcut>
</Command.Item>
