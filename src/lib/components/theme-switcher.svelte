<script lang="ts">
  import { resetMode, setMode } from 'mode-watcher';

  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { kbd } from '../kbd';
  import { getLocalMessage } from '../locales';
  import { isMacOS } from '../platform';
  import { Shortcut } from './ui/command';

  let open = false;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === kbd.K && (e.metaKey || e.altKey)) {
      e.preventDefault();
      open = true;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<DropdownMenu.Root bind:open preventScroll={true}>
  <DropdownMenu.Trigger asChild let:builder>
    <Button
      aria-expanded={open}
      builders={[builder]}
      variant="ghost"
      class="h-full gap-1 rounded-md pl-2 pr-1 text-xs"
    >
      <span class="text-xs">{getLocalMessage('changeTheme')}</span>
      <Shortcut class="ml-1 size-5">{isMacOS ? '⌘' : 'Ctrl'}</Shortcut>
      <Shortcut class="size-5">K</Shortcut>
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item on:click={() => setMode('light')}
      >{getLocalMessage('light')}</DropdownMenu.Item
    >
    <DropdownMenu.Item on:click={() => setMode('dark')}>{getLocalMessage('dark')}</DropdownMenu.Item
    >
    <DropdownMenu.Item on:click={() => resetMode()}>{getLocalMessage('system')}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
