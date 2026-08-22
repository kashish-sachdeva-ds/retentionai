import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Sparkles,
  BarChart3,
  Info,
  X,
  BookOpen,
  Code2,
} from 'lucide-react';
import type { ApiHealth } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  health: ApiHealth | null;
}

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/assess', label: 'Risk Assessment', icon: Sparkles },
  { path: '/evidence', label: 'Model Evidence', icon: BarChart3 },
  { path: '/about', label: 'About & Architecture', icon: Info },
];

export function Sidebar({ isOpen, onClose, health }: SidebarProps) {
  const navigate = useNavigate();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4 transition-transform lg:relative lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div>
        {/* Mobile close button */}
        <div className="flex items-center justify-between pb-2 lg:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Navigation</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-xl shadow-md shadow-indigo-100">
            ⚡
          </div>
          <div>
            <h1 className="font-extrabold text-slate-900 text-base leading-tight tracking-tight">RetentionAI</h1>
            <p className="text-[11px] text-slate-500 font-medium">ML Decision Engine</p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => { navigate('/assess'); onClose(); }}
          className="w-full mb-6 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-sm hover:shadow transition-all"
        >
          <Sparkles className="h-4 w-4" />
          <span>Assess Churn Risk</span>
        </button>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3">
        {/* External Engineering Links */}
        <div className="space-y-1 border-t border-slate-100 pt-3">
          <a
            href="https://github.com/kashish-sachdeva-ds/retentionai/blob/main/docs/ARCHITECTURE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
            <span>Architecture Docs</span>
          </a>
          <a
            href="https://github.com/kashish-sachdeva-ds/retentionai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Code2 className="h-3.5 w-3.5 text-slate-400" />
            <span>GitHub Repository</span>
          </a>
        </div>

        {/* Serving status */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              Model service
            </span>
            <span className="flex h-2 w-2 relative">
              {health?.model_loaded ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              )}
            </span>
          </div>

          <div className="text-[11px] text-slate-600 space-y-1 pt-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <strong className={health?.model_loaded ? 'text-emerald-700' : 'text-amber-700'}>{health?.model_loaded ? 'Ready' : 'Unavailable'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Artifact:</span>
              <strong className="max-w-[120px] truncate font-mono text-slate-700" title={health?.model_version ?? undefined}>{health?.model_version ? health.model_version.slice(0, 12) : '—'}</strong>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
