import * as React from 'react';

import { type DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import { LayoutGroup, motion } from 'motion/react';

import { Dialog, DialogContent } from '~/shared/components/ui/dialog';
import { getMotionSpringTransition } from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

import IconSearch from '~icons/lucide/search';

const COMMAND_ITEM_INDICATOR_LAYOUT_ID = 'command-item-leading-indicator';

type CommandIndicatorSource = 'pointer' | 'selected';

interface CommandIndicatorContextValue {
  activeItemId: string | null;
  activeItemSource: CommandIndicatorSource | null;
  setPointerItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setPointerDisabledItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedItemId: React.Dispatch<React.SetStateAction<string | null>>;
}

const CommandIndicatorContext = React.createContext<CommandIndicatorContextValue | null>(null);

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export interface CommandProps extends React.ComponentPropsWithoutRef<typeof CommandPrimitive> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive>>;
}

function Command({ ref, className, ...props }: CommandProps) {
  const [pointerItemId, setPointerItemId] = React.useState<string | null>(null);
  const [pointerDisabledItemId, setPointerDisabledItemId] = React.useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const activeItemId = pointerDisabledItemId ? null : (pointerItemId ?? selectedItemId);
  const activeItemSource: CommandIndicatorSource | null = pointerDisabledItemId
    ? null
    : pointerItemId
      ? 'pointer'
      : selectedItemId
        ? 'selected'
        : null;
  const layoutGroupId = React.useId();
  const indicatorContext = React.useMemo(
    () => ({
      activeItemId,
      activeItemSource,
      setPointerItemId,
      setPointerDisabledItemId,
      setSelectedItemId,
    }),
    [activeItemId, activeItemSource],
  );

  return (
    <CommandIndicatorContext.Provider value={indicatorContext}>
      <LayoutGroup id={layoutGroupId}>
        <CommandPrimitive
          ref={ref}
          className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
            className,
          )}
          {...props}
        />
      </LayoutGroup>
    </CommandIndicatorContext.Provider>
  );
}
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export interface CommandInputProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Input
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Input>>;
}

function CommandInput({ ref, className, ...props }: CommandInputProps) {
  return (
    // eslint-disable-next-line react/no-unknown-property
    <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
      <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

CommandInput.displayName = CommandPrimitive.Input.displayName;

export interface CommandListProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.List
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.List>>;
}

function CommandList({ ref, className, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn(
        'max-h-[300px] overflow-y-auto overflow-x-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      {...props}
    />
  );
}

CommandList.displayName = CommandPrimitive.List.displayName;

export interface CommandEmptyProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Empty
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Empty>>;
}

function CommandEmpty({ ref, ...props }: CommandEmptyProps) {
  return <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm" {...props} />;
}

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export interface CommandGroupProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Group
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Group>>;
}

function CommandGroup({ ref, className, ...props }: CommandGroupProps) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

CommandGroup.displayName = CommandPrimitive.Group.displayName;

export interface CommandSeparatorProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Separator
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Separator>>;
}

function CommandSeparator({ ref, className, ...props }: CommandSeparatorProps) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

export interface CommandItemProps extends React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Item
> {
  ref?: React.Ref<React.ComponentRef<typeof CommandPrimitive.Item>>;
}

