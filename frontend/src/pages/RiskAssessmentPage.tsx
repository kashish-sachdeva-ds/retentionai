import React, { useCallback, useState } from 'react';
import {
  ArrowRight,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
  Zap,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, getCounterfactual, predictCustomer } from '../api';
import { CustomerForm, PRESETS } from '../components/CustomerForm';
import { ErrorBanner } from '../components/ErrorBanner';
import { PRESET_PROFILES, type CustomerProfile } from '../components/CustomerSidebar';
import type { CounterfactualResponse, PredictionPayload, PredictionResponse } from '../types';

interface RiskAssessmentPageProps {
  onPrediction: (response: PredictionResponse, payload: PredictionPayload) => void;
}

const ECONOMIC_THRESHOLD = 70 / 840; // ~0.0833 (8.3%)

function uncertaintyCopy(predictionSet: number[]) {
  if (predictionSet.length > 1) {
    return {
      title: 'Ambiguous Uncertainty — Human Judgement Warranted',
      body: 'The 95% Mondrian conformal set includes both outcomes [Stay, Churn]. Use the diagnostic call to investigate root causes before deciding on costly retention concessions.',
      tier: 'uncertain',
    };
  }
  if (predictionSet[0] === 1) {
    return {
      title: 'High Confidence: Churn Risk',
      body: 'The conformal set singleton confirms high probability of churn. Prioritize immediate diagnostic outreach.',
      tier: 'churn',
    };
  }
  return {
    title: 'High Confidence: Stable Retention',
    body: 'The conformal set singleton confirms low churn propensity. No proactive outreach indicated.',
    tier: 'stay',
  };
}

function describeScenario(changes?: Record<string, unknown> | null) {
  if (!changes || Object.keys(changes).length === 0) return null;
  const labels: Record<string, string> = {
    ContractCommitmentMonths: 'migrate to an annual contract commitment',
    OnlineSecurity_Yes: 'attach Online Security protection',
    TechSupport_Yes: 'enroll in dedicated Tech Support',
    InternetService_DSL: 'switch to stable DSL connection',
  };
  const updates = Object.keys(changes).map((key) => labels[key] ?? key);
  return updates.length === 1 ? updates[0] : `${updates.slice(0, -1).join(', ')} and ${updates.at(-1)}`;
}

