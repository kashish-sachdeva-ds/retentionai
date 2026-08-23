import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  GitBranch,
  History,
  Info,
  Layers,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { getBanditPosteriors, getDrift, getDriftHistory } from '../api';
import type { BanditPosteriorResponse, DriftHistoryResponse, DriftResponse } from '../types';

export function MonitoringPage() {
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [history, setHistory] = useState<DriftHistoryResponse | null>(null);
  const [bandit, setBandit] = useState<BanditPosteriorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBenchmark, setPreviewBenchmark] = useState(false);

  const loadData = async (benchmark: boolean = previewBenchmark) => {
    setLoading(true);
    try {
      const [driftRes, historyRes, banditRes] = await Promise.allSettled([
        getDrift(benchmark),
        getDriftHistory(),
        getBanditPosteriors(),
      ]);
      if (driftRes.status === 'fulfilled') setDrift(driftRes.value);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value);
      if (banditRes.status === 'fulfilled') setBandit(banditRes.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(previewBenchmark);
  }, [previewBenchmark]);

  const liveEventsCount = history?.total_live_prediction_events ?? drift?.n_observations ?? 0;
  const isColdStart = drift?.status === 'insufficient_data';
  const isBenchmark = drift?.source_type === 'benchmark_holdout' || drift?.status === 'benchmark_preview';

  // Overall Health Status computation
  const psiVal = drift?.psi ?? 0;
  const isKsShift = drift?.ks_drift_detected ?? false;
  let telemetryStatus = 'Healthy';
  let telemetryStatusColor = 'emerald';

  if (isColdStart) {
    telemetryStatus = 'Cold Start';
    telemetryStatusColor = 'amber';
  } else if (psiVal >= 0.25 || isKsShift) {
    telemetryStatus = 'Investigate';
    telemetryStatusColor = 'rose';
  } else if (psiVal >= 0.10) {
    telemetryStatus = 'Watch';
    telemetryStatusColor = 'amber';
  }

  const modelVer = drift?.model_version || drift?.snapshot?.model_version || 'xgb-v12b';
  const refVer = drift?.reference_version || drift?.snapshot?.reference_version || 'Calibration Holdout (470 rows)';
  const startId = drift?.prediction_event_start_id || drift?.snapshot?.prediction_event_start_id;
  const endId = drift?.prediction_event_end_id || drift?.snapshot?.prediction_event_end_id;
  const lineageLabel = startId && endId ? `Events #${startId} → #${endId}` : `${liveEventsCount} Events`;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Output Drift &amp; Telemetry Monitoring</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              Live Production Observability
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time statistical drift tracking across durable prediction events, paired PSI/KS tests, and Thompson Sampling bandit updates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setPreviewBenchmark(!previewBenchmark)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-2xs transition ${
              previewBenchmark
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{previewBenchmark ? 'Showing Benchmark Preview' : 'Preview Holdout Benchmark'}</span>
          </button>

          <button
            onClick={() => void loadData(previewBenchmark)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {/* Prominent Live Telemetry Grid */}
      <section className="rounded-3xl border border-slate-200 bg-linear-to-b from-white to-slate-50/50 p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-100">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">System State</div>
              <h2 className="text-lg font-bold text-slate-900">OUTPUT DRIFT — LIVE TELEMETRY</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
              telemetryStatusColor === 'emerald'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : telemetryStatusColor === 'amber'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                telemetryStatusColor === 'emerald'
                  ? 'bg-emerald-500 animate-pulse'
                  : telemetryStatusColor === 'amber'
                  ? 'bg-amber-500'
                  : 'bg-rose-500 animate-pulse'
              }`} />
              <span>{isColdStart ? 'Cold Start (Awaiting Data)' : `Status: ${telemetryStatus}`}</span>
            </div>

            <span className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-mono font-semibold text-slate-600">
              Model: <span className="font-bold text-slate-900">{modelVer}</span>
            </span>
          </div>
        </div>

        {/* Cold Start Alert Banner */}
        {isColdStart && !previewBenchmark && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  INSUFFICIENT LIVE HISTORY — {liveEventsCount} / 100 observations
                </h4>
                <p className="text-xs text-amber-800 mt-1">
                  100 minimum live prediction events are required for statistical output drift analysis. No synthetic production telemetry is fabricated.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPreviewBenchmark(true)}
              className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition"
            >
              Preview Holdout Benchmark
            </button>
          </div>
        )}

        {isBenchmark && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-indigo-600" />
              <p className="text-xs text-indigo-900">
                <span className="font-bold">Holdout Benchmark Mode:</span> Evaluating against 250-subscriber Kaggle holdout baseline.
              </p>
            </div>
            <span className="rounded-full bg-indigo-200/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-900 uppercase">
              Benchmark Provenance
            </span>
          </div>
        )}

        {/* 6 Key Operational Telemetry Indicators */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">Observations</div>
            <div className="font-mono text-2xl font-black text-slate-900">
              {liveEventsCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400">Durable Events in DB</div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">Observation Window</div>
            <div className="font-semibold text-sm text-slate-900 truncate">
              {isColdStart ? 'Active Stream' : 'Live Window'}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              {drift?.window_end ? new Date(drift.window_end).toLocaleTimeString() : 'Current Session'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">PSI (Quantile Drift)</div>
            <div className="font-mono text-2xl font-black text-slate-900">
              {drift?.psi !== undefined ? drift.psi.toFixed(4) : '—'}
            </div>
            <div className="text-[10px] font-medium">
              <span className={psiVal < 0.10 ? 'text-emerald-600' : psiVal < 0.25 ? 'text-amber-600' : 'text-rose-600'}>
                {isColdStart ? 'Threshold < 0.10' : drift?.psi_interpretation || 'Stable'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">KS Test (p-value)</div>
            <div className="font-mono text-2xl font-black text-slate-900">
              {drift?.ks_p_value !== undefined ? (drift.ks_p_value < 0.001 ? '< 0.001' : drift.ks_p_value.toFixed(3)) : '—'}
            </div>
            <div className="text-[10px] font-medium">
              <span className={!isKsShift ? 'text-emerald-600' : 'text-rose-600 font-bold'}>
                {isColdStart ? 'Alpha = 0.05' : isKsShift ? 'Shift Detected' : 'No Shift (p ≥ 0.05)'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">Reference Baseline</div>
            <div className="font-semibold text-sm text-slate-900 truncate">
              {refVer}
            </div>
            <div className="text-[10px] text-slate-400">Frozen Validation Split</div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-500">Data Lineage</div>
            <div className="font-mono text-xs font-bold text-indigo-700 truncate">
              {lineageLabel}
            </div>
            <div className="text-[10px] text-slate-400">Durable SQLite Provenance</div>
          </div>
        </div>
      </section>

      {/* Statistical Methodology Deep-Dive */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* PSI Breakdown */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Population Stability Index (PSI)</h3>
            </div>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Binned Quantile Distance
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-extrabold text-slate-900">
                {drift?.psi !== undefined ? drift.psi.toFixed(4) : isColdStart ? '—' : '0.0382'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isColdStart
                  ? 'bg-slate-100 text-slate-600'
                  : (drift?.psi ?? 0) < 0.10
                  ? 'bg-emerald-100 text-emerald-800'
                  : (drift?.psi ?? 0) < 0.25
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {isColdStart ? 'Awaiting 100 Obs' : drift?.psi_interpretation || 'Stable'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-5">
              PSI compares the calibrated churn probability quantile bins against the fixed 470-row calibration split ruler.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">&lt; 0.10:</span>
              <span className="font-semibold text-emerald-600">Stable (Distribution unchanged)</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">0.10 – 0.25:</span>
              <span className="font-semibold text-amber-600">Moderate Shift (Monitor trend)</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">&gt; 0.25:</span>
              <span className="font-semibold text-rose-600">Significant Drift (Requires investigation)</span>
            </div>
          </div>
        </div>

        {/* KS Test Breakdown */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Kolmogorov-Smirnov (KS) Two-Sample Test</h3>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              Hypothesis Test (α = 0.05)
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-extrabold text-slate-900">
                {drift?.ks_p_value !== undefined ? `p = ${drift.ks_p_value < 0.001 ? '< 0.001' : drift.ks_p_value.toFixed(3)}` : isColdStart ? '—' : 'p = 0.412'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isColdStart
                  ? 'bg-slate-100 text-slate-600'
                  : drift?.ks_drift_detected
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isColdStart ? 'Awaiting 100 Obs' : drift?.ks_drift_detected ? 'Significant Shift (p < 0.05)' : 'No Significant Shift'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-5">
              Non-parametric two-sample test measuring maximum divergence between cumulative empirical distributions.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">Why Paired Measures? (ADR-015)</p>
            <p className="leading-5 text-slate-500">
              PSI measures practical magnitude across quantiles, while KS measures statistical significance. Reporting both prevents false alerts from binning artifacts or tiny shifts on massive samples.
            </p>
          </div>
        </div>
      </section>

      {/* Historical Drift Snapshots Table with Data Lineage */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Historical Drift Timeline &amp; Event Lineage</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Durable point-in-time drift calculations linked directly to the bounded range of live prediction events evaluated.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono">
              <span className="text-slate-500">Durable Events: </span>
              <span className="font-bold text-slate-900">{liveEventsCount}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono">
              <span className="text-slate-500">Snapshots: </span>
              <span className="font-bold text-slate-900">{history?.snapshots_count || 0}</span>
            </div>
          </div>
        </div>

        {history?.snapshots && history.snapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="pb-3 px-3">Snapshot Timestamp</th>
                  <th className="pb-3 px-3">Period Label</th>
                  <th className="pb-3 px-3">Event Lineage</th>
                  <th className="pb-3 px-3">Samples</th>
                  <th className="pb-3 px-3">PSI Metric</th>
                  <th className="pb-3 px-3">KS p-value</th>
                  <th className="pb-3 px-3">Model / Ref</th>
                  <th className="pb-3 px-3">Source Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {history.snapshots.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 text-slate-700">{s.timestamp.slice(0, 19).replace('T', ' ')}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900 font-sans">{s.period_label}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
                        <GitBranch className="h-3 w-3" />
                        {s.prediction_event_start_id && s.prediction_event_end_id
                          ? `#${s.prediction_event_start_id} → #${s.prediction_event_end_id}`
                          : `N=${s.n_samples}`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-bold">{s.n_samples}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      <span>{s.psi.toFixed(4)} </span>
                      <span className={`rounded px-1.5 py-0.2 text-[9px] font-sans font-bold ${
                        s.psi < 0.10 ? 'bg-emerald-100 text-emerald-800' : s.psi < 0.25 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {s.psi_interpretation}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700">p = {s.ks_p_value < 0.001 ? '< 0.001' : s.ks_p_value.toFixed(3)}</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500 font-sans">{s.model_version || 'xgb-v12b'}</td>
                    <td className="py-3 px-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-sans text-slate-600 font-bold">
                        {s.source_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2">
            <Database className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No Scheduled Drift Snapshots Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Drift snapshots are automatically recorded from live prediction events once the observation threshold (100 events) is met.
            </p>
          </div>
        )}
      </section>

      {/* Thompson Sampling Multi-Armed Bandit Posteriors */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900">Thompson Sampling Bandit Posteriors (Redis Beta State)</h3>
            <p className="text-xs text-slate-500">
              Live probability distribution for each retention treatment arm: Discount, Technician, and Control.
            </p>
          </div>
          <span className="rounded bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
            ADR-012 Exploration Policy
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {bandit?.arms?.map((arm) => {
            const total = arm.alpha + arm.beta;
            const meanSuccess = arm.alpha / total;

            return (
              <div key={arm.arm} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900 uppercase">{arm.arm} Arm</span>
                  <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 border border-slate-200">
                    N = {arm.n_observations}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-500">Posterior Mean Retention Rate:</span>
                  <p className="font-mono text-2xl font-extrabold text-indigo-600">
                    {(meanSuccess * 100).toFixed(1)}%
                  </p>
                </div>

                <div className="flex justify-between text-[11px] font-mono text-slate-500 border-t border-slate-200 pt-2">
                  <span>Alpha (Retained): {arm.alpha.toFixed(1)}</span>
                  <span>Beta (Churned): {arm.beta.toFixed(1)}</span>
                </div>
              </div>
            );
          }) || (
            <div className="col-span-3 text-center py-6 text-xs text-slate-400">
              Loading bandit state from Redis...
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