function CommandItem({
  ref,
  className,
  disabled,
  onPointerEnter,
  onPointerLeave,
  ...props
}: CommandItemProps) {
  const indicatorContext = React.useContext(CommandIndicatorContext);
  const itemId = React.useId();
  const itemRef = React.useRef<React.ComponentRef<typeof CommandPrimitive.Item>>(null);
  const setPointerItemId = indicatorContext?.setPointerItemId;
  const setPointerDisabledItemId = indicatorContext?.setPointerDisabledItemId;
  const setSelectedItemId = indicatorContext?.setSelectedItemId;

  const setItemRef = React.useCallback(
    (node: React.ComponentRef<typeof CommandPrimitive.Item> | null) => {
      itemRef.current = node;
      setRef(ref, node);
    },
    [ref],
  );

  const isItemDisabled = React.useCallback(() => {
    return disabled === true || itemRef.current?.getAttribute('data-disabled') === 'true';
  }, [disabled]);

  const syncSelectedState = React.useCallback(() => {
    if (!setPointerItemId || !setSelectedItemId) {
      return;
    }

    if (isItemDisabled()) {
      setPointerItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId));
      setSelectedItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId));
      return;
    }

    setPointerDisabledItemId?.((currentItemId) =>
      currentItemId === itemId ? null : currentItemId,
    );

    const isSelected = itemRef.current?.getAttribute('data-selected') === 'true';

    setSelectedItemId((currentItemId) => {
      if (isSelected) {
        return itemId;
      }

      return currentItemId === itemId ? null : currentItemId;
    });
  }, [isItemDisabled, itemId, setPointerDisabledItemId, setPointerItemId, setSelectedItemId]);

  React.useEffect(() => {
    const item = itemRef.current;

    if (!item || !setPointerItemId || !setSelectedItemId) {
      return;
    }

    syncSelectedState();

    const observer = new MutationObserver(syncSelectedState);
    observer.observe(item, {
      attributeFilter: ['data-disabled', 'data-selected'],
      attributes: true,
    });

    return () => {
      observer.disconnect();
      setPointerItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId));
      setPointerDisabledItemId?.((currentItemId) =>
        currentItemId === itemId ? null : currentItemId,
      );
      setSelectedItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId));
    };
  }, [itemId, setPointerDisabledItemId, setPointerItemId, setSelectedItemId, syncSelectedState]);

  const handlePointerEnter = React.useCallback(
    (event: React.PointerEvent<React.ComponentRef<typeof CommandPrimitive.Item>>) => {
      onPointerEnter?.(event);

      if (!event.defaultPrevented) {
        if (isItemDisabled()) {
          setPointerItemId?.((currentItemId) => (currentItemId === itemId ? null : currentItemId));
          setSelectedItemId?.((currentItemId) => (currentItemId === itemId ? null : currentItemId));
          setPointerDisabledItemId?.(itemId);
          return;
        }

        setPointerDisabledItemId?.(null);
        setPointerItemId?.(itemId);
      }
    },
    [
      isItemDisabled,
      itemId,
      onPointerEnter,
      setPointerDisabledItemId,
      setPointerItemId,
      setSelectedItemId,
    ],
  );

  const handlePointerLeave = React.useCallback(
    (event: React.PointerEvent<React.ComponentRef<typeof CommandPrimitive.Item>>) => {
      onPointerLeave?.(event);

      if (!event.defaultPrevented) {
        setPointerItemId?.((currentItemId) => (currentItemId === itemId ? null : currentItemId));
        setPointerDisabledItemId?.((currentItemId) =>
          currentItemId === itemId ? null : currentItemId,
        );
      }
    },
    [itemId, onPointerLeave, setPointerDisabledItemId, setPointerItemId],
  );

  const isIndicatorActive = indicatorContext?.activeItemId === itemId && !isItemDisabled();
  const indicatorMotionMode =
    indicatorContext?.activeItemSource === 'pointer' ? 'animated' : 'instant';
  const indicatorTransition =
    indicatorMotionMode === 'animated' ? getMotionSpringTransition() : { duration: 0 };

  return (
    <CommandPrimitive.Item
      ref={setItemRef}
      className={cn(
        "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:cursor-not-allowed data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      disabled={disabled}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      {...props}
    >
      {isIndicatorActive && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-sm bg-foreground"
          data-layout-id={COMMAND_ITEM_INDICATOR_LAYOUT_ID}
          data-motion-mode={indicatorMotionMode}
          data-slot="command-item-leading-indicator"
          layoutId={COMMAND_ITEM_INDICATOR_LAYOUT_ID}
          transition={indicatorTransition}
        />
      )}
      {props.children}
    </CommandPrimitive.Item>
  );
}

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
};
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
