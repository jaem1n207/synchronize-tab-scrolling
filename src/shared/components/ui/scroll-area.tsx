'use client';

import * as React from 'react';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '~/shared/lib/utils';

export interface ScrollAreaProps extends React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.Root
> {
  ref?: React.Ref<React.ComponentRef<typeof ScrollAreaPrimitive.Root>>;
}

function ScrollArea({ ref, className, children, ...props }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export interface ScrollBarProps extends React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.ScrollAreaScrollbar
> {
  ref?: React.Ref<React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>>;
}

function ScrollBar({ ref, className, orientation = 'vertical', ...props }: ScrollBarProps) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        className,
      )}
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
