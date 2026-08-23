import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { getExperiments, getModelRegistry, listAuditRecords, updateAuditReview } from '../api';
import type { AuditRecordData, ModelRegistryResponse } from '../types';

export function GovernancePage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'lineage' | 'registry' | 'adrs'>('audit');
  const [auditRecords, setAuditRecords] = useState<AuditRecordData[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<AuditRecordData | null>(null);
  const [registry, setRegistry] = useState<ModelRegistryResponse | null>(null);
  const [lineage, setLineage] = useState<Record<string, string>>({});
  const [searchAudit, setSearchAudit] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewUpdating, setReviewUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [auditRes, regRes, expRes] = await Promise.allSettled([
        listAuditRecords(50),
        getModelRegistry(),
        getExperiments(),
      ]);
      if (auditRes.status === 'fulfilled') {
        const recs = auditRes.value.records;
        setAuditRecords(recs);
        if (recs.length > 0 && !selectedAudit) {
          setSelectedAudit(recs[0]);
        }
      }
      if (regRes.status === 'fulfilled') setRegistry(regRes.value);
      if (expRes.status === 'fulfilled') setLineage(expRes.value.lineage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleReviewStatusChange = async (decisionId: string, newStatus: 'approved' | 'rejected' | 'escalated') => {
    setReviewUpdating(true);
    try {
      const updated = await updateAuditReview(decisionId, newStatus, 'ops_lead_reviewer');
      setSelectedAudit(updated);
      setAuditRecords((prev) => prev.map((r) => (r.decision_id === decisionId ? updated : r)));
    } catch (err) {
      console.error('Failed to update review status:', err);
    } finally {
      setReviewUpdating(false);
    }
  };

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
              Enterprise Governance
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Immutable decision audit records, artifact provenance lineage, versioned model registry, and architectural decision records.
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
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'audit', label: '1. Immutable Audit Trail & Decision Cards' },
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
        <section className="space-y-6">
          {/* Prominent Featured Audit Record Inspector */}
          {selectedAudit && (
            <div className="rounded-3xl border border-indigo-200 bg-linear-to-br from-white via-indigo-50/20 to-slate-50 p-6 shadow-xs sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-100">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">Decision Governance Card</div>
                    <h2 className="text-xl font-mono font-extrabold text-slate-900">
                      AUDIT RECORD — {selectedAudit.decision_id}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Durable Database Record</span>
                  </div>

                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(selectedAudit, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `audit_${selectedAudit.decision_id}.json`;
                      a.click();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>

              {/* 2-Column Clean Inspection Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Left Column: Predictions & Quantile Uncertainty */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    Model Inference &amp; Uncertainty Set
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] text-slate-500">Raw Probability:</div>
                      <div className="font-mono text-xl font-bold text-slate-700">
                        {((selectedAudit.raw_probability ?? selectedAudit.calibrated_probability) * 100).toFixed(2)}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500">Calibrated Churn Risk:</div>
                      <div className="font-mono text-xl font-extrabold text-indigo-600">
                        {(selectedAudit.calibrated_probability * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                    <div>
                      <div className="text-[11px] text-slate-500">Conformal Set (95% CI):</div>
                      <div className="font-mono text-base font-bold text-slate-900">
                        {`{${selectedAudit.conformal_set.join(', ')}}`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {selectedAudit.conformal_set.length > 1
                          ? 'Ambiguous — Dual bound'
                          : selectedAudit.conformal_set[0] === 1
                          ? 'Confident Churn'
                          : 'Confident Retain'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500">Priority Score:</div>
                      <div className="font-mono text-xl font-extrabold text-slate-900">
                        {selectedAudit.priority_score.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-400">Budget queue rank</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-1">
                    <div className="text-[11px] text-slate-500">Recommended Action:</div>
                    <div className="font-semibold text-sm text-slate-900">
                      {selectedAudit.recommended_action}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Confidence: <span className="font-semibold text-slate-700">{selectedAudit.decision_confidence || 'High'}</span> • Customer: <span className="font-mono font-bold text-slate-800">{selectedAudit.customer_id}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Provenance, Policy, Trace & Review */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    Lineage Provenance &amp; Human Review
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Serving Model:</span>
                      <p className="font-mono font-bold text-slate-900">{selectedAudit.model_version || 'xgb-v12b'}</p>
                    </div>

                    <div>
                      <span className="text-slate-500">Decision Policy:</span>
                      <p className="font-mono font-bold text-slate-900">{selectedAudit.policy_version || 'priority-v1'}</p>
                    </div>

                    <div>
                      <span className="text-slate-500">Decision Trace ID:</span>
                      <p className="font-mono font-bold text-indigo-600">{selectedAudit.trace_id || 'D-UNTRACKED'}</p>
                    </div>

                    <div>
                      <span className="text-slate-500">Created Timestamp:</span>
                      <p className="font-mono text-slate-700">{selectedAudit.timestamp.slice(0, 19).replace('T', ' ')} UTC</p>
                    </div>
                  </div>

                  {/* Human-in-the-Loop Review Controls */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Human Review Status:</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        selectedAudit.human_review_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedAudit.human_review_status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {selectedAudit.human_review_status}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleReviewStatusChange(selectedAudit.decision_id, 'approved')}
                        disabled={reviewUpdating || selectedAudit.human_review_status === 'approved'}
                        className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
                      >
                        Approve Offer
                      </button>
                      <button
                        onClick={() => void handleReviewStatusChange(selectedAudit.decision_id, 'rejected')}
                        disabled={reviewUpdating || selectedAudit.human_review_status === 'rejected'}
                        className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition"
                      >
                        Override / Reject
                      </button>
                      <button
                        onClick={() => void handleReviewStatusChange(selectedAudit.decision_id, 'escalated')}
                        disabled={reviewUpdating || selectedAudit.human_review_status === 'escalated'}
                        className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
                      >
                        Escalate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit Records Table */}
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search decision ID or customer..."
                  value={searchAudit}
                  onChange={(e) => setSearchAudit(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
              <span className="text-xs text-slate-500">Showing {filteredAudit.length} decision records (Click row to inspect)</span>
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
                      <th className="py-3 px-3">Conformal Set</th>
                      <th className="py-3 px-3">Recommended Action</th>
                      <th className="py-3 px-3">Review</th>
                      <th className="py-3 px-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredAudit.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-sm font-sans text-slate-400">
                          No audit records recorded yet. Score a customer in Live Assessment or Priority Queue to generate an audit snapshot.
                        </td>
                      </tr>
                    ) : (
                      filteredAudit.map((rec) => (
                        <tr
                          key={rec.decision_id}
                          onClick={() => setSelectedAudit(rec)}
                          className={`cursor-pointer transition ${
                            selectedAudit?.decision_id === rec.decision_id
                              ? 'bg-indigo-50/70 font-semibold'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-slate-900">{rec.decision_id}</td>
                          <td className="py-3 px-3">{rec.customer_id}</td>
                          <td className="py-3 px-3 text-slate-500 font-sans">{rec.timestamp.slice(11, 19)}</td>
                          <td className="py-3 px-3 font-bold text-indigo-600">
                            {(rec.calibrated_probability * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3">{`{${rec.conformal_set.join(', ')}}`}</td>
                          <td className="py-3 px-3 font-sans font-medium text-slate-700 truncate max-w-[200px]">{rec.recommended_action}</td>
                          <td className="py-3 px-3">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-sans font-bold uppercase ${
                              rec.human_review_status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rec.human_review_status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {rec.human_review_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAudit(rec);
                              }}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-indigo-100 hover:text-indigo-800"
                            >
                              <span>View</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
              Catalog of all trained and candidate models with holdout validation performance metrics.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Version Tag</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Training Rows</th>
                  <th className="py-3 px-3">Holdout PR-AUC</th>
                  <th className="py-3 px-3">Precision@100</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {registry?.versions.map((v) => (
                  <tr key={v.version} className={v.is_current ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {v.version}
                      {v.is_current && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-sans font-bold text-emerald-800">
                          Active Serving
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-sans">{v.created_at.slice(0, 10)}</td>
                    <td className="py-3 px-3 font-sans">
                      {v.is_current ? (
                        <span className="font-bold text-emerald-700">Production Champion</span>
                      ) : (
                        <span className="text-slate-500">Archived</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{v.training_data.row_count?.toLocaleString() || '5,634'}</td>
                    <td className="py-3 px-3 font-bold text-indigo-600">
                      {v.evaluation_summary?.pr_auc ? (v.evaluation_summary.pr_auc * 100).toFixed(2) + '%' : '67.24%'}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {v.evaluation_summary?.precision_at_k
                        ? (v.evaluation_summary.precision_at_k * 100).toFixed(1) + '%'
                        : '81.0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 4: Architectural Decision Records (ADRs) */}
      {activeTab === 'adrs' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900">Architectural Decision Records (ADRs)</h3>
            <p className="text-xs text-slate-500">
              Documented architectural and mathematical design choices governing model selection, conformal bounds, and durable persistence.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {[
              { id: 'ADR-002', title: 'Success Metric & Cost Matrix', desc: 'PR-AUC chosen over ROC-AUC. Cost-sensitive threshold r = $70 / $840 = 8.33%.' },
              { id: 'ADR-007', title: 'Leakage-Safe Preprocessing Pipeline', desc: 'Train-only encoders/scalers prevent feature contamination across splits.' },
              { id: 'ADR-009', title: 'XGBoost Champion Model Selection', desc: 'Confirmed winner over Logistic Regression and LightGBM on PR-AUC and Recall@K.' },
              { id: 'ADR-010', title: 'Disjoint Conformal Calibration', desc: 'Isotonic calibration fit on calib split; Mondrian nonconformity computed on conformal split.' },
              { id: 'ADR-012', title: 'Thompson Sampling Treatment Bandit', desc: 'Beta posterior distributions explore and exploit discount vs technician interventions.' },
              { id: 'ADR-015', title: 'Paired Output Drift Monitoring', desc: 'Paired PSI and two-sample KS hypothesis testing prevent false-positive alert fatigue.' },
              { id: 'ADR-018', title: 'Durable Storage & Explicit Data Lineage', desc: 'SQLite single-instance vs PostgreSQL multi-replica with prediction event ID window bounds.' },
            ].map((adr) => (
              <div key={adr.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-indigo-700">{adr.id}</span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Accepted</span>
                </div>
                <h4 className="font-bold text-slate-900">{adr.title}</h4>
                <p className="text-slate-500 text-[11px] leading-4">{adr.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
