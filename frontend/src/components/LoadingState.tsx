import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
  inline?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  subtext,
  inline = false,
}) => {
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      <h3 className="mt-4 text-sm font-bold text-slate-800">{message}</h3>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
};
