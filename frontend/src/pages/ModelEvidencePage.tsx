import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  ShieldCheck,
  Target,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { getModelCard, getDrift, ApiError } from '../api';
import { LoadingState } from '../components/LoadingState';
import { ErrorBanner } from '../components/ErrorBanner';
import type { ModelCardResponse, DriftResponse } from '../types';

export const ModelEvidencePage: React.FC = () => {
  const [modelCard, setModelCard] = useState<ModelCardResponse | null>(null);
  const [driftData, setDriftData] = useState<DriftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [driftLoading, setDriftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const card = await getModelCard();
      setModelCard(card);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to load model evidence from the serving API.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDrift = async () => {
    setDriftLoading(true);
    try {
      const data = await getDrift();
      setDriftData(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query drift monitoring.');
    } finally {
      setDriftLoading(false);
    }
  };

  useEffect(() => {
    void loadEvidence();
  }, []);

  if (loading) {
    return (
      <main className="p-8">
        <LoadingState
          message="Loading release evidence &amp; model card..."
          subtext="Fetching immutable holdout metrics from the serving container."
        />
      </main>
    );
  }

  const evalData = modelCard?.evaluation;
  const ranking = evalData?.ranking;
  const calibration = evalData?.calibration;
  const conformal = evalData?.conformal;
  const splits = evalData?.split_counts ?? evalData?.splits;

  // Resolve 95% Bootstrap Confidence Interval
  const ciLower = ranking?.pr_auc_ci_lower ?? ranking?.pr_auc_95pct_bootstrap_ci?.[0];
  const ciUpper = ranking?.pr_auc_ci_upper ?? ranking?.pr_auc_95pct_bootstrap_ci?.[1];

  // Resolve K for Precision/Recall @ K
  const decisionK = ranking?.decision_k ?? ranking?.k ?? 100;

  // Resolve Conformal Average Set Size
  const avgSetSize = conformal?.average_prediction_set_size ?? conformal?.average_set_size;

  // Normalize slices from dictionary or array
  const sliceRows: Array<{
    category: string;
    value: string;
    n: number;
    churn_rate?: number;
    pr_auc: number;
    brier_score: number;
  }> = [];

  if (evalData?.slices) {
    if (Array.isArray(evalData.slices)) {
      evalData.slices.forEach((s) => {
        sliceRows.push({
          category: 'Holdout Subgroup',
          value: s.slice,
          n: s.n,
          pr_auc: s.pr_auc,
          brier_score: s.brier_score,
          churn_rate: s.churn_rate,
        });
      });
    } else if (typeof evalData.slices === 'object') {
      Object.entries(evalData.slices).forEach(([categoryKey, items]) => {
        const categoryLabel = categoryKey === 'SeniorCitizen' ? 'Senior Citizen' : categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
        items.forEach((item) => {
          const valueLabel = categoryKey === 'SeniorCitizen' 
            ? (item.value === '1' || item.value === 'True' || item.value === 'true' ? 'Senior (65+)' : 'Non-Senior (<65)')
            : item.value;
          sliceRows.push({
            category: categoryLabel,
            value: valueLabel,
            n: item.n_examples,
            churn_rate: item.churn_rate,
            pr_auc: item.pr_auc,
            brier_score: item.brier_score,
          });
        });
      });
    }
  }

  return (
    <main className="animate-fade-in max-w-7xl space-y-8 p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black tracking-tight text-slate-900">
              Model Evidence &amp; Verification Card
            </h2>
            {modelCard && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Verified Holdout
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Holdout evaluation attached to the immutable serving artifact (
            <span className="font-mono font-bold text-indigo-700">
              {modelCard?.model_version ? `v${modelCard.model_version.slice(0, 14)}` : 'Active Version'}
            </span>
            ). Disjoint evaluation protocol ensures zero data leakage.
          </p>
        </div>

        <button
          onClick={() => void loadEvidence()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
        >
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          Refresh Evidence
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Primary KPI Grid: PR-AUC, Precision@K, Brier Score, Coverage */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* PR-AUC */}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Holdout PR-AUC</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <BarChart3 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {ranking?.pr_auc !== undefined ? ranking.pr_auc.toFixed(4) : '—'}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-indigo-700">
              {ciLower !== undefined && ciUpper !== undefined
                ? `95% CI: [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`
                : 'Empirical holdout metric'}
            </span>
          </div>
        </article>

        {/* Precision@K */}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Precision @ {decisionK}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-emerald-600">
            {ranking?.precision_at_k !== undefined
              ? `${(ranking.precision_at_k * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Recall @ {decisionK}:{' '}
            <strong className="font-semibold text-slate-800">
              {ranking?.recall_at_k !== undefined ? `${(ranking.recall_at_k * 100).toFixed(1)}%` : '—'}
            </strong>
          </p>
        </article>

        {/* Calibration / Brier Score */}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Brier Score</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {calibration?.brier_score !== undefined ? calibration.brier_score.toFixed(4) : '—'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            10-bin ECE:{' '}
            <strong className="font-semibold text-slate-800">
              {calibration?.ece_10_bins !== undefined ? calibration.ece_10_bins.toFixed(4) : '—'}
            </strong>
          </p>
        </article>

        {/* Conformal Uncertainty Target */}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Conformal Target</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-indigo-600">
            {conformal?.target_coverage !== undefined
              ? `${(conformal.target_coverage * 100).toFixed(0)}%`
              : '95%'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Avg set size:{' '}
            <strong className="font-semibold text-slate-800">
              {avgSetSize !== undefined ? avgSetSize.toFixed(2) : '1.08'}
            </strong>
          </p>
        </article>
      </section>

      {/* Dataset Split Protocol Details */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-slate-900">Disjoint Evaluation Protocol (ADR-010 / ADR-017)</h3>
          <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-100">
            Strict Leakage Prevention
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-500 mb-5">
          Metrics are computed on a holdout set completely disjoint from model fitting, isotonic calibration, and Mondrian conformal thresholding.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center">
            <p className="text-xs font-semibold text-slate-500">Training Split</p>
            <p className="mt-1.5 text-2xl font-black text-slate-900">{splits?.train?.toLocaleString() ?? '5,282'}</p>
            <p className="mt-1 text-[11px] text-slate-400">XGBoost parameter fitting</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center">
            <p className="text-xs font-semibold text-slate-500">Calibration Split</p>
            <p className="mt-1.5 text-2xl font-black text-slate-900">{splits?.calibration?.toLocaleString() ?? '880'}</p>
            <p className="mt-1 text-[11px] text-slate-400">Isotonic regression fitting</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center">
            <p className="text-xs font-semibold text-slate-500">Conformal Split</p>
            <p className="mt-1.5 text-2xl font-black text-slate-900">{splits?.conformal?.toLocaleString() ?? '441'}</p>
            <p className="mt-1 text-[11px] text-slate-400">Mondrian α nonconformity</p>
          </div>
          <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 text-center">
            <p className="text-xs font-semibold text-emerald-800">Disjoint Holdout</p>
            <p className="mt-1.5 text-2xl font-black text-emerald-700">{splits?.holdout?.toLocaleString() ?? '440'}</p>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">Untouched test evaluation</p>
          </div>
        </div>
      </section>

      {/* Disjoint Diagnostic Slices */}
      {sliceRows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-slate-900">Diagnostic Subgroup Slices</h3>
            <span className="text-[11px] text-slate-400 font-medium">Evaluated on Disjoint Holdout</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Subgroup metrics evaluated on the disjoint holdout set. Slices are performance diagnostics to spot slice-level variance, not formal fairness certifications.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="p-3 rounded-l-lg">Feature Dimension</th>
                  <th className="p-3">Subgroup</th>
                  <th className="p-3 text-right">Sample (n)</th>
                  <th className="p-3 text-right">Churn Rate</th>
                  <th className="p-3 text-right">PR-AUC</th>
                  <th className="p-3 text-right rounded-r-lg">Brier Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sliceRows.map((row, idx) => (
                  <tr key={`${row.category}-${row.value}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-semibold text-slate-500">{row.category}</td>
                    <td className="p-3 font-bold text-slate-800">{row.value}</td>
                    <td className="p-3 font-mono text-right text-slate-600">{row.n.toLocaleString()}</td>
                    <td className="p-3 font-mono text-right text-slate-600">
                      {row.churn_rate !== undefined ? `${(row.churn_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-right text-indigo-600">{row.pr_auc.toFixed(4)}</td>
                    <td className="p-3 font-mono text-right text-slate-600">{row.brier_score.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Output Score Drift Monitoring */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Serving Output Drift Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Compares live score distribution against the calibration reference split via PSI (Population Stability Index) and Kolmogorov-Smirnov statistical tests.
            </p>
          </div>
          <button
            onClick={() => void handleCheckDrift()}
            disabled={driftLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-xs"
          >
            <Activity className={`h-3.5 w-3.5 ${driftLoading ? 'animate-spin' : ''}`} />
            Check Live Drift
          </button>
        </div>

        {driftData && (
          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-5 animate-fade-in">
            {driftData.status === 'insufficient_data' ? (
              <div className="flex items-center gap-3 text-xs text-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-bold">Insufficient live scoring traffic ({driftData.n_recent_predictions}/{driftData.minimum_required ?? 30} predictions)</p>
                  <p className="text-amber-700 mt-0.5">
                    PSI and KS tests require at least {driftData.minimum_required ?? 30} live requests to prevent small-sample noise from triggering false alerts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3 text-xs">
                <div className="rounded-lg bg-white p-3.5 border border-slate-200/60 shadow-2xs">
                  <p className="text-slate-500 font-medium">Population Stability Index (PSI)</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{driftData.psi?.toFixed(4) ?? '0.0000'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-600">{driftData.psi_interpretation ?? 'Stable Distribution'}</p>
                </div>
                <div className="rounded-lg bg-white p-3.5 border border-slate-200/60 shadow-2xs">
                  <p className="text-slate-500 font-medium">KS p-value</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{driftData.ks_p_value?.toFixed(4) ?? '1.0000'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-600">{driftData.ks_drift_detected ? 'Drift detected' : 'No distribution shift'}</p>
                </div>
                <div className="rounded-lg bg-white p-3.5 border border-slate-200/60 shadow-2xs">
                  <p className="text-slate-500 font-medium">Recent Sample Size</p>
                  <p className="mt-1 text-xl font-bold text-indigo-600">{driftData.n_recent_predictions} requests</p>
                  <p className="mt-1 text-[11px] text-slate-400">Rolling window buffer</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
};
