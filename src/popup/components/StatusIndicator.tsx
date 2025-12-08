import { cn } from '~/shared/lib/utils';

import type { ConnectionStatus } from '../types';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  return (
    <span
      aria-label={`Connection status: ${status}`}
      className={cn('relative flex h-2 w-2 shrink-0', className)}
      role="status"
    >
      {status === 'connected' && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </>
      )}
      {status === 'disconnected' && (
        <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-400" />
      )}
      {status === 'error' && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </>
      )}
    </span>
  );
}
