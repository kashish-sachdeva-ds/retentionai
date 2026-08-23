import { useState } from 'react';
import { Menu, RefreshCw, BookOpen, ShieldCheck, Code2, Info, HelpCircle } from 'lucide-react';
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
  const [showStatusHelp, setShowStatusHelp] = useState(false);
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
          </div>
          <p className="hidden text-[11px] text-slate-500 sm:block font-medium">
            Churn-prioritization decision support for a constrained call budget
          </p>
        </div>
      </div>

      {/* Right side: Real system signals & repository resources */}
      <div className="flex items-center gap-2.5">
        {/* Live Service Readiness Status */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStatusHelp((v) => !v)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
              online
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70'
                : healthError
                ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
            title="Click for cloud infrastructure details"
          >
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                online
                  ? 'bg-emerald-500 animate-pulse'
                  : healthError
                  ? 'bg-rose-500'
                  : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="text-[11px] font-bold">
              {online
                ? 'API ready'
                : healthError
                ? 'API offline'
                : 'Waking server (~45s)...'}
            </span>
            <HelpCircle className="h-3 w-3 text-slate-400 ml-0.5" />
          </button>

          {/* Cloud Info Popover */}
          {showStatusHelp && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl text-xs z-50 animate-fade-in space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-indigo-600" /> Cloud Architecture
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {online ? 'Active' : 'Spinning Up'}
                </span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Backend is hosted on Render free-tier container services. To conserve resources, instances sleep after 15m of inactivity and wake up automatically on the first user request (~45s).
              </p>
              {health?.model_version && (
                <div className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500 font-mono">
                  Artifact: {health.model_version.slice(0, 18)}...
                </div>
              )}
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowStatusHelp(false)}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Model Version Tag */}
        {health?.model_version && (
          <span
            className="hidden rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-600 md:inline-flex items-center gap-1.5 shadow-2xs"
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
          className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
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
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
        >
          <Code2 className="h-3.5 w-3.5 text-slate-900" />
          <span className="hidden md:inline">GitHub</span>
        </a>

        {/* Real Status Refresh */}
        <button
          onClick={onRefreshHealth}
          disabled={healthLoading}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition"
          aria-label="Refresh API serving status"
          title="Refresh model health"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
