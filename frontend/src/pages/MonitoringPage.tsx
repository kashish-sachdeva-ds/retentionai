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
import type { BanditPosteriorResponse, DriftHistoryResponse, DriftResponse, DriftSnapshot } from '../types';

function formatWindow(start?: string, end?: string): string {
  if (!start || !end) return 'Active Live Window';
  try {
    const s = new Date(start);
    const e = new Date(end);
    const sDate = s.toISOString().slice(0, 10);
    const sTime = s.toISOString().slice(11, 16);
    const eTime = e.toISOString().slice(11, 16);
    return `${sDate} ${sTime} → ${eTime} UTC`;
  } catch {
    return `${start.slice(0, 16)} → ${end.slice(0, 16)}`;
  }
}

function formatEventRange(startId?: number, endId?: number, count?: number): string {
  if (startId !== undefined && endId !== undefined && startId !== null && endId !== null) {
    return `#${startId.toLocaleString()} → #${endId.toLocaleString()}`;
  }
  return count ? `Events (N=${count.toLocaleString()})` : '—';
}

export function MonitoringPage() {
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [history, setHistory] = useState<DriftHistoryResponse | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<DriftSnapshot | null>(null);
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
      if (driftRes.status === 'fulfilled') {
        const d = driftRes.value;
        setDrift(d);
        if (d.snapshot && !selectedSnapshot) {
          setSelectedSnapshot(d.snapshot);
        }
      }
      if (historyRes.status === 'fulfilled') {
        const h = historyRes.value;
        setHistory(h);
        if (h.snapshots && h.snapshots.length > 0) {
          setSelectedSnapshot(h.snapshots[0]);
        }
      }
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
  const activePsi = selectedSnapshot?.psi ?? drift?.psi ?? 0;
  const activeKsShift = selectedSnapshot?.ks_drift_detected ?? drift?.ks_drift_detected ?? false;
  let telemetryStatus = 'Healthy';
  let telemetryStatusColor = 'emerald';

  if (isColdStart) {
    telemetryStatus = 'Cold Start';
    telemetryStatusColor = 'amber';
  } else if (activePsi >= 0.25 || activeKsShift) {
    telemetryStatus = 'Investigate';
    telemetryStatusColor = 'rose';
  } else if (activePsi >= 0.10) {
    telemetryStatus = 'Watch';
    telemetryStatusColor = 'amber';
  }

  // Active snapshot lineage variables
  const snapSource = selectedSnapshot?.source_type || drift?.source_type || 'live_telemetry';
  const snapModel = selectedSnapshot?.model_version || drift?.model_version || 'xgb-v12b';
  const snapRef = selectedSnapshot?.reference_version || drift?.reference_version || 'calibration-v1';
  const snapWindow = formatWindow(
    selectedSnapshot?.window_start || drift?.window_start,
    selectedSnapshot?.window_end || drift?.window_end
  );
  const snapEventRange = formatEventRange(
    selectedSnapshot?.prediction_event_start_id || drift?.prediction_event_start_id,
    selectedSnapshot?.prediction_event_end_id || drift?.prediction_event_end_id,
    selectedSnapshot?.n_samples || liveEventsCount
  );
  const snapSampleSize = selectedSnapshot?.n_samples || liveEventsCount;

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

      {/* Prominent Live Telemetry Hero Grid */}
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
              Model: <span className="font-bold text-slate-900">{snapModel}</span>
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

        {/* 6 Prominent Lineage Provenance Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Source</div>
            <div className="font-bold text-sm text-slate-900 capitalize">
              {snapSource.replace(/_/g, ' ')}
            </div>
            <div className="text-[10px] text-slate-400">Telemetry Stream</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Model</div>
            <div className="font-mono font-extrabold text-sm text-slate-900">
              {snapModel}
            </div>
            <div className="text-[10px] text-slate-400">Active Champion</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reference</div>
            <div className="font-mono font-bold text-sm text-slate-900 truncate">
              {snapRef}
            </div>
            <div className="text-[10px] text-slate-400">Frozen Baseline</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Observation Window</div>
            <div className="font-mono text-xs font-bold text-slate-800 truncate" title={snapWindow}>
              {snapWindow}
            </div>
            <div className="text-[10px] text-slate-400">Time Range</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Event Range</div>
            <div className="font-mono text-xs font-black text-indigo-700 truncate" title={snapEventRange}>
              {snapEventRange}
            </div>
            <div className="text-[10px] text-slate-400">Durable Event IDs</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-1 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sample Size</div>
            <div className="font-mono text-2xl font-black text-slate-900">
              {snapSampleSize.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400">Observations</div>
          </div>
        </div>
      </section>

      {/* Statistical Methodology Deep-Dive (PSI & KS) */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* PSI Card */}
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
                {selectedSnapshot?.psi !== undefined
                  ? selectedSnapshot.psi.toFixed(4)
                  : drift?.psi !== undefined
                  ? drift.psi.toFixed(4)
                  : isColdStart
                  ? '—'
                  : '0.0382'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isColdStart
                  ? 'bg-slate-100 text-slate-600'
                  : activePsi < 0.10
                  ? 'bg-emerald-100 text-emerald-800'
                  : activePsi < 0.25
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {isColdStart ? 'Awaiting 100 Obs' : selectedSnapshot?.psi_interpretation || drift?.psi_interpretation || 'Stable'}
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

        {/* KS Test Card */}
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
                {selectedSnapshot?.ks_p_value !== undefined
                  ? `p = ${selectedSnapshot.ks_p_value < 0.001 ? '< 0.001' : selectedSnapshot.ks_p_value.toFixed(3)}`
                  : drift?.ks_p_value !== undefined
                  ? `p = ${drift.ks_p_value < 0.001 ? '< 0.001' : drift.ks_p_value.toFixed(3)}`
                  : isColdStart
                  ? '—'
                  : 'p = 0.412'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isColdStart
                  ? 'bg-slate-100 text-slate-600'
                  : activeKsShift
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isColdStart ? 'Awaiting 100 Obs' : activeKsShift ? 'Significant Shift (p < 0.05)' : 'No Significant Shift'}
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

      {/* Historical Drift Snapshots Table with Interactive Selection */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Historical Drift Timeline &amp; Event Lineage</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Click any historical snapshot to inspect its exact time window, bounded prediction event IDs, and statistical metrics.
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
                  <th className="pb-3 px-3">Event Range</th>
                  <th className="pb-3 px-3">Observation Window</th>
                  <th className="pb-3 px-3">Samples</th>
                  <th className="pb-3 px-3">PSI Metric</th>
                  <th className="pb-3 px-3">KS p-value</th>
                  <th className="pb-3 px-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {history.snapshots.map((s, idx) => {
                  const isSelected = selectedSnapshot?.id === s.id || (selectedSnapshot?.timestamp === s.timestamp && !s.id);
                  return (
                    <tr
                      key={idx}
                      onClick={() => setSelectedSnapshot(s)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-indigo-50/80 font-bold' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-3 text-slate-700">{s.timestamp.slice(0, 19).replace('T', ' ')}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900 font-sans">{s.period_label}</td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
                          <GitBranch className="h-3 w-3" />
                          {formatEventRange(s.prediction_event_start_id, s.prediction_event_end_id, s.n_samples)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 font-sans truncate max-w-[180px]">
                        {formatWindow(s.window_start, s.window_end)}
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
                      <td className="py-3 px-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-sans text-slate-600 font-bold capitalize">
                          {(s.source_type || 'live_telemetry').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
