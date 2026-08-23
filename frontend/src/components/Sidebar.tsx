import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  FileCheck2,
  Gauge,
  ListOrdered,
  Radio,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { ApiHealth } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  health: ApiHealth | null;
}

export function Sidebar({ isOpen, onClose, health }: SidebarProps) {
  const isHealthy = health?.status === 'ok' && health.model_loaded;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
        isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-sm shadow-indigo-200">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-slate-900">RetentionAI</span>
            </div>
            <p className="text-[11px] font-medium text-slate-400">Decision Intelligence Platform</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3.5 py-4">
        {/* Section 1: Decision Intelligence */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Decision Layer
          </div>
          <div className="space-y-0.5">
            <NavItem to="/" icon={<Activity className="h-4 w-4" />} label="Command Center" end />
            <NavItem to="/queue" icon={<ListOrdered className="h-4 w-4" />} label="Priority Queue" badge="Live 7k" />
            <NavItem to="/assess" icon={<Sparkles className="h-4 w-4" />} label="Live Assessment" />
            <NavItem to="/scenarios" icon={<SlidersHorizontal className="h-4 w-4" />} label="Scenario Lab" />
          </div>
        </div>

        {/* Section 2: ML Platform & Trust */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            ML Platform & Trust
          </div>
          <div className="space-y-0.5">
            <NavItem to="/evaluation" icon={<BarChart3 className="h-4 w-4" />} label="Evaluation Center" />
            <NavItem to="/monitoring" icon={<Radio className="h-4 w-4" />} label="Drift & Monitoring" />
          </div>
        </div>

        {/* Section 3: Governance & Lineage */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Governance & Lineage
          </div>
          <div className="space-y-0.5">
            <NavItem to="/governance" icon={<FileCheck2 className="h-4 w-4" />} label="Audit & Registry" />
          </div>
        </div>
      </nav>

      {/* Footer System Status */}
      <div className="border-t border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy ? 'bg-emerald-500 ring-4 ring-emerald-100 animate-pulse' : 'bg-amber-500 ring-4 ring-amber-100'
              }`}
            />
            <span className="text-xs font-semibold text-slate-700">
              {isHealthy ? 'Pipeline Active' : 'Service Connecting'}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {health?.model_version ? `v${health.model_version.slice(0, 8)}` : '7,043 holdout'}
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon,
  label,
  badge,
  end = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? 'bg-indigo-50 font-semibold text-indigo-900 shadow-xs'
            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`
      }
    >
      <div className="flex items-center gap-3">
        <span className="text-slate-400 group-[.active]:text-indigo-600">{icon}</span>
        <span>{label}</span>
      </div>
      {badge && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 group-[.active]:bg-indigo-100 group-[.active]:text-indigo-700">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
