import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Activity,
} from 'lucide-react';
import { predictCustomer, getCounterfactual, ApiError } from '../api';
import { CustomerForm } from '../components/CustomerForm';
import { CustomerSidebar, PRESET_PROFILES, type CustomerProfile } from '../components/CustomerSidebar';
import { ShapWaterfall } from '../components/ShapWaterfall';
import { ExplainPanel } from '../components/ExplainPanel';
import { ActionPanel } from '../components/ActionPanel';
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
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile>(PRESET_PROFILES[0]);
  const [formData, setFormData] = useState<PredictionPayload>(PRESET_PROFILES[0].data);
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<PredictionResponse | null>(null);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResponse | null>(null);
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);

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

  const executePrediction = useCallback(
    async (payloadToScore?: PredictionPayload) => {
      if (loading) return;
      const targetPayload = payloadToScore || formData;
      setLoading(true);
      setError(null);
      setCurrentResult(null);
      setCounterfactual(null);

      try {
        const response = await predictCustomer(targetPayload);
        setCurrentResult(response);
        onPrediction(response, targetPayload);
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
    },
    [formData, loading, onPrediction]
  );

  // Auto-run inference on initial load for the default profile
  useEffect(() => {
    void executePrediction(PRESET_PROFILES[0].data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCustomer = (profile: CustomerProfile) => {
    setSelectedProfile(profile);
    setFormData(profile.data);
    setError(null);
    void executePrediction(profile.data);
  };

  const handleFormChange = (data: PredictionPayload) => {
    setFormData(data);
  };

  const handleManualReAssess = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePrediction(formData);
  };

  // Find latest assessment for active result
  const activeAssessment = assessments.find(
    (a) => a.response.request_id === currentResult?.request_id
  );

  const prob = currentResult?.calibrated_churn_probability ?? selectedProfile.riskScore ?? 0.86;
  const isCritical = prob >= 0.6;
  const isModerate = prob >= 0.2 && prob < 0.6;
  const isTriagePriority = prob >= ECONOMIC_THRESHOLD;

  return (
    <main className="animate-fade-in max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">
              <Zap className="h-3 w-3 text-indigo-600" /> Executive Cockpit
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-semibold">
              3-Zone Explainable AI &amp; Next-Best-Action Suite
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Customer Retention Decision Engine
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void executePrediction(formData)}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all disabled:opacity-60 disabled:cursor-wait"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Evaluating Model...' : 'Re-Run Inference'}</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* 3-ZONE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================================================================ */}
        {/* ZONE 1: THE NAVIGATOR (Left Column - 3 cols) */}
        {/* ================================================================ */}
        <div className="lg:col-span-3">
          <CustomerSidebar
            selectedId={selectedProfile.id}
            onSelectCustomer={handleSelectCustomer}
            assessments={assessments}
          />
        </div>

        {/* ================================================================ */}
        {/* ZONE 2: EXPLAINABLE AI STAGE (Center Column - 6 cols) */}
        {/* ================================================================ */}
        <div className="lg:col-span-6 space-y-5">
          {/* Hero Big Number Card */}
          <div
            className={`rounded-2xl p-5 border transition-all shadow-xs relative overflow-hidden ${
              isCritical
                ? 'bg-gradient-to-br from-rose-500/10 via-white to-white border-rose-200'
                : isModerate
                ? 'bg-gradient-to-br from-amber-500/10 via-white to-white border-amber-200'
                : 'bg-gradient-to-br from-emerald-500/10 via-white to-white border-emerald-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Customer Account:
                  </span>
                  <span className="text-xs font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {selectedProfile.name}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className={`text-4xl sm:text-5xl font-black tracking-tight ${
                      isCritical
                        ? 'text-rose-600'
                        : isModerate
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {(prob * 100).toFixed(1)}%
                  </span>
                  <div>
                    <span
                      className={`text-xs font-black uppercase px-2.5 py-1 rounded-full ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800'
                          : isModerate
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isCritical
                        ? 'Critical Risk'
                        : isModerate
                        ? 'Moderate Triage'
                        : 'Safe & Retained'}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Calibrated Churn Propensity
                    </p>
                  </div>
                </div>
              </div>

              {/* Conformal & Policy Pill */}
              <div className="bg-white/80 backdrop-blur-xs border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 shrink-0">
                <div className="flex items-center justify-between gap-3 text-slate-500">
                  <span>Conformal Set (95%):</span>
                  <span className="font-bold text-slate-800">
                    {currentResult?.conformal_prediction_set
                      ? currentResult.conformal_prediction_set.length === 1
                        ? currentResult.conformal_prediction_set[0] === 1
                          ? '{ Churn } (Definite)'
                          : '{ Retain } (Definite)'
                        : '{ Retain, Churn } (Ambiguous)'
                      : '{ Verified }'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-slate-500">
                  <span>Economic Triage:</span>
                  <span
                    className={`font-black ${
                      isTriagePriority ? 'text-rose-600' : 'text-slate-600'
                    }`}
                  >
                    {isTriagePriority ? 'Priority Outreach' : 'Standard Routine'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SHAP Waterfall Force Plot */}
          <ShapWaterfall payload={formData} churnProbability={prob} />

          {/* AI Executive Synthesis */}
          {currentResult ? (
            <ExplainPanel payload={formData} result={currentResult} />
          ) : (
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-indigo-400 animate-spin" />
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    Evaluating Model Inference &amp; Attributions...
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Computing isotonic calibration curve and conformal boundary
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Custom Parameter Inspector (for advanced tweaks) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => setShowAdvancedEditor((prev) => !prev)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Customer Feature Inspector &amp; Parameter Editor
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-indigo-600 font-bold">
                <span>{showAdvancedEditor ? 'Hide Editor' : 'Modify Features'}</span>
                {showAdvancedEditor ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {showAdvancedEditor && (
              <div className="p-5 bg-slate-50/50 space-y-4">
                <CustomerForm
                  formData={formData}
                  onChange={handleFormChange}
                  onSelectPreset={(presetKey) => {
                    const preset = PRESET_PROFILES.find((p) => p.id === presetKey);
                    if (preset) handleSelectCustomer(preset);
                  }}
                  activePreset={selectedProfile.id}
                  disabled={loading}
                />
                <div className="flex justify-end pt-2">
                  <button
                    onClick={(e) => void handleManualReAssess(e)}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs disabled:opacity-60"
                  >
                    {loading ? 'Evaluating Model...' : 'Apply & Recalculate Risk'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================ */}
        {/* ZONE 3: NEXT BEST ACTION DRAWER (Right Column - 3 cols) */}
        {/* ================================================================ */}
        <div className="lg:col-span-3">
          <ActionPanel
            currentResult={currentResult}
            counterfactual={counterfactual}
            counterfactualLoading={counterfactualLoading}
            onRecordFeedback={onRecordFeedback}
            feedbackRequestId={feedbackRequestId}
            assessmentRecord={activeAssessment}
          />
        </div>
      </div>
    </main>
  );
};
