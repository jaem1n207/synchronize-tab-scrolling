import { useEffect } from 'react';

import type { ErrorState } from '../types';

interface ErrorNotificationProps {
  error: ErrorState | null;
  onDismiss: () => void;
  autoDismissDelay?: number;
}

export function ErrorNotification({
  error,
  onDismiss,
  autoDismissDelay = 5000,
}: ErrorNotificationProps) {
  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissDelay);

    return () => clearTimeout(timer);
  }, [error, onDismiss, autoDismissDelay]);

  if (!error) return null;

  const severityStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  const severityIcons = {
    info: '󰋼',
    warning: '',
    error: '',
  };

  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-3 rounded-lg border p-3 shadow-sm transition-all ${severityStyles[error.severity]}`}
      role="alert"
    >
      <span aria-hidden="true" className="text-lg">
        {severityIcons[error.severity]}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{error.message}</p>
        {error.action && (
          <button
            className="mt-2 text-sm font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-offset-2"
            type="button"
            onClick={error.action.handler}
          >
            {error.action.label}
          </button>
        )}
      </div>
      <button
        aria-label="Dismiss notification"
        className="text-current opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
        type="button"
        onClick={onDismiss}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
