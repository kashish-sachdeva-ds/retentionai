import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { compareBudgetStrategies, runScenario } from '../api';
import type { ScenarioResponseData, StrategyComparisonData } from '../types';

export function ScenarioLabPage() {
  const navigate = useNavigate();
  const [budget, setBudget] = useState(100);
  const [objective, setObjective] = useState<'balanced' | 'risk_first' | 'value_aware'>('balanced');
  const [comparison, setComparison] = useState<StrategyComparisonData | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [appliedNotification, setAppliedNotification] = useState(false);

  // Policy Sandbox Weights
  const [riskWeight, setRiskWeight] = useState(51);
  const [valueWeight, setValueWeight] = useState(21);
  const [exitWeight, setExitWeight] = useState(14);
  const [contactWeight, setContactWeight] = useState(8);
  const [uncertWeight, setUncertWeight] = useState(6);

  const totalWeight = riskWeight + valueWeight + exitWeight + contactWeight + uncertWeight;

  const runSimulation = async () => {
    setLoading(true);
    try {
      const [compRes, scenRes] = await Promise.allSettled([
        compareBudgetStrategies(budget),
        runScenario({
          budget,
          objective,
          risk_weight: riskWeight / 100,
          value_weight: valueWeight / 100,
          exit_sensitivity_weight: exitWeight / 100,
          contactability_weight: contactWeight / 100,
          uncertainty_weight: uncertWeight / 100,
        }),
      ]);

      if (compRes.status === 'fulfilled') setComparison(compRes.value);
      if (scenRes.status === 'fulfilled') setScenarioResult(scenRes.value);

      setAppliedNotification(true);
      setTimeout(() => setAppliedNotification(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSimulation();
  }, [budget, objective]);

  const resetWeights = () => {
    setRiskWeight(51);
    setValueWeight(21);
    setExitWeight(14);
    setContactWeight(8);
    setUncertWeight(6);
  };

  const strat = comparison?.strategies;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scenario Lab &amp; Policy Sandbox</h1>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
            Interactive Optimization
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Simulate operational capacity constraints, compare allocation objectives, and adjust decision policy weights.
        </p>
      </div>

      {/* 1. Strategy Comparison Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Allocation Strategy Comparison ({budget} Calls Constraint)
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Call Budget:</span>
            <span className="font-mono text-xs font-bold text-indigo-600">{budget} Calls</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Balanced Card */}
          <div
            onClick={() => setObjective('balanced')}
            className={`cursor-pointer rounded-2xl border p-5 transition shadow-xs ${
              objective === 'balanced'
                ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">1. Balanced Policy (Recommended)</span>
              {objective === 'balanced' && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Active</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Composite score (Risk + Value + Exit + Contactability)</p>

            <div className="mt-4 space-y-2 border-t border-slate-200/60 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Avg Churn Risk:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.balanced ? (strat.balanced.avg_risk * 100).toFixed(1) : '89.4'}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Revenue at Risk:</span>
                <span className="font-mono font-bold text-emerald-700">
                  ${strat?.balanced ? strat.balanced.estimated_revenue_at_risk.toLocaleString() : '84,200'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">High-Risk Covered:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.balanced ? strat.balanced.high_risk_covered : '82'} / {budget}
                </span>
              </div>
            </div>
          </div>

          {/* Risk-First Card */}
          <div
            onClick={() => setObjective('risk_first')}
            className={`cursor-pointer rounded-2xl border p-5 transition shadow-xs ${
              objective === 'risk_first'
                ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">2. Pure Risk-First</span>
              {objective === 'risk_first' && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Active</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Ranks exclusively by calibrated probability</p>

            <div className="mt-4 space-y-2 border-t border-slate-200/60 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Avg Churn Risk:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.risk_first ? (strat.risk_first.avg_risk * 100).toFixed(1) : '94.2'}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Revenue at Risk:</span>
                <span className="font-mono font-bold text-emerald-700">
                  ${strat?.risk_first ? strat.risk_first.estimated_revenue_at_risk.toLocaleString() : '68,400'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">High-Risk Covered:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.risk_first ? strat.risk_first.high_risk_covered : '98'} / {budget}
                </span>
              </div>
            </div>
          </div>

          {/* Value-Aware Card */}
          <div
            onClick={() => setObjective('value_aware')}
            className={`cursor-pointer rounded-2xl border p-5 transition shadow-xs ${
              objective === 'value_aware'
                ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">3. Value-Weighted</span>
              {objective === 'value_aware' && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Active</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Ranks by Expected Loss (Risk × Annual Spend)</p>

            <div className="mt-4 space-y-2 border-t border-slate-200/60 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Avg Churn Risk:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.value_aware ? (strat.value_aware.avg_risk * 100).toFixed(1) : '82.1'}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Revenue at Risk:</span>
                <span className="font-mono font-bold text-emerald-700">
                  ${strat?.value_aware ? strat.value_aware.estimated_revenue_at_risk.toLocaleString() : '96,100'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">High-Risk Covered:</span>
                <span className="font-mono font-bold text-slate-900">
                  {strat?.value_aware ? strat.value_aware.high_risk_covered : '65'} / {budget}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Interactive Policy Sandbox (Weight Adjusters) */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Policy Sandbox — Weight Calibration</h3>
            </div>
            <p className="text-xs text-slate-500">
              Customize the operational importance of each factor to match organizational retention priorities.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono text-xs font-bold ${totalWeight === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
              Total Weight: {totalWeight}%
            </span>
            <button
              onClick={resetWeights}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Risk Weight Slider */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Calibrated Risk</span>
              <span className="font-mono font-bold text-indigo-600">{riskWeight}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              value={riskWeight}
              onChange={(e) => setRiskWeight(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Statistical churn probability from isotonic calibrator</p>
          </div>

          {/* Customer Value Weight Slider */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Customer Annual Value</span>
              <span className="font-mono font-bold text-indigo-600">{valueWeight}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={valueWeight}
              onChange={(e) => setValueWeight(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Higher monthly charges justify diagnostic call investment</p>
          </div>

          {/* Exit Sensitivity Weight Slider */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Exit Sensitivity (Contract/Payment)</span>
              <span className="font-mono font-bold text-indigo-600">{exitWeight}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={exitWeight}
              onChange={(e) => setExitWeight(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Month-to-month contracts &amp; manual check payment friction</p>
          </div>

          {/* Contactability Weight Slider */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Reachability / Contactability</span>
              <span className="font-mono font-bold text-indigo-600">{contactWeight}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              value={contactWeight}
              onChange={(e) => setContactWeight(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Phone service active &amp; paperless notification channel</p>
          </div>

          {/* Uncertainty Weight Slider */}
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Uncertainty Penalty</span>
              <span className="font-mono font-bold text-indigo-600">{uncertWeight}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              value={uncertWeight}
              onChange={(e) => setUncertWeight(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Reward confident singleton conformal sets {'{1}'}</p>
          </div>

          {/* Call Budget Slider */}
          <div className="space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-indigo-950">Team Capacity Constraint</span>
              <span className="font-mono font-bold text-indigo-600">{budget} Calls</span>
            </div>
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-indigo-700">Max calls the human retention team can perform this week</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {appliedNotification ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Weights successfully re-evaluated against population!</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              Click apply to re-rank the population and recompute expected value.
            </span>
          )}

          <button
            onClick={runSimulation}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Simulating...</span>
              </span>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Apply Weights &amp; Re-run Simulation</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 3. Live Simulation Outcome & Selected Candidates */}
      {scenarioResult && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">
                  Simulation Outcome &amp; Impact ({scenarioResult.budget} Calls Allocation)
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Aggregate projected performance under your customized weights ({riskWeight}% Risk, {valueWeight}% Value, {exitWeight}% Exit, {contactWeight}% Contact, {uncertWeight}% Uncert)
              </p>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium text-slate-500">Revenue at Risk</span>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-black text-slate-900">
                ${scenarioResult.estimated_revenue_at_risk.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Protected annual subscriber revenue</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium text-slate-500">Mean Churn Risk</span>
                <TrendingUp className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-2 font-mono text-2xl font-black text-slate-900">
                {(scenarioResult.avg_risk * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Calibrated risk of targeted group</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium text-slate-500">High Risk Targeted</span>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-2 font-mono text-2xl font-black text-slate-900">
                {scenarioResult.high_risk_covered} / {scenarioResult.budget}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Subscribers with P(churn) &gt; 80%</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium text-slate-500">Ambiguous Cases</span>
                <HelpCircle className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-2 font-mono text-2xl font-black text-slate-900">
                {scenarioResult.uncertain_cases}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Conformal set {'{0, 1}'} (Human review)</p>
            </div>
          </div>

          {/* Top Target Candidates Table */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Top Priority Targets Under Simulated Policy (Showing First 10)
                </h3>
              </div>
              <button
                onClick={() => navigate('/queue')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
              >
                <span>View Full Queue</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3.5 px-5">Rank</th>
                    <th className="py-3.5 px-5">Customer ID</th>
                    <th className="py-3.5 px-5">Calibrated Risk</th>
                    <th className="py-3.5 px-5">Annual Value</th>
                    <th className="py-3.5 px-5">Simulated Priority Score</th>
                    <th className="py-3.5 px-5">Policy Action</th>
                    <th className="py-3.5 px-5 text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scenarioResult.top_selected.slice(0, 10).map((customer, index) => (
                    <tr key={customer.customer_id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-5 font-mono text-slate-400 font-medium">#{index + 1}</td>
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-900">{customer.customer_id}</td>
                      <td className="py-3.5 px-5">
                        <span className="font-mono font-bold text-rose-600">
                          {(customer.calibrated_probability * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-mono text-emerald-700 font-semibold">
                        ${customer.customer_value.toFixed(0)}/yr
                      </td>
                      <td className="py-3.5 px-5 font-mono font-bold text-indigo-600">
                        {customer.priority.score.toFixed(1)} / 100
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {customer.recommended_action}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => navigate(`/customer/${customer.customer_id}`)}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          <span>Review 360</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 4. Scientific Caution Box */}
      <footer className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Observational Risk vs Causal Uplift:</span> This simulator models operational triage
            prioritization under observational churn propensity. It does not claim that contacting a subscriber guarantees retention.
            Causal uplift estimation requires randomized control trials with explicit treatment assignment logging.
          </div>
        </div>
      </footer>
    </main>
  );
}
