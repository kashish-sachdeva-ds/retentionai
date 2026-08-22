import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Target,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingDown,
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

const ECONOMIC_THRESHOLD = 0.0833; // ~8.33% cost-sensitive triage threshold (ADR-002)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Customer Churn Risk Assessment
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Submit customer attributes for live calibrated inference, conformal uncertainty, and policy routing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs">
            Triage Cutoff: <strong className="text-indigo-600">8.33%</strong>
          </span>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Main Grid: Form on Left, Output on Right */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Form */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSubmit} className="space-y-6">
            <CustomerForm
              formData={formData}
              onChange={handleFormChange}
              onSelectPreset={handleSelectPreset}
              activePreset={activePreset}
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Computing Calibrated Risk...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Assess Churn Risk
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Prediction Scorecard & Analysis */}
        <div className="lg:col-span-5 space-y-5">
          {currentResult ? (
            <div className="space-y-5 animate-fade-in">
              {/* Primary Scorecard Card */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Estimated Churn Probability
                    </p>
                    <p className="mt-1 text-4xl font-black tracking-tight text-slate-900">
                      {(currentResult.calibrated_churn_probability * 100).toFixed(1)}%
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                      isPriority
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {isPriority ? '⚡ Priority Triage Flag' : '✓ Standard Monitoring'}
                  </span>
                </div>

                {/* Progress bar vs 8.33% threshold */}
                <div className="mt-4">
                  <div className="relative h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isPriority ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(4, currentResult.calibrated_churn_probability * 100))}%`,
                      }}
                    />
                    {/* 8.33% Marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-slate-800"
                      style={{ left: `${ECONOMIC_THRESHOLD * 100}%` }}
                      title="Economic Triage Threshold (8.33%)"
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>0%</span>
                    <span className="text-slate-600 font-semibold">Cutoff: 8.33%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Decision context */}
                <div className="mt-4 rounded-lg bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 border border-slate-100">
                  {isPriority ? (
                    <p>
                      <strong>Recommendation:</strong> Risk of{' '}
                      <strong>{(currentResult.calibrated_churn_probability * 100).toFixed(1)}%</strong>{' '}
                      exceeds the <strong>8.33%</strong> economic threshold (derived from ~$70 outreach vs. ~$840 lost customer value). Proactive retention intervention is economically justified.
                    </p>
                  ) : (
                    <p>
                      <strong>Recommendation:</strong> Customer risk is below the economic triage boundary. Under constrained retention resources, proactive outreach is not currently prioritized.
                    </p>
                  )}
                </div>
              </section>

              {/* Conformal Uncertainty & Bandit Arm Card */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-violet-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      95% Conformal Set
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-lg font-bold text-slate-900">
                    {`{${currentResult.conformal_prediction_set.join(', ')}}`}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatConformalSet(currentResult.conformal_prediction_set)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Zap className="h-4 w-4 text-indigo-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Assigned Policy Arm
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-bold capitalize text-indigo-700">
                    {currentResult.recommended_arm}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Selected via Thompson Sampling
                  </p>
                </div>
              </section>

              {/* Counterfactual Scenario Card */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700">
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Feasible Scenario Levers
                    </h4>
                  </div>
                  {counterfactualLoading && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Searching...
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  {counterfactualLoading ? (
                    <div className="space-y-2 py-2">
                      <div className="skeleton h-4 w-3/4 rounded" />
                      <div className="skeleton h-4 w-1/2 rounded" />
                    </div>
                  ) : counterfactual?.raw_changes && Object.keys(counterfactual.raw_changes).length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">
                        Minimum feature adjustments that bring this customer profile below the 8.33% churn threshold:
                      </p>
                      <div className="space-y-1.5 pt-1">
                        {Object.entries(counterfactual.raw_changes).map(([lever, value]) => (
                          <div
                            key={lever}
                            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                          >
                            <span className="font-semibold text-slate-700">{lever}</span>
                            <span className="font-mono font-bold text-indigo-600">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : counterfactual?.flippable && !counterfactual.raw_changes ? (
                    <p className="text-xs text-emerald-700">
                      Customer is already below the risk threshold. No contract or service change required.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No simple 1-to-2 feature combination in the actionable grid flips this profile below the decision boundary.
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[10px] text-slate-400 italic">
                  * Model-consistent search scenario, not causal treatment proof.
                </p>
              </section>

              {/* Metadata strip */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
                <span>ID: {currentResult.request_id.slice(0, 18)}...</span>
                <span>Model: v{currentResult.model_version.slice(0, 10)}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-3">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Awaiting Profile Submission</h3>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
                Choose an archetype or customize customer attributes on the left, then click <strong>Assess Churn Risk</strong> to see real API predictions.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                <span>Select &amp; Score</span>
                <ArrowRight className="h-3.5 w-3.5" />
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
