import React, { useState } from 'react';
import {
  Zap,
  TrendingDown,
  Gift,
  Wrench,
  Ban,
  CheckCircle2,
  DollarSign,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import type {
  CounterfactualResponse,
  PredictionResponse,
  ScoredAssessment,
} from '../types';

interface ActionPanelProps {
  currentResult: PredictionResponse | null;
  counterfactual: CounterfactualResponse | null;
  counterfactualLoading: boolean;
  onRecordFeedback: (assessment: ScoredAssessment, retained: boolean) => void;
  feedbackRequestId: string | null;
  assessmentRecord?: ScoredAssessment;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  currentResult,
  counterfactual,
  counterfactualLoading,
  onRecordFeedback,
  feedbackRequestId,
  assessmentRecord,
}) => {
  const [selectedArmOverride, setSelectedArmOverride] = useState<string | null>(null);

  if (!currentResult) {
    return (
      <div className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col items-center justify-center text-center h-[calc(100vh-140px)] sticky top-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3 border border-indigo-150">
          <Zap className="w-6 h-6" />
        </div>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
          Next Best Action Drawer
        </h3>
        <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
          Select a customer in Zone 1 to generate calibrated ROI interventions powered by Thompson Sampling &amp; Counterfactual Analysis.
        </p>
      </div>
    );
  }

  const prob = currentResult.calibrated_churn_probability;
  const currentArm = selectedArmOverride || currentResult.recommended_arm;
  const hasRecordedFeedback = Boolean(assessmentRecord?.feedback);
  const isFeedbackSaving = feedbackRequestId === currentResult.request_id;

  // Compute simulated post-intervention risk reductions
  const actionOptions = [
    {
      armKey: 'discount',
      title: '15% Retention Discount (12m)',
      icon: Gift,
      color: 'indigo',
      cost: '$45 outreach cost',
      simulatedRisk: Math.max(0.04, prob * 0.42), // 58% relative drop
      roi: '+$520 Expected LTV Saved',
      mechanism: 'Counteracts high monthly charges and restores price competitiveness.',
    },
    {
      armKey: 'tech_support',
      title: 'Free Priority Tech Support Bundle',
      icon: Wrench,
      color: 'violet',
      cost: '$25 service cost',
      simulatedRisk: Math.max(0.06, prob * 0.58), // 42% relative drop
      roi: '+$410 Expected LTV Saved',
      mechanism: 'Resolves fiber friction and builds ecosystem attachment.',
    },
    {
      armKey: 'control',
      title: 'No Intervention (Control Group)',
      icon: Ban,
      color: 'slate',
      cost: '$0 outreach cost',
      simulatedRisk: prob,
      roi: '$0 Baseline',
      mechanism: 'Holdout control for unbiased empirical lift validation.',
    },
  ];

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col shadow-xs h-[calc(100vh-140px)] sticky top-4">
      {/* Header */}
      <div className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-emerald-500/10 rounded-lg text-emerald-600">
              <Zap className="w-4 h-4" />
            </div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Next Best Action
            </h2>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-150 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> ROI Engine
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Multi-Armed Bandit policy recommendations
        </p>
      </div>

      {/* Intervention Action Cards */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-2.5 pr-0.5 custom-scrollbar">
        {actionOptions.map((opt) => {
          const isRecommended = currentResult.recommended_arm === opt.armKey;
          const isSelected = currentArm === opt.armKey;
          const Icon = opt.icon;
          const dropPct = (((prob - opt.simulatedRisk) / (prob || 1)) * 100).toFixed(0);

          return (
            <div
              key={opt.armKey}
              onClick={() => setSelectedArmOverride(opt.armKey)}
              className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200'
              }`}
            >
              {/* Badge for bandit champion */}
              {isRecommended && (
                <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Bandit Pick
                </div>
              )}

              <div className="flex items-start gap-2.5">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    opt.armKey === 'discount'
                      ? 'bg-indigo-100 text-indigo-700'
                      : opt.armKey === 'tech_support'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 leading-tight">
                    {opt.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-medium leading-relaxed">
                    {opt.mechanism}
                  </p>

                  {/* Impact metrics */}
                  <div className="mt-2 flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-emerald-600" />
                      Post: {(opt.simulatedRisk * 100).toFixed(0)}%
                    </span>
                    {Number(dropPct) > 0 && (
                      <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md">
                        -{dropPct}% risk
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Counterfactual Insights Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between text-slate-700 font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-600" /> Counterfactual Search
            </span>
            {counterfactualLoading && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold">
                <Clock className="w-3 h-3 animate-spin" /> Solving DiCE...
              </span>
            )}
          </div>

          {counterfactual?.status === 'ready' && counterfactual.raw_changes ? (
            <div className="mt-1.5 space-y-1 text-[11px] text-slate-600">
              <p className="text-emerald-700 font-semibold">
                ✓ Minimum feature changes to flip to safe tier:
              </p>
              {Object.entries(counterfactual.raw_changes).map(([k, v]) => (
                <div key={k} className="flex justify-between bg-white px-2 py-1 rounded border border-slate-150">
                  <span className="font-mono text-slate-500">{k}:</span>
                  <strong className="text-slate-800">{String(v)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1">
              {counterfactualLoading
                ? 'Solving integer programming counterfactual perturbation in background worker...'
                : 'Asynchronous counterfactual search available once prediction queue resolves.'}
            </p>
          )}
        </div>
      </div>

      {/* Action Execution Footer */}
      <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
        {hasRecordedFeedback ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
            <p className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Outcome Logged ({assessmentRecord?.feedback?.retained ? 'Retained' : 'Churned'})
            </p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              Thompson Sampling Beta posterior updated in real time.
            </p>
          </div>
        ) : assessmentRecord ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase text-slate-400 text-center tracking-wider">
              Record Customer Retention Outcome
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isFeedbackSaving}
                onClick={() => onRecordFeedback(assessmentRecord, true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Customer Retained
              </button>
              <button
                disabled={isFeedbackSaving}
                onClick={() => onRecordFeedback(assessmentRecord, false)}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2 px-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 disabled:opacity-60"
              >
                Customer Churned
              </button>
            </div>
          </div>
        ) : null}

        <div className="text-[10px] text-slate-400 text-center">
          Triage threshold: <strong className="text-slate-600">8.33%</strong> (ADR-002: $70/$840)
        </div>
      </div>
    </aside>
  );
};
