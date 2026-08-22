import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = 'Service Notice',
  message,
  onRetry,
  onDismiss,
}) => {
  return (
    <div className="flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-xs">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800">{title}</h4>
          <p className="mt-0.5 text-xs text-rose-700">{message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-2xs transition hover:bg-rose-50"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="rounded-lg p-1 text-rose-500 hover:bg-rose-100 hover:text-rose-700"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
