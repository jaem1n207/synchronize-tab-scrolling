import * as React from 'react';

import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '~/shared/lib/utils';

export interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Root>>;
}

function Avatar({ ref, className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}
Avatar.displayName = AvatarPrimitive.Root.displayName;

export interface AvatarImageProps extends React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Image
> {
  ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Image>>;
}

function AvatarImage({ ref, className, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn('aspect-square h-full w-full', className)}
      {...props}
    />
  );
}
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export interface AvatarFallbackProps extends React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Fallback
> {
  ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Fallback>>;
}

function AvatarFallback({ ref, className, ...props }: AvatarFallbackProps) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  );
}
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
