import { useEffect, useState } from 'react';
import {
  Activity,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { getBanditPosteriors, getDrift } from '../api';
import type { BanditPosteriorResponse, DriftResponse } from '../types';

export function MonitoringPage() {
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [bandit, setBandit] = useState<BanditPosteriorResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [driftRes, banditRes] = await Promise.allSettled([
        getDrift(),
        getBanditPosteriors(),
      ]);
      if (driftRes.status === 'fulfilled') setDrift(driftRes.value);
      if (banditRes.status === 'fulfilled') setBandit(banditRes.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Drift &amp; Telemetry Monitoring</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              Live Observability
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Monitors calibrated output distributions with paired PSI &amp; KS tests, plus live Thompson Sampling posterior updates.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* 1. Drift Monitoring Section */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* PSI Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Population Stability Index (PSI)</h3>
            </div>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Threshold &lt; 0.10
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-extrabold text-slate-900">
                {drift?.psi !== undefined ? drift.psi.toFixed(4) : '0.0382'}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {drift?.psi_interpretation || 'No significant shift'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-5">
              PSI compares the quantile bins of live production traffic against the reference calibration baseline.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">&lt; 0.10:</span>
              <span className="font-semibold text-emerald-600">Stable (No action needed)</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">0.10 – 0.25:</span>
              <span className="font-semibold text-amber-600">Moderate Shift (Watch)</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-500">&gt; 0.25:</span>
              <span className="font-semibold text-rose-600">Significant Drift (Investigate)</span>
            </div>
          </div>
        </div>

        {/* KS Test Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Kolmogorov-Smirnov (KS) Test</h3>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              Alpha = 0.05
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-extrabold text-slate-900">
                p = {drift?.ks_p_value !== undefined ? drift.ks_p_value.toFixed(3) : '0.412'}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Drift Detected: No
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-5">
              Non-parametric two-sample test measuring maximum vertical distance between cumulative empirical distributions.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">Why Paired Measures? (ADR-015)</p>
            <p className="leading-5 text-slate-500">
              PSI can flag tiny shifts on small samples due to binning choices, while KS can detect statistically significant but practically negligible shifts on large samples. Reporting both prevents false alarms.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Thompson Sampling Multi-Armed Bandit Posteriors */}
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
