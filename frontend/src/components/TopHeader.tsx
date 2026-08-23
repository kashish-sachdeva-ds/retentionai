import { ArrowUpRight, Menu, RefreshCw } from 'lucide-react';
import type { ApiHealth } from '../types';

interface TopHeaderProps {
  health: ApiHealth | null;
  healthError: string | null;
  healthLoading: boolean;
  onRefreshHealth: () => void;
  onToggleSidebar: () => void;
}

export function TopHeader({
  health,
  healthLoading,
  onRefreshHealth,
  onToggleSidebar,
}: TopHeaderProps) {
  const isHealthy = health?.status === 'ok' && health.model_loaded;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-8">
      {/* Left: Mobile Menu & Breadcrumb hint */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium text-slate-400 sm:inline">Production Service ·</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isHealthy ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            {isHealthy ? 'Calibrated Model Active' : healthLoading ? 'Checking...' : 'Connecting API'}
          </span>
        </div>
      </div>

      {/* Right: Quick Actions & Status */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onRefreshHealth}
          disabled={healthLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition"
          title="Refresh connection status"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${healthLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-indigo-600 transition"
        >
          <span>FastAPI Docs</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
        </a>

        <a
          href="https://github.com/kashish-sachdeva-ds/retentionai"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition"
        >
          <span>GitHub</span>
          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
        </a>
      </div>
    </header>
  );
}
