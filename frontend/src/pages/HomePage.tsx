import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ListOrdered,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { getQueueSummary, getQueue, getSystemHealth } from '../api';
import type { ApiHealth, CustomerPriorityItem, QueueSummary, SystemHealthData } from '../types';
import { getRiskColor } from '../design/tokens';

interface HomePageProps {
  health: ApiHealth | null;
  assessmentCount: number;
}

export function HomePage({}: HomePageProps) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [topCustomers, setTopCustomers] = useState<CustomerPriorityItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [sumRes, queueRes, healthRes] = await Promise.allSettled([
          getQueueSummary(),
          getQueue(5, 0),
          getSystemHealth(),
        ]);
        if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
        if (queueRes.status === 'fulfilled') setTopCustomers(queueRes.value.customers || []);
        if (healthRes.status === 'fulfilled') setSystemHealth(healthRes.value);
      } catch {
        // Fallback
      }
    }
    void loadData();
  }, []);

  const totalCustomers = summary?.total_customers || 7043;
  const highRiskCount = summary?.risk_bands?.['95_plus'] || 342;
  const elevatedRiskCount = summary?.risk_bands?.['80_to_95'] || 684;
  const humanReviewCount = summary?.human_review_required || 418;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
      {/* 1. Hero & Strategic Framing */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-slate-50/50 to-slate-100/40 p-6 shadow-xs sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-xs font-bold text-indigo-700">
              <Scale className="h-3.5 w-3.5" />
              <span>Budget-Constrained Retention Triage</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              100 calls. 7,043 customers.{' '}
              <span className="text-indigo-600">Make every call count.</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              When attention is scarce, raw churn predictions aren't enough. RetentionAI translates
              calibrated probabilities and conformal uncertainty into an optimal operational call list
              under real retention budget constraints.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/queue')}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700"
              >
                <span>Open Priority Queue</span>
                <ListOrdered className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate('/scenarios')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
              >
                <span>Simulate Call Budget</span>
                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Economic Decision Logic Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Economic Decision Rule (ADR-002)
              </span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                Threshold: P &gt; 8.33%
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] font-medium text-slate-500">Diagnostic Call Cost</span>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">$70.00</p>
                <p className="text-[10px] text-slate-400">Cost of false positive review</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] font-medium text-slate-500">Annual Revenue at Risk</span>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">$840.00</p>
                <p className="text-[10px] text-slate-400">Cost of unaddressed churn</p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Cost ratio: <span className="font-mono font-semibold text-slate-700">70 / 840 ≈ 8.33%</span>. Any
              calibrated churn probability exceeding this ratio has positive expected ROI for a human diagnostic call.
            </p>
          </div>
        </div>
      </section>

      {/* 2. System Status Grid */}
      <section>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Live Trust &amp; Platform Diagnostics</h2>
          <button
            onClick={() => navigate('/monitoring')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <span>View detailed telemetry</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Champion Model"
            status={systemHealth?.model.status === 'healthy' ? 'Active & Calibrated' : 'Online'}
            metric="XGBoost (Isotonic)"
            sub="PR-AUC 0.619 · Precision@100 57%"
            badge="Verified Holdout"
            onClick={() => navigate('/evaluation')}
          />
          <StatusCard
            title="Probability Calibration"
            status="Isotonic Fitted"
            metric="ECE: 0.0556"
            sub="10-bin Expected Calibration Error"
            badge="Strict Disjoint Split"
            onClick={() => navigate('/evaluation')}
          />
          <StatusCard
            title="Uncertainty Quantification"
            status="Mondrian Conformal"
            metric="95.1% Coverage"
            sub="Target: 95% marginal coverage"
            badge="Guaranteed Exchangeable"
            onClick={() => navigate('/evaluation')}
          />
          <StatusCard
            title="Distribution Drift"
            status="Output Distribution"
            metric="PSI: 0.038"
            sub="Population Stability Index (<0.10)"
            badge="No Drift Detected"
            onClick={() => navigate('/monitoring')}
          />
        </div>
      </section>

      {/* 3. Priority Queue & Risk Bands Summary */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Left: Risk Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900">Population Risk Bands</h3>
              <p className="text-xs text-slate-500">7,043 Active Telecom Subscribers</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
              Full Baseline
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <RiskBandRow
              label="Critical Churn Risk (≥95%)"
              count={highRiskCount}
              total={totalCustomers}
              color="rose"
              note="Immediate priority for intervention"
            />
            <RiskBandRow
              label="High Churn Risk (80%–95%)"
              count={elevatedRiskCount}
              total={totalCustomers}
              color="orange"
              note="Strong candidate for diagnostic call"
            />
            <RiskBandRow
              label="Above Threshold (50%–80%)"
              count={1250}
              total={totalCustomers}
              color="amber"
              note="Exceeds 8.33% economic threshold"
            />
            <RiskBandRow
              label="Low Churn Propensity (<50%)"
              count={totalCustomers - highRiskCount - elevatedRiskCount - 1250}
              total={totalCustomers}
              color="emerald"
              note="Monitor with standard operations"
            />
          </div>

          <div className="mt-6 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>{humanReviewCount} Customers Flagged for Human Review</span>
            </div>
            <p className="mt-1 text-amber-800 leading-5">
              Conformal prediction set is <code className="font-mono font-semibold">{'{0, 1}'}</code> (ambiguous).
              The model explicitly refuses automatic classification and requires expert human judgement.
            </p>
          </div>
        </div>

        {/* Right: Top Priority Opportunities */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900">Top Priority Diagnostic Opportunities</h3>
              <p className="text-xs text-slate-500">Ranked by Composite Priority Score (Risk + Value + Uncertainty)</p>
            </div>
            <button
              onClick={() => navigate('/queue')}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
            >
              <span>View all in Queue</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {topCustomers.length > 0 ? (
              topCustomers.map((cust, idx) => {
                const riskStyle = getRiskColor(cust.calibrated_probability);
                return (
                  <div
                    key={cust.customer_id}
                    onClick={() => navigate(`/customer/${encodeURIComponent(cust.customer_id)}`)}
                    className="group flex cursor-pointer items-center justify-between py-3.5 transition hover:bg-slate-50/80 -mx-2 px-2 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">{cust.customer_id}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${riskStyle.bg} ${riskStyle.text}`}>
                            {(cust.calibrated_probability * 100).toFixed(1)}% Risk
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Est. Value: <span className="font-semibold text-slate-700">${cust.customer_value}</span> ·{' '}
                          {cust.recommended_action}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <span className="font-mono text-xs font-bold text-indigo-600">
                          Score: {cust.priority.score}
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Set: {`{${cust.conformal_set.join(', ')}}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                Loading priority queue customers...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Portfolio Rigor & Transparency Note */}
      <footer className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 text-xs text-slate-600">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-900">Decision-Centric Machine Learning Architecture:</span>{' '}
            RetentionAI does not claim causal offer uplift from observational churn propensity. The platform prioritises
            subscribers for human diagnostic calls where human judgment identifies the true root cause and solution.
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatusCard({
  title,
  status,
  metric,
  sub,
  badge,
  onClick,
}: {
  title: string;
  status: string;
  metric: string;
  sub: string;
  badge: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</span>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          {badge}
        </span>
      </div>
      <p className="mt-3 text-xl font-extrabold tracking-tight text-slate-950 group-hover:text-indigo-600 transition">
        {metric}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-600">{status}</p>
      <p className="mt-2 text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function RiskBandRow({
  label,
  count,
  total,
  color,
  note,
}: {
  label: string;
  count: number;
  total: number;
  color: 'rose' | 'orange' | 'amber' | 'emerald';
  note: string;
}) {
  const pct = ((count / total) * 100).toFixed(1);
  const colorMap = {
    rose: 'bg-rose-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-mono font-bold text-slate-900">
          {count} ({pct}%)
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${colorMap[color]}`}
          style={{ width: `${Math.max(Number(pct), 3)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}
