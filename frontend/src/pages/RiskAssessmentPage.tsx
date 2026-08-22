import React, { useCallback, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, LoaderCircle, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ApiError, getCounterfactual, predictCustomer } from '../api';
import { CustomerForm } from '../components/CustomerForm';
import { ErrorBanner } from '../components/ErrorBanner';
import { PRESET_PROFILES, type CustomerProfile } from '../components/CustomerSidebar';
import type { CounterfactualResponse, PredictionPayload, PredictionResponse } from '../types';

interface RiskAssessmentPageProps { onPrediction: (response: PredictionResponse, payload: PredictionPayload) => void; }
const ECONOMIC_THRESHOLD = 70 / 840;

function uncertaintyCopy(predictionSet: number[]) {
  if (predictionSet.length > 1) return { title: 'Uncertain — reviewer judgement warranted', body: 'The prediction set includes both outcomes. Use the diagnostic call to understand the customer’s situation before choosing a response.' };
  if (predictionSet[0] === 1) return { title: 'High confidence: churn risk', body: 'This is a prediction-set uncertainty signal, not a guarantee that the customer will leave.' };
  return { title: 'High confidence: no-churn risk', body: 'This is a prediction-set uncertainty signal, not a guarantee that the customer will stay.' };
}

function describeScenario(changes?: Record<string, unknown> | null) {
  if (!changes || Object.keys(changes).length === 0) return null;
  const labels: Record<string, string> = { ContractCommitmentMonths: 'move to a longer contract commitment', OnlineSecurity_Yes: 'add online security', TechSupport_Yes: 'add technical support' };
  const updates = Object.keys(changes).map((key) => labels[key] ?? key);
  return updates.length === 1 ? updates[0] : `${updates.slice(0, -1).join(', ')} and ${updates.at(-1)}`;
}

