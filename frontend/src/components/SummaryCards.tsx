import { ShieldAlert, Sparkles, Target, Activity } from 'lucide-react';
import type { ScoredAssessment } from '../types';

export function SummaryCards({ assessments }: { assessments: ScoredAssessment[] }) {
  const priorityCount = assessments.filter(
    (assessment) => assessment.response.calibrated_churn_probability >= 0.0833
  ).length;

  const meanRisk = assessments.length
    ? assessments.reduce((sum, assessment) => sum + assessment.response.calibrated_churn_probability, 0) /
      assessments.length
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-2 flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Session Assessments</span>
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <Activity className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">{assessments.length}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">scored</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Total profiles evaluated in this session</p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-2 flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Average Churn Risk</span>
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {meanRisk === null ? '—' : `${(meanRisk * 100).toFixed(1)}%`}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {meanRisk !== null ? 'calibrated' : 'no data'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Average calibrated probability across scored requests</p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-2 flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Triage Priority</span>
          <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
            <Target className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold tracking-tight text-rose-600">{priorityCount}</span>
          <span className="inline-flex items-center rounded-full border border-rose-200/60 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
            <ShieldAlert className="mr-1 h-3 w-3" />
            &ge; 8.33%
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Cases exceeding the economic triage threshold</p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-2 flex items-center justify-between text-slate-500">
          <span className="text-xs font-bold uppercase tracking-wider">Outcomes Recorded</span>
          <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold tracking-tight text-violet-600">
            {assessments.filter((a) => a.feedback).length}
          </span>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
            bandit feedback
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Feedback submitted to Thompson Sampling bandit</p>
      </article>
    </div>
  );
}
