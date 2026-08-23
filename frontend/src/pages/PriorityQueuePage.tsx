import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  Info,
  RefreshCw,
  Search,
} from 'lucide-react';
import { getQueue } from '../api';
import type { QueueResponse } from '../types';
import { getRiskColor, getUncertaintyBadge } from '../design/tokens';

export function PriorityQueuePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAmbiguousOnly, setFilterAmbiguousOnly] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(100);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await getQueue(200, 0);
      setData(res);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchQueue();
  }, []);

  const allCustomers = data?.customers || [];

  // Filter customers by search and ambiguity
  const filteredCustomers = allCustomers.filter((c) => {
    const matchesSearch =
      c.customer_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.recommended_action.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterAmbiguousOnly) {
      return matchesSearch && c.uncertainty.human_review_required;
    }
    return matchesSearch;
  });

  const displayCustomers = filteredCustomers.slice(0, budgetLimit);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Priority Retention Queue</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              Live Holdout (7,043)
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Multi-factor operational triage ranking (Risk 51% + Value 21% + Exit Ease 14% + Contactability 8% + Uncertainty 6%)
          </p>
        </div>

        <button
          onClick={fetchQueue}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-score Queue</span>
        </button>
      </div>

      {/* Control Bar: Budget Slider & Filters */}
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-[1.4fr_1fr_auto]">
        {/* Budget Allocation Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Call Capacity Constraint (Budget):</span>
            <span className="font-mono font-bold text-indigo-600">Top {budgetLimit} Calls Selected</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>10 calls (Strict)</span>
            <span>100 calls (Standard Team)</span>
            <span>200 calls (Extended)</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID or action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* Ambiguity Quick Toggle */}
        <div className="flex items-center">
          <button
            onClick={() => setFilterAmbiguousOnly(!filterAmbiguousOnly)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              filterAmbiguousOnly
                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className={`h-3.5 w-3.5 ${filterAmbiguousOnly ? 'text-amber-700' : 'text-slate-400'}`} />
            <span>Human Review Required Only</span>
          </button>
        </div>
      </section>

      {/* Main Ranked Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3.5 pl-4 pr-2 sm:pl-6">Rank &amp; ID</th>
                <th className="px-3 py-3.5">Calibrated Risk</th>
                <th className="px-3 py-3.5">Uncertainty State</th>
                <th className="px-3 py-3.5">Customer Value</th>
                <th className="px-3 py-3.5">Priority Score</th>
                <th className="px-3 py-3.5">Operational Action</th>
                <th className="py-3.5 pl-2 pr-4 sm:pr-6 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    Loading live holdout queue predictions...
                  </td>
                </tr>
              ) : displayCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No customers match your active filter criteria.
                  </td>
                </tr>
              ) : (
                displayCustomers.map((cust, index) => {
                  const isExpanded = expandedCustomerId === cust.customer_id;
                  const risk = getRiskColor(cust.calibrated_probability);
                  const uncert = getUncertaintyBadge(cust.uncertainty.label);

                  return (
                    <Fragment key={cust.customer_id}>
                    <tr
                      className={`group transition hover:bg-slate-50/80 ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                    >
                      {/* Rank & ID */}
                      <td className="py-3.5 pl-4 pr-2 sm:pl-6">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[11px] font-bold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                            #{index + 1}
                          </span>
                          <button
                            onClick={() => navigate(`/customer/${encodeURIComponent(cust.customer_id)}`)}
                            className="font-mono font-bold text-slate-900 hover:text-indigo-600 hover:underline"
                          >
                            {cust.customer_id}
                          </button>
                        </div>
                      </td>

                      {/* Calibrated Risk */}
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 font-mono font-bold ${risk.bg} ${risk.text} ${risk.border}`}>
                            {(cust.calibrated_probability * 100).toFixed(1)}%
                          </span>
                          {cust.above_economic_threshold && (
                            <span className="text-[10px] font-semibold text-emerald-600" title="Exceeds 8.33% economic triage threshold">
                              &gt;8.3% ROI
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Uncertainty */}
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${uncert.bg} ${uncert.text} ${uncert.border}`}>
                            {`{${cust.conformal_set.join(', ')}}`}
                          </span>
                          {cust.uncertainty.human_review_required && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                              Review
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Value */}
                      <td className="px-3 py-3.5">
                        <span className="font-mono font-semibold text-slate-800">
                          ${cust.customer_value.toFixed(0)}/yr
                        </span>
                      </td>

                      {/* Priority Score */}
                      <td className="px-3 py-3.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-600">{cust.priority.score}</span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${cust.priority.score}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Operational Action */}
                      <td className="px-3 py-3.5">
                        <span className="font-medium text-slate-700">{cust.recommended_action}</span>
                      </td>

                      {/* Action & Expand */}
                      <td className="py-3.5 pl-2 pr-4 sm:pr-6 text-right">
                        <button
                          onClick={() => setExpandedCustomerId(isExpanded ? null : cust.customer_id)}
                          aria-expanded={isExpanded}
                          aria-controls={`priority-rationale-${cust.customer_id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <span>{isExpanded ? 'Hide' : 'Why?'}</span>
                          <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr id={`priority-rationale-${cust.customer_id}`} className="bg-indigo-50/30">
                        <td colSpan={7} className="px-4 pb-5 pt-1 sm:px-6">
                          <section className="rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs" aria-label={`Priority rationale for ${cust.customer_id}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h2 className="text-sm font-bold text-slate-900">Why this customer is prioritized</h2>
                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                  The <span className="font-semibold text-indigo-700">{cust.priority.score.toFixed(1)} / 100</span> priority score combines churn risk, customer value, ease of exit, reachability, and model certainty.
                                </p>
                              </div>
                              <button
                                onClick={() => navigate(`/customer/${encodeURIComponent(cust.customer_id)}`)}
                                className="shrink-0 text-left text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                Open customer dossier
                              </button>
                            </div>

                            <dl className="mt-4 grid gap-2 sm:grid-cols-5">
                              {[
                                ['Risk', cust.priority.risk_component, '51% weight'],
                                ['Customer value', cust.priority.value_component, '21% weight'],
                                ['Exit ease', cust.priority.exit_sensitivity_component, '14% weight'],
                                ['Reachability', cust.priority.contactability_component, '8% weight'],
                                ['Certainty', cust.priority.uncertainty_component, '6% weight'],
                              ].map(([label, component, weight]) => (
                                <div key={label} className="rounded-lg bg-slate-50 p-2.5">
                                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                                  <dd className="mt-1 font-mono text-sm font-bold text-slate-900">{Number(component).toFixed(1)} pts</dd>
                                  <p className="mt-0.5 text-[10px] text-slate-400">{weight}</p>
                                </div>
                              ))}
                            </dl>

                            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">Current evidence:</span>{' '}
                              {(cust.calibrated_probability * 100).toFixed(1)}% calibrated churn risk, ${cust.customer_value.toFixed(0)} annual value,{' '}
                              {cust.uncertainty.human_review_required ? 'and an ambiguous prediction that requires human review.' : `with ${cust.decision_confidence} decision confidence.`}
                            </p>
                          </section>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Priority Decomposition Helper Panel */}
      <footer className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-600">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-900">Why Multi-Factor Priority Scoring Matters:</p>
            <p className="leading-5 text-slate-600">
              A customer with 70% churn risk paying $120/month on a month-to-month contract is far more urgent
              for a diagnostic call than a customer with 75% risk paying $20/month locked in a two-year contract.
              RetentionAI's policy engine weights business impact alongside statistical risk.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
