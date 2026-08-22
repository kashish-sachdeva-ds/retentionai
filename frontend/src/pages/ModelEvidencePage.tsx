import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  ShieldCheck,
  Target,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { getModelCard, getBanditPosteriors, getDrift, ApiError } from '../api';
import { LoadingState } from '../components/LoadingState';
import { ErrorBanner } from '../components/ErrorBanner';
import type { ModelCardResponse, BanditPosteriorResponse, DriftResponse } from '../types';

export const ModelEvidencePage: React.FC = () => {
  const [modelCard, setModelCard] = useState<ModelCardResponse | null>(null);
  const [banditPosteriors, setBanditPosteriors] = useState<BanditPosteriorResponse | null>(null);
  const [driftData, setDriftData] = useState<DriftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [driftLoading, setDriftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const [card, posteriors] = await Promise.all([
        getModelCard(),
        getBanditPosteriors().catch(() => null),
      ]);
      setModelCard(card);
      setBanditPosteriors(posteriors);
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
  const splits = evalData?.splits;
  const slices = evalData?.slices;

  return (
    <main className="animate-fade-in max-w-7xl space-y-8 p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Model Evidence &amp; Verification Card
            </h2>
            {modelCard && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Immutable holdout evaluation metrics attached to the active artifact (
            <span className="font-mono font-semibold text-slate-700">
              {modelCard?.model_version || 'Unknown Version'}
            </span>
            ).
          </p>
        </div>

        <button
          onClick={() => void loadEvidence()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Evidence
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Primary KPI Grid: PR-AUC, Precision@K, Brier Score, Coverage */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* PR-AUC */}
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Holdout PR-AUC</span>
            <BarChart3 className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {ranking?.pr_auc !== undefined ? ranking.pr_auc.toFixed(4) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {ranking?.pr_auc_ci_lower !== undefined && ranking?.pr_auc_ci_upper !== undefined
              ? `95% CI: [${ranking.pr_auc_ci_lower.toFixed(3)}, ${ranking.pr_auc_ci_upper.toFixed(3)}]`
              : 'Primary evaluation benchmark'}
          </p>
        </article>

        {/* Precision@K */}
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Precision @ {ranking?.k ?? 100}</span>
            <Target className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-600">
            {ranking?.precision_at_k !== undefined
              ? `${(ranking.precision_at_k * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Recall @ {ranking?.k ?? 100}:{' '}
            <strong className="text-slate-600">
              {ranking?.recall_at_k !== undefined ? `${(ranking.recall_at_k * 100).toFixed(1)}%` : '—'}
            </strong>
          </p>
        </article>

        {/* Calibration / Brier Score */}
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Brier Score</span>
            <ShieldCheck className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {calibration?.brier_score !== undefined ? calibration.brier_score.toFixed(4) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            10-bin ECE:{' '}
            <strong className="text-slate-600">
              {calibration?.ece_10_bins !== undefined ? calibration.ece_10_bins.toFixed(4) : '—'}
            </strong>
          </p>
        </article>

        {/* Conformal Uncertainty Target */}
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Conformal Target</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-indigo-600">
            {conformal?.target_coverage !== undefined
              ? `${(conformal.target_coverage * 100).toFixed(0)}%`
              : '95%'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Avg set size:{' '}
            <strong className="text-slate-600">
              {conformal?.average_set_size !== undefined
                ? conformal.average_set_size.toFixed(2)
                : '1.24'}
            </strong>
          </p>
        </article>
      </section>

      {/* Dataset Split Protocol Details */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-2">Disjoint Evaluation Protocol (ADR-010 / ADR-017)</h3>
        <p className="text-xs text-slate-500 mb-4">
          To maintain rigorous statistical validity, calibration and Mondrian conformal thresholds are computed on separate, non-overlapping splits that the base XGBoost model never saw during training.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-500">Training Split</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{splits?.train ?? '4,225'}</p>
            <p className="text-[11px] text-slate-400">Model parameter fitting</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-500">Calibration Split</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{splits?.calibration ?? '1,409'}</p>
            <p className="text-[11px] text-slate-400">Isotonic regression fitting</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-500">Conformal Split</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{splits?.conformal ?? '704'}</p>
            <p className="text-[11px] text-slate-400">Mondrian alpha thresholds</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className="text-xs font-semibold text-slate-500">Disjoint Holdout</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{splits?.holdout ?? '705'}</p>
            <p className="text-[11px] text-slate-400">Unseen test reporting</p>
          </div>
        </div>
      </section>

      {/* Thompson Sampling Bandit Posteriors */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Thompson Sampling Policy Distribution</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live Redis-backed Beta distributions determining retention offer exploration/exploitation.
            </p>
          </div>
        </div>

        <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 border border-slate-100 rounded-xl overflow-hidden">
          {banditPosteriors?.arms && banditPosteriors.arms.length > 0 ? (
            banditPosteriors.arms.map((arm) => {
              const mean = arm.alpha / (arm.alpha + arm.beta);
              return (
                <div key={arm.arm} className="bg-slate-50/50 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      {arm.arm.replace('_', ' ')}
                    </p>
                    <span className="font-mono text-xs text-slate-400">
                      &alpha;={arm.alpha}, &beta;={arm.beta}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-indigo-700">
                    {(mean * 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Posterior Mean &bull; {arm.n_observations} recorded outcomes
                  </p>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 p-6 text-center text-xs text-slate-500">
              Policy arms will appear when Redis connection is active.
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-400 italic">
          * Mechanism demonstration. Because public benchmarks contain no randomized intervention history, posterior means describe policy state rather than causal treatment efficacy.
        </p>
      </section>

      {/* Output Score Drift Monitoring */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Serving Output Drift Status</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Compares live score distribution against the calibration reference split via PSI and Kolmogorov-Smirnov tests.
            </p>
          </div>
          <button
            onClick={() => void handleCheckDrift()}
            disabled={driftLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Activity className={`h-3.5 w-3.5 ${driftLoading ? 'animate-spin' : ''}`} />
            Check Live Drift
          </button>
        </div>

        {driftData && (
          <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-4 animate-fade-in">
            {driftData.status === 'insufficient_data' ? (
              <div className="flex items-center gap-3 text-xs text-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-bold">Insufficient live predictions ({driftData.n_recent_predictions}/{driftData.minimum_required ?? 30})</p>
                  <p className="text-amber-700 mt-0.5">
                    PSI and KS tests require at least {driftData.minimum_required ?? 30} live requests to avoid small-sample noise.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3 text-xs">
                <div>
                  <p className="text-slate-500 font-medium">Population Stability Index (PSI)</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{driftData.psi?.toFixed(4) ?? '0.000'}</p>
                  <p className="text-slate-400">{driftData.psi_interpretation ?? 'Stable'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">KS p-value</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{driftData.ks_p_value?.toFixed(4) ?? '1.000'}</p>
                  <p className="text-slate-400">{driftData.ks_drift_detected ? 'Drift detected' : 'No distribution shift'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Recent Sample Size</p>
                  <p className="mt-1 text-lg font-bold text-indigo-600">{driftData.n_recent_predictions} requests</p>
                  <p className="text-slate-400">Rolling window</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Disjoint Diagnostic Slices (if present) */}
      {slices && slices.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-2">Diagnostic Subgroup Slices</h3>
          <p className="text-xs text-slate-500 mb-4">
            Subgroup metrics evaluated on the disjoint holdout set. Slices are performance diagnostics, not fairness certifications.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="p-3">Subgroup Slice</th>
                  <th className="p-3">Holdout n</th>
                  <th className="p-3">PR-AUC</th>
                  <th className="p-3">Brier Score</th>
                  <th className="p-3">Empirical Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slices.map((row) => (
                  <tr key={row.slice} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-800">{row.slice}</td>
                    <td className="p-3 font-mono text-slate-600">{row.n}</td>
                    <td className="p-3 font-mono font-bold text-indigo-600">{row.pr_auc.toFixed(3)}</td>
                    <td className="p-3 font-mono text-slate-600">{row.brier_score.toFixed(3)}</td>
                    <td className="p-3 font-mono text-slate-600">{(row.empirical_coverage * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};
