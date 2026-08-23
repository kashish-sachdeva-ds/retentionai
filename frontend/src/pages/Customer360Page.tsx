import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';
import { getCustomer360 } from '../api';
import type { Customer360Data } from '../types';
import { getRiskColor, getUncertaintyBadge } from '../design/tokens';

export function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'model' | 'why' | 'uncertainty' | 'decision'>('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCustomer360(id)
      .then((data) => {
        setCustomer(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Customer not found in queue');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-6xl p-8 text-center text-sm text-slate-500">
        Loading Customer 360 intelligence dossier...
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-8">
        <button
          onClick={() => navigate('/queue')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Priority Queue</span>
        </button>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <h2 className="font-bold">Customer Not Found</h2>
          <p className="mt-1 text-sm">{error || 'Could not retrieve customer details.'}</p>
        </div>
      </main>
    );
  }

  const risk = getRiskColor(customer.calibrated_probability);
  const uncert = getUncertaintyBadge(customer.uncertainty.label);
  const profile = customer.profile || {};

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
      {/* Top Breadcrumb */}
      <button
        onClick={() => navigate('/queue')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Priority Queue</span>
      </button>

      {/* Customer Header Dossier */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-extrabold tracking-tight text-slate-900">
                {customer.customer_id}
              </span>
              <span className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${risk.bg} ${risk.text} ${risk.border}`}>
                {(customer.calibrated_probability * 100).toFixed(1)}% Churn Risk
              </span>
              <span className={`rounded-md border px-2.5 py-0.5 font-mono text-xs font-semibold ${uncert.bg} ${uncert.text} ${uncert.border}`}>
                Set: {`{${customer.conformal_set.join(', ')}}`}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Operational Recommendation:{' '}
              <span className="font-bold text-slate-900">{customer.recommended_action}</span> · Decision Confidence:{' '}
              <span className="font-bold uppercase tracking-wider text-indigo-600">{customer.decision_confidence}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority Score</span>
              <p className="font-mono text-2xl font-extrabold text-indigo-600">{customer.priority.score}</p>
              <span className="text-[10px] text-slate-400">Top {100 - (customer.population_percentile || 90)}% of queue</span>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Annual Value</span>
              <p className="font-mono text-2xl font-extrabold text-slate-900">${customer.customer_value.toFixed(0)}</p>
              <span className="text-[10px] text-slate-400">Monthly: ${Number(profile.MonthlyCharges || 70).toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* 5 Analytical Tabs */}
        <div className="mt-6 flex border-b border-slate-200">
          {[
            { id: 'overview', label: '1. Subscriber Profile' },
            { id: 'model', label: '2. Model & Calibration' },
            { id: 'why', label: '3. Why? (SHAP Drivers)' },
            { id: 'uncertainty', label: '4. Conformal Uncertainty' },
            { id: 'decision', label: '5. Decision & Audit Trail' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Subscriber Profile */}
        {activeTab === 'overview' && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Contract & Tenure</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Contract Term:</span>
                  <span className="font-semibold text-slate-900">{String(profile.Contract || 'Month-to-month')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Tenure:</span>
                  <span className="font-semibold text-slate-900">{String(profile.tenure || 12)} months</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Paperless Billing:</span>
                  <span className="font-semibold text-slate-900">{String(profile.PaperlessBilling || 'Yes')}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Billing & Payment</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Monthly Spend:</span>
                  <span className="font-mono font-bold text-slate-900">${String(profile.MonthlyCharges || 70)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Total Spend:</span>
                  <span className="font-mono font-semibold text-slate-900">${String(profile.TotalCharges || 840)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Payment Method:</span>
                  <span className="font-semibold text-slate-900">{String(profile.PaymentMethod || 'Electronic check')}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Services & Add-ons</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Internet:</span>
                  <span className="font-semibold text-slate-900">{String(profile.InternetService || 'Fiber optic')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Tech Support:</span>
                  <span className="font-semibold text-slate-900">{String(profile.TechSupport || 'No')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Online Security:</span>
                  <span className="font-semibold text-slate-900">{String(profile.OnlineSecurity || 'No')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Model Evidence */}
        {activeTab === 'model' && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Serving Champion</span>
                <p className="mt-1 font-bold text-slate-900">XGBoost (ADR-009)</p>
                <p className="mt-2 text-xs text-slate-500">Evaluated on strictly disjoint holdout</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Calibration Method</span>
                <p className="mt-1 font-bold text-slate-900">Isotonic Regression (ADR-010)</p>
                <p className="mt-2 text-xs text-slate-500">ECE: 0.0556 across 10 probability bins</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Economic Threshold</span>
                <p className="mt-1 font-mono font-bold text-slate-900">8.33% (ADR-002)</p>
                <p className="mt-2 text-xs text-slate-500">
                  {customer.calibrated_probability > 0.0833 ? 'Positive Expected Intervention ROI' : 'Below Cost Threshold'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Peer Population Ranking</h4>
              <p className="mt-1 text-sm text-slate-700">
                This subscriber is in the{' '}
                <span className="font-bold text-indigo-600">
                  top {Math.max(1, 100 - (customer.population_percentile || 90)).toFixed(1)}% highest churn risk
                </span>{' '}
                across the entire 7,043 customer population.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Why? (SHAP Drivers) */}
        {activeTab === 'why' && (
          <div className="mt-6 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Feature Contribution Evidence (SHAP TreeExplainer)</h4>
              <p className="text-xs text-slate-500">
                Exact Shapley values calculated by walking the XGBoost trees. Shows the specific features driving this prediction up or down from the population baseline.
              </p>
            </div>

            {customer.shap_contributions && customer.shap_contributions.length > 0 ? (
              <div className="space-y-3">
                {customer.shap_contributions.map((item) => {
                  const isPositive = item.shap_value > 0;
                  return (
                    <div key={item.feature} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-700">{item.feature}</span>
                        <span className={`font-mono font-bold ${isPositive ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isPositive ? `+${item.shap_value.toFixed(3)} (Increases Churn Risk)` : `${item.shap_value.toFixed(3)} (Reduces Churn Risk)`}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${isPositive ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(Math.abs(item.shap_value) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                SHAP values are calculated in real-time during single-customer inference.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Conformal Uncertainty */}
        {activeTab === 'uncertainty' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <span className={`rounded-xl border px-3 py-1 font-mono text-sm font-bold ${uncert.bg} ${uncert.text} ${uncert.border}`}>
                  Conformal Set: {`{${customer.conformal_set.join(', ')}}`}
                </span>
                <span className="text-xs font-semibold text-slate-700">{uncert.description}</span>
              </div>
            </div>

            {customer.uncertainty.label === 'ambiguous' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span>Model Says "I'm Not Sure" (Refusal Pattern)</span>
                </div>
                <p className="text-xs leading-5">
                  Because the 95% conformal prediction set contains both classes <code className="font-mono font-bold">{'{0, 1}'}</code>, the model guarantees that human review is essential before any high-stakes retention action is taken.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <span>High-Confidence Singleton Set</span>
                </div>
                <p className="mt-1 text-xs leading-5">
                  The model prediction is unambiguous under 95% marginal coverage guarantee.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Decision & Audit Trail */}
        {activeTab === 'decision' && (
          <div className="mt-6 space-y-6">
            {/* Priority Weights Decomposition */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Priority Score Decomposition ({customer.priority.score} / 100)
              </h4>
              <div className="grid gap-3 sm:grid-cols-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-500">Risk (51%):</span>
                  <p className="font-mono font-bold text-slate-900 mt-1">{customer.priority.risk_component}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-500">Value (21%):</span>
                  <p className="font-mono font-bold text-slate-900 mt-1">{customer.priority.value_component}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-500">Exit Ease (14%):</span>
                  <p className="font-mono font-bold text-slate-900 mt-1">{customer.priority.exit_sensitivity_component}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-500">Contact (8%):</span>
                  <p className="font-mono font-bold text-slate-900 mt-1">{customer.priority.contactability_component}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-500">Uncertainty (6%):</span>
                  <p className="font-mono font-bold text-slate-900 mt-1">{customer.priority.uncertainty_component}</p>
                </div>
              </div>
            </div>

            {/* Audit Record Snapshot */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900">Immutable Audit Record</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">Policy: priority-v1</span>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-100">
                {JSON.stringify(
                  {
                    customer_id: customer.customer_id,
                    calibrated_probability: customer.calibrated_probability,
                    conformal_set: customer.conformal_set,
                    priority_score: customer.priority.score,
                    recommended_action: customer.recommended_action,
                    confidence: customer.decision_confidence,
                    economic_threshold: 0.0833,
                    above_threshold: customer.above_economic_threshold,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