export const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({ onPrediction }) => {
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'custom'>('benchmarks');
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile>(PRESET_PROFILES[0]);
  const [formData, setFormData] = useState<PredictionPayload>(PRESET_PROFILES[0].data);
  const [isModified, setIsModified] = useState(false);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoringStep, setScoringStep] = useState(0);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioUnavailable, setScenarioUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollScenario = useCallback(async (requestId: string) => {
    setScenarioLoading(true);
    setScenarioUnavailable(false);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      try {
        const response = await getCounterfactual(requestId);
        if (response.status === 'ready') {
          setCounterfactual(response);
          setScenarioLoading(false);
          return;
        }
      } catch {
        setScenarioUnavailable(true);
        break;
      }
    }
    setScenarioUnavailable(true);
    setScenarioLoading(false);
  }, []);

  const assess = useCallback(async (overrideData?: PredictionPayload) => {
    if (loading) return;
    const dataToScore = overrideData ?? formData;
    setLoading(true);
    setError(null);
    setResult(null);
    setCounterfactual(null);
    setScenarioUnavailable(false);
    setScoringStep(1);

    // Multi-step progressive animation
    const stepTimer = window.setTimeout(() => setScoringStep(2), 250);

    try {
      const response = await predictCustomer(dataToScore);
      setScoringStep(3);
      setResult(response);
      onPrediction(response, dataToScore);
      void pollScenario(response.request_id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to assess this profile. The model service may still be spinning up from sleep.'
      );
    } finally {
      window.clearTimeout(stepTimer);
      setLoading(false);
      setScoringStep(0);
    }
  }, [formData, loading, onPrediction, pollScenario]);

  const selectPreset = (profile: CustomerProfile) => {
    setSelectedProfile(profile);
    setFormData(profile.data);
    setIsModified(false);
    setResult(null);
    setCounterfactual(null);
    setScenarioUnavailable(false);
    setError(null);
  };

  const handleFormChange = (newData: PredictionPayload) => {
    setFormData(newData);
    setIsModified(true);
  };

  const resetToPreset = (presetKey: string) => {
    const profile = PRESET_PROFILES.find((p) => p.id === presetKey) || PRESET_PROFILES[0];
    selectPreset(profile);
  };

  const probability = result?.calibrated_churn_probability ?? 0;
  const isPriority = probability > ECONOMIC_THRESHOLD;
  const uncertainty = result ? uncertaintyCopy(result.conformal_prediction_set) : null;
  const scenario = describeScenario(counterfactual?.raw_changes);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      {/* Header */}
      <header className="max-w-3xl">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-700">
            ML Decision Support
          </span>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
            Stage 12b Pipeline
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          Decide Who Needs a Diagnostic Call First
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Prioritize constrained outreach budgets with calibrated churn risk, 95% Mondrian conformal prediction sets, and Thompson Sampling arm assignments.
        </p>
      </header>

      {/* Triage Threshold Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-950">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Economic Triage Boundary:</strong> Accounts with calibrated risk <strong>&gt; {(ECONOMIC_THRESHOLD * 100).toFixed(1)}%</strong> ($70 outreach / $840 lost LTV) enter the diagnostic queue.
          </span>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-indigo-700">ADR-002 Cost Matrix</span>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        {/* LEFT COLUMN: Profile Selection & Configuration */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-2xs">
                1
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">Customer Profile Input</h2>
                <p className="text-xs text-slate-500">Choose a benchmark archetype or simulate custom customer data</p>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('benchmarks')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  activeTab === 'benchmarks'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Archetypes</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('custom')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  activeTab === 'custom'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Custom Simulator</span>
                {isModified && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                )}
              </button>
            </div>
          </div>

          {/* TAB 1: Benchmark Archetypes (1-Click Recruiter Demo) */}
          {activeTab === 'benchmarks' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {Object.entries(PRESETS).map(([key, preset]) => {
                  const profile = PRESET_PROFILES.find((p) => p.id === key) || PRESET_PROFILES[0];
                  const isSelected = selectedProfile.id === key && !isModified;
                  const isSelectedModified = selectedProfile.id === key && isModified;

                  const badgeColorMap = {
                    rose: 'bg-rose-50 text-rose-700 border-rose-200',
                    amber: 'bg-amber-50 text-amber-700 border-amber-200',
                    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  };

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectPreset(profile)}
                      className={`group relative w-full rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-linear-to-br from-indigo-50/90 via-white to-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              badgeColorMap[preset.riskColor]
                            }`}
                          >
                            {preset.riskTag}
                          </span>
                          <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {preset.label}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-xs">
                            ✓
                          </span>
                        )}
                        {isSelectedModified && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Modified
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed text-slate-600">
                        {preset.description}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                        <span>💡 {preset.highlight}</span>
                        <span className="font-semibold text-indigo-600 group-hover:underline">
                          Select &amp; Load →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-600 flex items-center justify-between">
                <span>Want to test custom charges, contract lengths, or add-ons?</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('custom')}
                  className="font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                >
                  Open Custom Simulator <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Custom Customer Simulator */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {/* Custom State Indicator */}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  <span className="font-semibold text-slate-700">
                    {isModified
                      ? `Customized Profile (from ${selectedProfile.name.split('•')[1]?.trim() || 'Preset'})`
                      : `Editing: ${selectedProfile.name.split('•')[1]?.trim() || 'Preset'}`}
                  </span>
                </div>
                {isModified && (
                  <button
                    type="button"
                    onClick={() => resetToPreset(selectedProfile.id)}
                    className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800"
                    title="Reset back to baseline archetype"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>

              {/* Customer Form with Actionable Levers */}
              <CustomerForm
                formData={formData}
                onChange={handleFormChange}
                onSelectPreset={resetToPreset}
                activePreset={isModified ? null : selectedProfile.id}
                disabled={loading}
                showPresetPicker={false}
              />
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={() => void assess()}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>
                  {scoringStep === 1
                    ? '1. Transforming features...'
                    : scoringStep === 2
                    ? '2. Scoring calibrated XGBoost...'
                    : '3. Quantifying uncertainty...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Assess Churn Risk &amp; Generate Policy</span>
              </>
            )}
          </button>
        </section>

        {/* RIGHT COLUMN: Review Recommendation Panel (Sticky on Desktop) */}
        <section className="lg:sticky lg:top-20 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-2xs">
              2
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-950">Review Recommendation</h2>
              <p className="text-xs text-slate-500">Calibrated risk, conformal bounds, and retention arm</p>
            </div>
          </div>

          {/* Empty State */}
          {!result && !loading && (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-2xs">
                <ArrowRight className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Ready for Assessment</h3>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                Choose a customer profile on the left and click <strong>Assess Churn Risk</strong> to inspect calibrated probability and conformal uncertainty.
              </p>
            </div>
          )}

          {/* Loading Progressive State */}
          {loading && (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 p-8 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-4 text-sm font-bold text-slate-900">
                {scoringStep === 1
                  ? 'Extracting Feature Vector'
                  : scoringStep === 2
                  ? 'Evaluating XGBoost & Isotonic Calibration'
                  : 'Computing Mondrian Conformal Sets'}
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Executing leakage-free Stage 12b inference and Thompson Sampling policy routing.
              </p>
            </div>
          )}

          {/* Result Cards */}
          {result && uncertainty && (
            <div className="space-y-4 animate-fade-in">
              {/* Primary Decision Card */}
              <article
                className={`rounded-2xl border p-5 transition-all ${
                  isPriority
                    ? 'border-rose-200 bg-rose-50/80 text-rose-950 shadow-xs'
                    : 'border-emerald-200 bg-emerald-50/80 text-emerald-950 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
                  <span>Operational Decision</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      isPriority ? 'bg-rose-200/70 text-rose-900' : 'bg-emerald-200/70 text-emerald-900'
                    }`}
                  >
                    {isPriority ? 'Action Required' : 'Low Risk'}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">
                      {isPriority ? 'Priority Diagnostic Call' : 'Monitor Without Call'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {isPriority
                        ? 'Place account in high-priority diagnostic call queue.'
                        : 'Calibrated probability is below economic triage threshold.'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-4xl font-black tracking-tight">
                      {(probability * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                      Calibrated P(Churn)
                    </p>
                  </div>
                </div>
              </article>

              {/* Conformal Uncertainty Card */}
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    95% Conformal Prediction Set
                  </span>
                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                    Set: [{result.conformal_prediction_set.join(', ')}]
                  </span>
                </div>
                <h4 className="mt-2 text-xs font-bold text-slate-900">{uncertainty.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{uncertainty.body}</p>
              </article>

              {/* Thompson Sampling Policy Arm */}
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Assigned Policy Arm (Bandit)
                  </span>
                  <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 capitalize">
                    {result.recommended_arm.replaceAll('_', ' ')}
                  </span>
                </div>
                <h4 className="mt-2 text-xs font-bold text-slate-900 capitalize">
                  Strategy: {result.recommended_arm.replaceAll('_', ' ')}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Selected via Redis-backed Thompson Sampling posterior exploration. Evaluator should confirm whether this offer aligns with customer diagnostics.
                </p>
              </article>

              {/* Counterfactual Lever Scenario */}
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Model-Consistent Lever Scenario
                  </span>
                  {scenarioLoading && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <LoaderCircle className="h-3 w-3 animate-spin" /> Search in progress
                    </span>
                  )}
                </div>

                {scenarioLoading ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Evaluating nearest flip in actionable feature space (contract length, tech support, online security)...
                  </p>
                ) : counterfactual?.flippable && scenario ? (
                  <div className="mt-2 space-y-1">
                    <h4 className="text-xs font-bold text-slate-900">
                      Recommended Discussion: Consider if customer can {scenario}.
                    </h4>
                    <p className="text-xs leading-relaxed text-slate-600">
                      This represents a minimal model-consistent flip scenario in the verified action space.
                    </p>
                  </div>
                ) : scenarioUnavailable ? (
                  <div className="mt-2 space-y-1">
                    <h4 className="text-xs font-bold text-slate-900">Scenario search timed out.</h4>
                    <p className="text-xs leading-relaxed text-slate-500">
                      Background counterfactual search did not complete within the window. Proceed with human call review.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    <h4 className="text-xs font-bold text-slate-900">No simple single-lever flip found.</h4>
                    <p className="text-xs leading-relaxed text-slate-500">
                      Risk is driven by compound tenure and contract factors that cannot be altered by lightweight support add-ons alone.
                    </p>
                  </div>
                )}
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

