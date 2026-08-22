import type { ScoredAssessment } from '../types';
import { CheckCircle2, Clock3, FlaskConical } from 'lucide-react';

interface PredictionHistoryProps {
  assessments: ScoredAssessment[];
  onRecordFeedback: (assessment: ScoredAssessment, retained: boolean) => void;
  feedbackRequestId: string | null;
}

export function PredictionHistory({
  assessments,
  onRecordFeedback,
  feedbackRequestId,
}: PredictionHistoryProps) {
  if (!assessments.length) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <FlaskConical className="mx-auto h-8 w-8 text-indigo-500" />
        <h3 className="mt-3 text-base font-bold text-slate-900">No live assessments yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Run an assessment to create an API-backed prediction record. Outcomes can then be recorded once for the assigned policy arm.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="border-b border-slate-200 p-5">
        <h3 className="text-base font-bold text-slate-900">Live prediction audit trail</h3>
        <p className="mt-0.5 text-xs text-slate-500">Records are held in this browser session; outcomes update the shared Redis bandit state.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {assessments.map((assessment) => {
          const isPriority = assessment.response.calibrated_churn_probability >= 0.0833;
          const isSaving = feedbackRequestId === assessment.response.request_id;
          return (
            <div key={assessment.response.request_id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isPriority ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {(assessment.response.calibrated_churn_probability * 100).toFixed(1)}% churn risk
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    {assessment.response.recommended_arm} arm
                  </span>
                  {assessment.feedback ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Outcome recorded</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Awaiting outcome</span>
                  )}
                </div>
                <p className="mt-2 font-mono text-xs text-slate-500">{assessment.response.request_id}</p>
                <p className="mt-1 text-xs text-slate-500">Model {assessment.response.model_version} · assessed {assessment.createdAt.toLocaleTimeString()}</p>
              </div>
              {!assessment.feedback && (
                <div className="flex shrink-0 gap-2">
                  <button disabled={isSaving} onClick={() => onRecordFeedback(assessment, true)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60">
                    Retained
                  </button>
                  <button disabled={isSaving} onClick={() => onRecordFeedback(assessment, false)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
                    Churned
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
