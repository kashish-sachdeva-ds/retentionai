import { Menu, RefreshCw, BookOpen, ShieldCheck, Code2 } from 'lucide-react';
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
  healthError,
  healthLoading,
  onRefreshHealth,
  onToggleSidebar,
}: TopHeaderProps) {
  const online = health?.status === 'ok' && health.model_loaded;

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-8">
      {/* Left side: Brand identity & architecture tag */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-widest text-indigo-700 uppercase">
              RetentionAI
            </span>
            <span className="hidden rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/60 sm:inline-block">
              ML System
            </span>
          </div>
          <p className="hidden text-[11px] text-slate-500 sm:block font-medium">
            Calibrated Customer Churn Prioritization &amp; Conformal Uncertainty
          </p>
        </div>
      </div>

      {/* Right side: Real system signals & repository resources (Zero fake mockups) */}
      <div className="flex items-center gap-2.5">
        {/* Live Service Readiness Status */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
            online
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
              : healthError
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              online
                ? 'bg-emerald-500 animate-pulse'
                : healthError
                ? 'bg-rose-500'
                : 'bg-amber-400'
            }`}
          />
          <span className="text-[11px]">
            {online ? 'API Serving' : healthError ? 'Service Offline' : 'Connecting...'}
          </span>
        </div>

        {/* Model Version Tag */}
        {health?.model_version && (
          <span
            className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-600 md:inline-flex items-center gap-1.5 shadow-2xs"
            title={`Active serving artifact: ${health.model_version}`}
          >
            <ShieldCheck className="h-3 w-3 text-indigo-600" />
            <span>v{health.model_version.slice(0, 10)}</span>
          </span>
        )}

        {/* Documentation / ADR Link */}
        <a
          href="https://github.com/kashish-sachdeva-ds/retentionai/tree/main/docs/decisions"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
          title="View 18 Architecture Decision Records (ADRs)"
        >
          <BookOpen className="h-3.5 w-3.5 text-slate-500" />
          <span>18 ADRs</span>
        </a>

        {/* Real GitHub Repository Link */}
        <a
          href="https://github.com/kashish-sachdeva-ds/retentionai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
        >
          <Code2 className="h-3.5 w-3.5 text-slate-900" />
          <span className="hidden md:inline">GitHub</span>
        </a>

        {/* Real Status Refresh */}
        <button
          onClick={onRefreshHealth}
          disabled={healthLoading}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition"
          aria-label="Refresh API serving status"
          title="Refresh model health"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
