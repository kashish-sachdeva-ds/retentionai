import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Target,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingDown,
  Cpu,
} from 'lucide-react';
import { predictCustomer, getCounterfactual, ApiError } from '../api';
import { CustomerForm, PRESETS } from '../components/CustomerForm';
import { PredictionHistory } from '../components/PredictionHistory';
import { ErrorBanner } from '../components/ErrorBanner';
import type {
  CounterfactualResponse,
  PredictionPayload,
  PredictionResponse,
  ScoredAssessment,
} from '../types';

interface RiskAssessmentPageProps {
  onPrediction: (response: PredictionResponse, payload: PredictionPayload) => void;
  assessments: ScoredAssessment[];
  onRecordFeedback: (assessment: ScoredAssessment, retained: boolean) => void;
  feedbackRequestId: string | null;
}

const ECONOMIC_THRESHOLD = 0.0833; // ~8.33% cost-sensitive triage threshold (ADR-002: $70 outreach / $840 LTV)

export const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({
  onPrediction,
  assessments,
  onRecordFeedback,
  feedbackRequestId,
}) => {
  const [activePreset, setActivePreset] = useState<string>('atRisk');
  const [formData, setFormData] = useState<PredictionPayload>(PRESETS.atRisk.data);
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<PredictionResponse | null>(null);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResponse | null>(null);
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    setFormData(PRESETS[presetKey].data);
    setError(null);
  };

  const handleFormChange = (data: PredictionPayload) => {
    setFormData(data);
  };

  const pollCounterfactual = async (requestId: string) => {
    setCounterfactualLoading(true);
    setCounterfactual(null);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      try {
        const data = await getCounterfactual(requestId);
        if (data.status === 'ready') {
          setCounterfactual(data);
          setCounterfactualLoading(false);
          return;
        }
      } catch {
        break;
      }
    }
    setCounterfactualLoading(false);
  };

  const executePrediction = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setCurrentResult(null);
    setCounterfactual(null);

    try {
      const response = await predictCustomer(formData);
      setCurrentResult(response);
      onPrediction(response, formData);
      void pollCounterfactual(response.request_id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to complete churn assessment. Check if API is available.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePrediction();
  };

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to run inference
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void executePrediction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, loading]);

  const isPriority =
    currentResult !== null &&
    currentResult.calibrated_churn_probability >= ECONOMIC_THRESHOLD;

  // Translate conformal prediction set
  const formatConformalSet = (set: number[]) => {
    if (set.length === 1) {
      return set[0] === 1 ? 'High Confidence Churn' : 'High Confidence Retained';
    }
    return 'Dual-Class Ambiguity (Review Needed)';
  };

  return (
    <main className="animate-fade-in max-w-7xl space-y-8 p-5 sm:p-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">
              <Cpu className="h-3 w-3" /> Live ML Inference Engine
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">Cost-Sensitive Decision Pipeline</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Customer Churn Risk Assessment
          </h2>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Configure telecom attributes to trigger calibrated probability inference, 95% conformal uncertainty bounds, multi-armed bandit policy routing, and genetic counterfactual search.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs">
            <span className="text-slate-400">Economic Cutoff:</span>{' '}
            <strong className="text-indigo-600 font-mono">8.33%</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs">
            <span className="text-slate-400">Target SLA:</span>{' '}
            <strong className="text-emerald-600 font-mono">&lt;15ms</strong>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Main Grid: Form on Left, Output on Right */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <CustomerForm
              formData={formData}
              onChange={handleFormChange}
              onSelectPreset={handleSelectPreset}
              activePreset={activePreset}
              disabled={loading}
            />

            {/* Assessment Trigger Button */}
            <div className="sticky bottom-4 z-20 rounded-2xl bg-white/90 p-2 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-md">
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-700 py-3.5 px-6 text-sm font-bold text-white shadow-md shadow-indigo-500/25 transition-all duration-200 hover:from-indigo-700 hover:to-indigo-800 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>Executing Pipeline (Inference + Conformal + Bandit)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-indigo-200 group-hover:rotate-12 transition-transform" />
                    <span>Assess Churn Risk</span>
                    <span className="ml-2 hidden rounded bg-indigo-500/40 px-1.5 py-0.5 text-[10px] font-mono text-indigo-100 sm:inline">
                      Ctrl + Enter
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Prediction Scorecard & Analysis */}
        <div className="lg:col-span-5 space-y-5">
          {currentResult ? (
            <div className="space-y-5 animate-fade-in">
              {/* Primary Scorecard Card */}
              <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Calibrated XGBoost Output
                    </span>
                    <p className="mt-1 text-4xl font-black tracking-tight text-slate-900">
                      {(currentResult.calibrated_churn_probability * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 font-medium">Estimated 30-Day Churn Risk</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold shadow-2xs ${
                      isPriority
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 ring-2 ring-rose-500/10'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 ring-2 ring-emerald-500/10'
                    }`}
                  >
                    {isPriority ? '⚡ Priority Triage Flag' : '✓ Standard Monitoring'}
                  </span>
                </div>

                {/* Progress bar vs 8.33% threshold */}
                <div className="mt-5">
                  <div className="relative h-3 w-full rounded-full bg-slate-100 overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        isPriority
                          ? 'bg-linear-to-r from-rose-500 to-rose-600'
                          : 'bg-linear-to-r from-emerald-400 to-emerald-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(4, currentResult.calibrated_churn_probability * 100))}%`,
                      }}
                    />
                    {/* 8.33% Cutoff Marker */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-slate-900 shadow-xs"
                      style={{ left: `${ECONOMIC_THRESHOLD * 100}%` }}
                      title="Economic Triage Threshold (8.33%)"
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] font-mono text-slate-400">
                    <span>0% (Safe)</span>
                    <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      Cutoff: 8.33%
                    </span>
                    <span>100% (Churn)</span>
                  </div>
                </div>

                {/* Decision context */}
                <div
                  className={`mt-4 rounded-xl p-4 text-xs leading-relaxed border ${
                    isPriority
                      ? 'bg-rose-50/50 border-rose-100 text-rose-900'
                      : 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                  }`}
                >
                  {isPriority ? (
                    <p>
                      <strong>Action Required:</strong> Churn probability of{' '}
                      <strong>{(currentResult.calibrated_churn_probability * 100).toFixed(1)}%</strong>{' '}
                      exceeds the <strong>8.33%</strong> economic cutoff ($70 intervention vs. $840 expected customer value). Proactive retention intervention is economically justified.
                    </p>
                  ) : (
                    <p>
                      <strong>Safe Profile:</strong> Churn probability is below the 8.33% economic triage boundary. Under resource constraints, proactive outreach is not required.
                    </p>
                  )}
                </div>
              </section>

              {/* Conformal Uncertainty & Bandit Arm Card */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-violet-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      95% Conformal Set
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xl font-black text-slate-900">
                    {`{${currentResult.conformal_prediction_set.join(', ')}}`}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 font-medium">
                    {formatConformalSet(currentResult.conformal_prediction_set)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Assigned Bandit Arm
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-black capitalize text-indigo-700 truncate">
                    {currentResult.recommended_arm}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 font-medium">
                    Thompson Sampling Policy
                  </p>
                </div>
              </section>

              {/* Counterfactual Scenario Card */}
              <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800">
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Actionable Counterfactual Levers
                    </h4>
                  </div>
                  {counterfactualLoading && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Computing...
                    </span>
                  )}
                </div>

                <div className="mt-3.5">
                  {counterfactualLoading ? (
                    <div className="space-y-2 py-2">
                      <div className="skeleton h-5 w-3/4 rounded-md" />
                      <div className="skeleton h-5 w-1/2 rounded-md" />
                    </div>
                  ) : counterfactual?.raw_changes &&
                    Object.keys(counterfactual.raw_changes).length > 0 ? (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-600">
                        Minimum feature adjustments that flip this customer profile below the 8.33% risk threshold:
                      </p>
                      <div className="space-y-2 pt-1">
                        {Object.entries(counterfactual.raw_changes).map(([lever, value]) => (
                          <div
                            key={lever}
                            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-xs"
                          >
                            <span className="font-semibold text-slate-700">{lever}</span>
                            <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : counterfactual?.flippable && !counterfactual.raw_changes ? (
                    <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-100">
                      ✓ Profile is already below the risk threshold. No contract or service adjustment required.
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No simple 1-to-2 feature combination in the actionable grid flips this profile below the decision boundary.
                    </p>
                  )}
                </div>

                <p className="mt-3.5 text-[10px] text-slate-400 italic">
                  * Model-consistent optimization scenario, evaluated against isotonic calibrated boundary.
                </p>
              </section>

              {/* Metadata strip */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
                <span>Request: {currentResult.request_id.slice(0, 16)}...</span>
                <span>Bundle: {currentResult.model_version.slice(0, 15)}</span>
              </div>
            </div>
          ) : (
            /* ENTERPRISE PIPELINE AWAITING PANEL */
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                {/* Header with live pulse */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Inference &amp; Triage Engine
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Awaiting customer profile submission
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Ready
                  </span>
                </div>

                {/* Pipeline Flow Showcase */}
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Active Production Pipeline:
                  </p>

                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-indigo-600 shadow-2xs border border-slate-100">
                        1
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">Calibrated XGBoost Ensemble</p>
                        <p className="text-[11px] text-slate-500">
                          Raw model logits converted to calibrated posterior probabilities via Isotonic Regression.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-violet-600 shadow-2xs border border-slate-100">
                        2
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">95% Conformal Prediction Region</p>
                        <p className="text-[11px] text-slate-500">
                          Non-conformity scoring provides guaranteed distribution-free coverage bounds.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-amber-600 shadow-2xs border border-slate-100">
                        3
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">8.33% Economic Cost Boundary</p>
                        <p className="text-[11px] text-slate-500">
                          Derived mathematically: Cost / LTV = $70 / $840 ≈ 8.33% triage cutoff.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-emerald-600 shadow-2xs border border-slate-100">
                        4
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">Thompson Sampling &amp; Counterfactual</p>
                        <p className="text-[11px] text-slate-500">
                          Bandit exploration routes optimal retention incentives while finding minimal feature levers.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interactive CTA */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => void executePrediction()}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700 border border-indigo-200/80 transition-all hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer"
                  >
                    <span>Run Assessment for Current Profile</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick specs pill bar */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Inference</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">&lt;15ms</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Calibration</p>
                  <p className="text-xs font-bold text-indigo-600 mt-0.5">Isotonic</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Coverage</p>
                  <p className="text-xs font-bold text-emerald-600 mt-0.5">95.0%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Session History & Audit Trail */}
      <div className="pt-6 border-t border-slate-200">
        <PredictionHistory
          assessments={assessments}
          onRecordFeedback={onRecordFeedback}
          feedbackRequestId={feedbackRequestId}
        />
      </div>
    </main>
  );
};
