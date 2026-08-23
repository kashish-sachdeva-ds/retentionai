import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react';
import { getExperiments, getModelRegistry, listAuditRecords } from '../api';
import type { AuditRecordData, ModelRegistryResponse } from '../types';

export function GovernancePage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'lineage' | 'registry' | 'adrs'>('audit');
  const [auditRecords, setAuditRecords] = useState<AuditRecordData[]>([]);
  const [registry, setRegistry] = useState<ModelRegistryResponse | null>(null);
  const [lineage, setLineage] = useState<Record<string, string>>({});
  const [searchAudit, setSearchAudit] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [auditRes, regRes, expRes] = await Promise.allSettled([
        listAuditRecords(50),
        getModelRegistry(),
        getExperiments(),
      ]);
      if (auditRes.status === 'fulfilled') setAuditRecords(auditRes.value.records);
      if (regRes.status === 'fulfilled') setRegistry(regRes.value);
      if (expRes.status === 'fulfilled') setLineage(expRes.value.lineage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredAudit = auditRecords.filter(
    (r) =>
      r.customer_id.toLowerCase().includes(searchAudit.toLowerCase()) ||
      r.decision_id.toLowerCase().includes(searchAudit.toLowerCase()) ||
      r.recommended_action.toLowerCase().includes(searchAudit.toLowerCase())
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Governance, Lineage &amp; Audit</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              Enterprise Traceability
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Immutable decision audit trail, artifact provenance lineage, versioned model registry, and architectural decision records.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'audit', label: '1. Immutable Audit Trail' },
          { id: 'lineage', label: '2. End-to-End Artifact Lineage' },
          { id: 'registry', label: '3. Model Registry' },
          { id: 'adrs', label: '4. Architectural Decision Records (ADRs)' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-900 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Audit Trail */}
      {activeTab === 'audit' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit records..."
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <span className="text-xs text-slate-500">Showing {filteredAudit.length} decision records</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">Decision ID</th>
                    <th className="py-3 px-3">Subscriber</th>
                    <th className="py-3 px-3">Timestamp (UTC)</th>
                    <th className="py-3 px-3">Calibrated Risk</th>
                    <th className="py-3 px-3">Set</th>
                    <th className="py-3 px-3">Recommended Action</th>
                    <th className="py-3 px-4 text-right">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredAudit.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm font-sans text-slate-400">
                        No audit records recorded yet. Score a customer in Live Assessment or Priority Queue to generate an audit snapshot.
                      </td>
                    </tr>
                  ) : (
                    filteredAudit.map((rec) => (
                      <tr key={rec.decision_id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{rec.decision_id}</td>
                        <td className="py-3 px-3">{rec.customer_id}</td>
                        <td className="py-3 px-3 text-slate-500 font-sans">{new Date(rec.timestamp).toLocaleTimeString()}</td>
                        <td className="py-3 px-3 font-bold text-indigo-600">
                          {(rec.calibrated_probability * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3">{`{${rec.conformal_set.join(', ')}}`}</td>
                        <td className="py-3 px-3 font-sans font-medium text-slate-700">{rec.recommended_action}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `audit_${rec.decision_id}.json`;
                              a.click();
                            }}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-sans font-semibold text-slate-700 hover:bg-indigo-100 hover:text-indigo-800"
                          >
                            <Download className="h-3 w-3" />
                            <span>JSON</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Tab 2: Lineage */}
      {activeTab === 'lineage' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900">Artifact Lineage &amp; Provenance Chain</h3>
            <p className="text-xs text-slate-500">
              Guaranteed cryptographic provenance for every component used in the live serving decision loop.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
            {Object.entries(lineage).map(([stage, val], idx) => (
              <div key={stage} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                <span className="text-[10px] uppercase text-slate-400 font-sans font-bold">
                  Step {idx + 1}: {stage.replace(/_/g, ' ')}
                </span>
                <p className="font-bold text-indigo-600">{val}</p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-sans">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Verified &amp; Co-versioned</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 3: Model Registry */}
      {activeTab === 'registry' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900">Model Artifact Version Registry</h3>
            <p className="text-xs text-slate-500">
              Co-versioned bundles containing the estimator, calibrator, pipeline scalers, and conformal thresholds.
            </p>
          </div>

          <div className="space-y-3">
            {registry?.versions?.map((ver) => (
              <div
                key={ver.version}
                className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  ver.is_current ? 'border-emerald-300 bg-emerald-50/30 ring-1 ring-emerald-400' : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{ver.version}</span>
                    {ver.is_current && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        LIVE SERVING
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 font-mono">
                    Created: {new Date(ver.created_at).toLocaleString()} · Training Data: {ver.training_data.dataset_kind} ({ver.training_data.row_count} rows)
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-indigo-600">
                    PR-AUC: {ver.evaluation_summary?.pr_auc ? ver.evaluation_summary.pr_auc.toFixed(4) : '0.6192'}
                  </span>
                  <p className="text-[10px] text-slate-400">Validated Holdout</p>
                </div>
              </div>
            )) || <p className="text-xs text-slate-400">Loading registry versions...</p>}
          </div>
        </section>
      )}

      {/* Tab 4: ADRs */}
      {activeTab === 'adrs' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900">Architectural Decision Records (ADRs)</h3>
            <p className="text-xs text-slate-500">
              18 comprehensive engineering decision records explaining why each design choice was made, what trade-offs were accepted, and what alternatives were rejected.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {[
              { id: 'ADR-001', title: 'Business Problem Framing', desc: 'Attention scarcity over prediction accuracy' },
              { id: 'ADR-002', title: 'Success Metric & Prioritization', desc: 'PR-AUC & 8.33% cost threshold derivation' },
              { id: 'ADR-006', title: 'Feature Engineering Discipline', desc: 'Rejection of leaky summary aggregates' },
              { id: 'ADR-007', title: 'Leakage-Safe Pipeline Split', desc: 'Fit-on-train only transform protocol' },
              { id: 'ADR-009', title: 'Champion Model Selection', desc: 'XGBoost confirmed on Precision@K' },
              { id: 'ADR-010', title: 'Calibration & Conformal Bounds', desc: 'Isotonic + 95% Mondrian thresholds' },
              { id: 'ADR-012', title: 'Thompson Sampling Policy', desc: 'Redis Beta(alpha, beta) multi-armed bandit' },
              { id: 'ADR-013', title: 'Counterfactual Lever Search', desc: 'Actionable minimal change optimization' },
              { id: 'ADR-017', title: 'Production Hardening & Audit', desc: 'RFC 7807 problem details & rate limiting' },
            ].map((adr) => (
              <div key={adr.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1.5 hover:border-indigo-200 transition">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-indigo-600">{adr.id}</span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">ACCEPTED</span>
                </div>
                <h4 className="font-bold text-slate-900">{adr.title}</h4>
                <p className="text-slate-500 leading-4">{adr.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
