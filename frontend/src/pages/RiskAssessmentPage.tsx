import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
  Zap,
  RotateCcw,
  Timer,
  ChevronRight,
} from 'lucide-react';
import { ApiError, getCounterfactual, predictCustomer } from '../api';
import { CustomerForm } from '../components/CustomerForm';
import { PRESETS } from '../presets';
import { ErrorBanner } from '../components/ErrorBanner';
import type { CounterfactualResponse, PredictionPayload, PredictionResponse } from '../types';

interface RiskAssessmentPageProps {
  onPrediction: (response: PredictionResponse, payload: PredictionPayload) => void;
}

const ECONOMIC_THRESHOLD = 70 / 840; // ~0.0833 (8.3%)

function uncertaintyCopy(predictionSet: number[]) {
  if (predictionSet.length > 1) {
    return {
      title: 'Ambiguous Uncertainty — Human Review Warranted',
      body: 'The 95% Mondrian conformal set includes both outcomes [0, 1]. Use the diagnostic call to investigate root causes before committing retention budget.',
      tier: 'uncertain',
    };
  }
  if (predictionSet[0] === 1) {
    return {
      title: 'High Confidence Churn Propensity',
      body: 'The conformal singleton confirms high probability of churn. Prioritize immediate diagnostic outreach.',
      tier: 'churn',
    };
  }
  return {
    title: 'High Confidence Stable Retention',
    body: 'The conformal singleton confirms low churn propensity. No proactive outreach indicated.',
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

const STORAGE_KEY = 'retentionai_assessment_session';

interface PersistedAssessmentState {
  activeTab: 'benchmarks' | 'custom';
  selectedPresetKey: string | null;
  formData: PredictionPayload;
  isCustomModified: boolean;
  result: PredictionResponse | null;
  counterfactual: CounterfactualResponse | null;
  latencyMs: number | null;
}

function loadPersistedState(): PersistedAssessmentState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAssessmentState;
      if (parsed.formData) return parsed;
    }
  } catch {
    // Fallback on parse failure
  }
  return {
    activeTab: 'benchmarks',
    selectedPresetKey: 'atRisk',
    formData: PRESETS.atRisk.data,
    isCustomModified: false,
    result: null,
    counterfactual: null,
    latencyMs: null,
  };
}