export const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({ onPrediction }) => {
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile>(PRESET_PROFILES[0]);
  const [formData, setFormData] = useState<PredictionPayload>(PRESET_PROFILES[0].data);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioUnavailable, setScenarioUnavailable] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollScenario = useCallback(async (requestId: string) => {
    setScenarioLoading(true); setScenarioUnavailable(false);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      try {
        const response = await getCounterfactual(requestId);
        if (response.status === 'ready') { setCounterfactual(response); setScenarioLoading(false); return; }
      } catch { setScenarioUnavailable(true); break; }
    }
    setScenarioUnavailable(true);
    setScenarioLoading(false);
  }, []);

  const assess = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null); setResult(null); setCounterfactual(null); setScenarioUnavailable(false);
    try {
      const response = await predictCustomer(formData);
      setResult(response);
      onPrediction(response, formData);
      void pollScenario(response.request_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to assess this profile. Check the model service and try again.');
    } finally { setLoading(false); }
  }, [formData, loading, onPrediction, pollScenario]);

  const selectProfile = (profile: CustomerProfile) => { setSelectedProfile(profile); setFormData(profile.data); setResult(null); setCounterfactual(null); setScenarioUnavailable(false); setError(null); };
  const probability = result?.calibrated_churn_probability ?? 0;
  const isPriority = probability > ECONOMIC_THRESHOLD;
  const uncertainty = result ? uncertaintyCopy(result.conformal_prediction_set) : null;
  const scenario = describeScenario(counterfactual?.raw_changes);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Customer assessment</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Decide who needs a diagnostic call first.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Choose a representative profile, assess calibrated churn risk, then review the uncertainty signal before assigning scarce outreach capacity.</p>
      </header>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><span className="font-bold">Portfolio demonstration.</span> Estimates churn propensity—not retention-offer uplift or causal impact.</div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span><div><h2 className="text-base font-semibold text-slate-950">Select a profile</h2><p className="mt-1 text-xs leading-5 text-slate-500">These are structurally valid benchmark personas, not real customer records.</p></div></div>
          <div className="mt-5 space-y-3">
            {PRESET_PROFILES.map((profile) => {
              const active = selectedProfile.id === profile.id;
              const label = profile.id === 'atRisk' ? 'At-risk new customer' : profile.id === 'borderline' ? 'Established customer' : 'Stable long-term customer';
              const description = profile.id === 'atRisk' ? 'short tenure, month-to-month, fibre, few support add-ons' : profile.id === 'borderline' ? 'medium tenure, one-year contract' : 'long tenure, two-year contract and established service bundle';
              return <button key={profile.id} type="button" onClick={() => selectProfile(profile)} className={`w-full rounded-xl border p-4 text-left transition ${active ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-4"><span className="text-sm font-semibold text-slate-900">{label}</span>{active && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}</div><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></button>;
            })}
          </div>
          <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50/70" open={editing} onToggle={(event) => setEditing(event.currentTarget.open)}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-slate-800"><span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-indigo-600" /> Edit customer details</span><ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" /></summary>
            <div className="border-t border-slate-200 p-4"><CustomerForm formData={formData} onChange={setFormData} onSelectPreset={(key) => { const profile = PRESET_PROFILES.find((item) => item.id === key); if (profile) selectProfile(profile); }} activePreset={selectedProfile.id} disabled={loading} showPresetPicker={false} /></div>
          </details>
          <button type="button" onClick={() => void assess()} disabled={loading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? 'Assessing churn risk…' : 'Assess churn risk'}</button>
        </section>

        <section className="min-h-[530px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">2</span><div><h2 className="text-base font-semibold text-slate-950">Review recommendation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Risk, uncertainty, and the next human review action.</p></div></div>
          {!result && !loading && <div className="flex min-h-[400px] flex-col justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><ArrowRight className="h-5 w-5" /></div><h3 className="mt-4 text-base font-semibold text-slate-900">Ready for an assessment</h3><p className="mt-2 text-sm leading-6 text-slate-500">Select a profile and assess churn risk. The result will show risk, uncertainty, and the next review action.</p></div>}
          {loading && <div className="flex min-h-[400px] flex-col items-center justify-center text-center"><LoaderCircle className="h-7 w-7 animate-spin text-indigo-600" /><p className="mt-4 text-sm font-semibold text-slate-800">Scoring the selected profile</p><p className="mt-1 text-xs text-slate-500">Fetching a calibrated probability and prediction-set uncertainty.</p></div>}
          {result && uncertainty && <div className="mt-6 space-y-4">
            <article className={`rounded-xl border p-5 ${isPriority ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Review priority</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-2xl font-semibold tracking-tight text-slate-950">{isPriority ? 'Priority review' : 'Monitor'}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{isPriority ? 'Place this account in the diagnostic-call queue.' : 'No priority outreach indicated by the illustrative threshold.'}</p></div><p className="text-4xl font-semibold tracking-tight text-slate-950">{(probability * 100).toFixed(1)}%</p></div><p className="mt-3 text-[11px] leading-5 text-slate-500">Estimated churn probability. Illustrative threshold: {(ECONOMIC_THRESHOLD * 100).toFixed(1)}% ($70 outreach cost / $840 annual value).</p></article>
            <article className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Uncertainty</p><h3 className="mt-2 text-sm font-semibold text-slate-900">{uncertainty.title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{uncertainty.body}</p></article>
            <article className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Assigned experiment arm</p><h3 className="mt-2 text-sm font-semibold capitalize text-slate-900">{result.recommended_arm.replaceAll('_', ' ')}</h3><p className="mt-1 text-xs leading-5 text-slate-600">Illustrative policy mechanism; no causal offer-effect claim. The diagnostic call should determine whether any intervention fits the customer’s actual reason for leaving.</p></article>
            <article className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Model-consistent scenario</p>{scenarioLoading ? <p className="mt-2 text-sm text-slate-600">Checking feasible contract and support scenarios…</p> : counterfactual?.flippable && scenario ? <><h3 className="mt-2 text-sm font-semibold text-slate-900">Consider whether it is feasible to {scenario}.</h3><p className="mt-1 text-xs leading-5 text-slate-600">This shows a limited model-consistent scenario, not a causal recommendation or guaranteed retention outcome.</p></> : scenarioUnavailable ? <><h3 className="mt-2 text-sm font-semibold text-slate-900">Scenario check unavailable.</h3><p className="mt-1 text-xs leading-5 text-slate-600">The limited scenario search did not return. Continue with human review; do not infer a recommendation from this absence.</p></> : <><h3 className="mt-2 text-sm font-semibold text-slate-900">Escalate for human review.</h3><p className="mt-1 text-xs leading-5 text-slate-600">No feasible scenario in the limited action set changes the model decision.</p></>}</article>
          </div>}
        </section>
      </div>
    </main>
  );
};