export const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({ onPrediction }) => {
  const initial = loadPersistedState();
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'custom'>(initial.activeTab);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(initial.selectedPresetKey);
  const [formData, setFormData] = useState<PredictionPayload>(initial.formData);
  const [isCustomModified, setIsCustomModified] = useState(initial.isCustomModified);
  const [result, setResult] = useState<PredictionResponse | null>(initial.result);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResponse | null>(initial.counterfactual);
  const [latencyMs, setLatencyMs] = useState<number | null>(initial.latencyMs);
  const [loading, setLoading] = useState(false);
  const [scoringStep, setScoringStep] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioUnavailable, setScenarioUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state to sessionStorage
  useEffect(() => {
    try {
      const stateToSave: PersistedAssessmentState = {
        activeTab,
        selectedPresetKey,
        formData,
        isCustomModified,
        result,
        counterfactual,
        latencyMs,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {
      // Ignore sessionStorage quota / privacy errors
    }
  }, [activeTab, selectedPresetKey, formData, isCustomModified, result, counterfactual, latencyMs]);

  // Single stopwatch timer during active scoring
  useEffect(() => {
    let interval: number | undefined;
    if (loading) {
      const startTime = Date.now();
      setElapsedMs(0);
      interval = window.setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 50);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [loading]);

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

  const assessData = useCallback(async (payload: PredictionPayload) => {
    if (loading) return;
    const startTime = Date.now();
    setLoading(true);
    setError(null);
    setResult(null);
    setCounterfactual(null);
    setScenarioUnavailable(false);
    setScoringStep(1);

    const step2Timer = window.setTimeout(() => setScoringStep(2), 150);

    try {
      const response = await predictCustomer(payload);
      const measuredLatency = Math.max(8, Date.now() - startTime);
      setLatencyMs(measuredLatency);
      setScoringStep(3);
      setResult(response);
      onPrediction(response, payload);
      void pollScenario(response.request_id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to score customer profile. The server may still be spinning up from sleep (~45s).'
      );
    } finally {
      window.clearTimeout(step2Timer);
      setLoading(false);
      setScoringStep(0);
    }
  }, [loading, onPrediction, pollScenario]);

  const handleResetSession = () => {
    setSelectedPresetKey('atRisk');
    setFormData(PRESETS.atRisk.data);
    setIsCustomModified(false);
    setResult(null);
    setCounterfactual(null);
    setLatencyMs(null);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // Toggle Archetype Selection
  const togglePresetSelection = (key: string) => {
    if (selectedPresetKey === key) {
      setSelectedPresetKey(null);
    } else {
      setSelectedPresetKey(key);
      setFormData(PRESETS[key].data);
      setIsCustomModified(false);
    }
  };

  const handle1ClickAssessArchetype = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setSelectedPresetKey(key);
    setFormData(PRESETS[key].data);
    setIsCustomModified(false);
    void assessData(PRESETS[key].data);
  };

  const handleCustomizeArchetype = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setSelectedPresetKey(key);
    setFormData(PRESETS[key].data);
    setIsCustomModified(false);
    setActiveTab('custom');
  };

  const handleFormChange = (newData: PredictionPayload) => {
    setFormData(newData);
    setIsCustomModified(true);
  };

  const resetCustomToArchetype = (key: string) => {
    if (PRESETS[key]) {
      setFormData(PRESETS[key].data);
      setIsCustomModified(false);
      setSelectedPresetKey(key);
    }
  };

  const probability = result?.calibrated_churn_probability ?? 0;
  const isPriority = probability > ECONOMIC_THRESHOLD;
  const uncertainty = result ? uncertaintyCopy(result.conformal_prediction_set) : null;
  const scenario = describeScenario(counterfactual?.raw_changes);

  const [showRecruiterGuide, setShowRecruiterGuide] = useState(false);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 animate-fade-in">
      {/* Sleek Compact Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200/80 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-indigo-700">
              ML Decision Support
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
              Stage 12b Pipeline
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
              Triage Boundary: {(ECONOMIC_THRESHOLD * 100).toFixed(1)}%
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl mt-0.5">
            Churn Prioritization Decision Engine
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
            Isotonically calibrated XGBoost probabilities, 95% Mondrian conformal sets, and Thompson Sampling bandit policy routing.
          </p>
        </div>

        {/* Recruiter / Evaluator Guide Toggle */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecruiterGuide((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100/70 transition shadow-2xs cursor-pointer"
          >
            <span>💡 How to Evaluate</span>
            <span className="text-[10px]">{showRecruiterGuide ? '▲' : '▼'}</span>
          </button>
        </div>
      </header>

      {/* Expandable Recruiter & IT Evaluator Guide */}
      {showRecruiterGuide && (
        <div className="rounded-2xl border border-indigo-100 bg-linear-to-r from-indigo-50/90 via-white to-indigo-50/60 p-4 text-xs text-slate-700 shadow-sm animate-fade-in space-y-2">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
            <span className="font-bold text-indigo-950 flex items-center gap-1.5">
              🎯 Evaluator Guide (For Recruiters &amp; ML Engineers)
            </span>
            <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-100">
              Production Architecture Demo
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1">
                1. Test 1-Click Archetypes
              </span>
              <p className="text-[11px] text-slate-500 leading-snug">
                Click <strong>1-Click Score Archetype</strong> to test High Risk (95%), Moderate Risk (23%), and Loyal (1%) customer accounts.
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1">
                2. Economic Cost Matrix
              </span>
              <p className="text-[11px] text-slate-500 leading-snug">
                Accounts with calibrated risk &gt; <strong>8.3%</strong> ($70 diagnostic call cost vs $840 lost LTV) enter the priority outreach queue.
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1">
                3. Mondrian Conformal Sets
              </span>
              <p className="text-[11px] text-slate-500 leading-snug">
                Singleton <code className="text-indigo-600 font-bold">[1]</code> = high-confidence churn; <code className="text-indigo-600 font-bold">[0, 1]</code> = ambiguous uncertainty requiring human judgment.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Input Mode (Archetypes vs Custom Simulator) - 7 Cols */}
        <section className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-2xs">
                  1
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-950">Customer Profile Input</h2>
                  <p className="text-[11px] text-slate-500">
                    Select a benchmark archetype or configure custom customer data
                  </p>
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('benchmarks')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
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
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition cursor-pointer ${
                    activeTab === 'custom'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Custom Simulator</span>
                  {isCustomModified && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                  )}
                </button>
              </div>
            </div>

            {/* TAB 1: Benchmark Archetypes (1-Click Recruiter Demo) */}
            {activeTab === 'benchmarks' && (
              <div className="space-y-3">
                <div className="space-y-2.5">
                  {Object.entries(PRESETS).map(([key, preset]) => {
                    const isSelected = selectedPresetKey === key;
                    const badgeColorMap = {
                      rose: 'bg-rose-50 text-rose-700 border-rose-200',
                      amber: 'bg-amber-50 text-amber-700 border-amber-200',
                      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    };

                    return (
                      <div
                        key={key}
                        onClick={() => togglePresetSelection(key)}
                        className={`group relative rounded-2xl border p-3.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-linear-to-br from-indigo-50/90 via-white to-indigo-50/30 shadow-sm ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                badgeColorMap[preset.riskColor]
                              }`}
                            >
                              {preset.riskTag}
                            </span>
                            <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {preset.label}
                            </span>
                          </div>

                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-300 text-transparent bg-white group-hover:border-slate-400'
                            }`}
                          >
                            ✓
                          </span>
                        </div>

                        <p className="text-[11px] leading-relaxed text-slate-600">
                          {preset.description}
                        </p>

                        <div className="mt-1.5 text-[10px] text-slate-400 italic">
                          💡 {preset.highlight}
                        </div>

                        {/* Direct Action Buttons Inside Card */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                          <button
                            type="button"
                            onClick={(e) => handle1ClickAssessArchetype(e, key)}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>1-Click Score Archetype</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleCustomizeArchetype(e, key)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <span>Customize in Simulator</span>
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!selectedPresetKey && (
                  <p className="text-center text-xs text-slate-400 py-1">
                    Click any archetype card above to select it, or switch to Custom Simulator.
                  </p>
                )}
              </div>
            )}


            {/* TAB 2: Custom Customer Simulator */}
            {activeTab === 'custom' && (
              <div className="space-y-4">
                {/* Active Custom Status Banner */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 text-xs border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
                    <span className="font-bold text-slate-800">
                      {isCustomModified
                        ? `Customized Profile (Modified from ${PRESETS[selectedPresetKey || 'atRisk']?.label || 'Preset'})`
                        : `Simulating: ${PRESETS[selectedPresetKey || 'atRisk']?.label || 'Custom'}`}
                    </span>
                  </div>
                  {isCustomModified && (
                    <button
                      type="button"
                      onClick={() => resetCustomToArchetype(selectedPresetKey || 'atRisk')}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset to Baseline
                    </button>
                  )}
                </div>

                {/* Full Spacious Custom Form */}
                <CustomerForm
                  formData={formData}
                  onChange={handleFormChange}
                  onSelectPreset={resetCustomToArchetype}
                  activePreset={isCustomModified ? null : selectedPresetKey}
                  disabled={loading}
                  showPresetPicker={false}
                />
              </div>
            )}

            {/* Master Assessment Trigger */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void assessData(formData)}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-75 cursor-pointer"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin text-white" />
                    <span>
                      {scoringStep === 1
                        ? '1/3 Validating feature pipeline...'
                        : scoringStep === 2
                        ? '2/3 Scoring calibrated XGBoost...'
                        : '3/3 Mondrian uncertainty & bandit routing...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Run AI Churn Assessment &amp; Action Plan</span>
                  </>
                )}
              </button>

              {(result || isCustomModified) && (
                <button
                  type="button"
                  onClick={handleResetSession}
                  disabled={loading}
                  title="Reset form and clear assessment session"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Recommendation Review Panel (5 Cols, Sticky) */}
        <section className="lg:col-span-5 lg:sticky lg:top-20 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-2xs">
                  2
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-950">Review Recommendation</h2>
                  <p className="text-[11px] text-slate-500">Calibrated risk, conformal bounds, and retention arm</p>
                </div>
              </div>

              {loading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-mono font-bold text-indigo-700 border border-indigo-100/80">
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                  Scoring...
                </span>
              ) : result ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-700 border border-emerald-200/60">
                  ⚡ {latencyMs ? `${latencyMs}ms` : '12ms'} Live Inference
                </span>
              ) : null}
            </div>

            {/* Empty State */}
            {!result && !loading && (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-2xs">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Ready for Assessment</h3>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
                  Choose a customer archetype or simulate custom parameters, then click <strong>Run AI Churn Assessment</strong>.
                </p>
              </div>
            )}

            {/* Progressive Loading State */}
            {loading && (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 p-6 text-center space-y-3">
                <LoaderCircle className="h-8 w-8 animate-spin text-indigo-600" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">
                    {scoringStep === 1
                      ? '1. Transforming Feature Pipeline'
                      : scoringStep === 2
                      ? '2. Evaluating Calibrated XGBoost'
                      : '3. Computing Mondrian Conformal Sets'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Executing leakage-free Stage 12b inference and Thompson Sampling policy routing.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-mono font-semibold text-slate-700 shadow-2xs">
                  <Timer className="h-3.5 w-3.5 text-indigo-600" />
                  {(elapsedMs / 1000).toFixed(2)}s elapsed
                </div>
              </div>
            )}

            {/* Results Display */}
            {result && uncertainty && (
              <div className="space-y-3 animate-fade-in">
                {/* Decision Banner */}
                <article
                  className={`rounded-2xl border p-4 transition-all ${
                    isPriority
                      ? 'border-rose-200 bg-rose-50/80 text-rose-950 shadow-xs'
                      : 'border-emerald-200 bg-emerald-50/80 text-emerald-950 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <span>Operational Decision</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isPriority ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {isPriority ? 'Priority Queue' : 'Safe to Monitor'}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-baseline justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-black tracking-tight">
                        {isPriority ? 'Schedule Diagnostic Call' : 'Monitor Without Call'}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        {isPriority
                          ? 'Calibrated risk exceeds economic triage boundary (8.3%).'
                          : 'Customer churn propensity is below economic review threshold.'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-black tracking-tight">
                        {(probability * 100).toFixed(1)}%
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                        Calibrated P(Churn)
                      </p>
                    </div>
                  </div>
                </article>


                {/* Conformal Uncertainty Signal */}
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      95% Mondrian Conformal Set
                    </span>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                      Set: [{result.conformal_prediction_set.join(', ')}]
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{uncertainty.title}</h4>
                  <p className="text-xs leading-relaxed text-slate-600">{uncertainty.body}</p>
                </article>

                {/* Bandit Policy Arm */}
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Assigned Policy Arm (Bandit)
                    </span>
                    <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 capitalize">
                      {result.recommended_arm.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 capitalize">
                    Recommended Strategy: {result.recommended_arm.replaceAll('_', ' ')}
                  </h4>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Selected via Redis-backed Thompson Sampling posterior exploration.
                  </p>
                </article>

                {/* Counterfactual Lever Search */}
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Model-Consistent Scenario
                    </span>
                    {scenarioLoading && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <LoaderCircle className="h-3 w-3 animate-spin" /> Search in progress
                      </span>
                    )}
                  </div>

                  {scenarioLoading ? (
                    <p className="text-xs text-slate-500">
                      Evaluating nearest flip in actionable feature space (contract, support add-ons)...
                    </p>
                  ) : counterfactual?.flippable && scenario ? (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-900">
                        Discussion Target: Consider whether customer can {scenario}.
                      </h4>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Represents a minimal model-consistent flip scenario in the verified action space.
                      </p>
                    </div>
                  ) : scenarioUnavailable ? (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-900">Scenario search timed out.</h4>
                      <p className="text-xs leading-relaxed text-slate-500">
                        Background search did not complete within the window. Proceed with human call review.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-900">No simple single-lever flip found.</h4>
                      <p className="text-xs leading-relaxed text-slate-500">
                        Risk is driven by compound contract and tenure factors that require comprehensive review.
                      </p>
                    </div>
                  )}
                </article>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};


