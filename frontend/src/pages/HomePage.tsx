import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database, ShieldCheck, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiHealth } from '../types';

interface HomePageProps { health: ApiHealth | null; assessmentCount: number; }

export function HomePage({ health, assessmentCount }: HomePageProps) {
  const navigate = useNavigate();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-5 sm:p-8">
      <header className="grid gap-8 border-b border-slate-200 pb-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">RetentionAI · Decision support</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Make the limited retention-call budget count.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">RetentionAI helps a telecom team identify which customers should receive a diagnostic call first—using calibrated churn probability and a clear uncertainty signal.</p>
          <button onClick={() => navigate('/assess')} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Start an assessment <ArrowRight className="h-4 w-4" /></button>
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">The decision</p>
          <p className="mt-3 text-lg font-semibold leading-7 text-slate-950">Who should a retention team prioritise when it cannot call everyone?</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">The dashboard supports triage. A human diagnostic call remains the step that identifies the right response.</p>
        </aside>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <ProofPoint icon={<UsersRound className="h-5 w-5" />} title="1. Prioritise" copy="Estimate calibrated churn risk and use the documented, illustrative economic threshold as a triage cue." />
        <ProofPoint icon={<ShieldCheck className="h-5 w-5" />} title="2. Check uncertainty" copy="Prediction sets make it visible when reviewer judgement is especially important." />
        <ProofPoint icon={<Database className="h-5 w-5" />} title="3. Inspect evidence" copy="Technical reviewers can inspect the serving artifact, disjoint evaluation protocol, and architecture decisions." />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">System status</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">A Transparent, Production-Ready ML Portfolio System</h2>
          </div>
          <button
            onClick={() => navigate('/evidence')}
            className="inline-flex items-center gap-2 self-start text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition"
          >
            Open release evidence <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric
            label="Serving API"
            value={
              health?.status === 'ok' && health.model_loaded
                ? 'Active & Ready'
                : 'Waking (~45s)'
            }
            note={
              health?.model_version
                ? `Artifact v${health.model_version.slice(0, 10)}`
                : 'Render free-tier container spin-up.'
            }
          />
          <Metric
            label="This Session"
            value={`${assessmentCount} assessed`}
            note="Live predictions scored during this session."
          />
          <Metric
            label="Benchmark Dataset"
            value="7,043 Customers"
            note="Telco Churn with strict disjoint holdout protocol."
          />
        </div>
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <strong>Portfolio demonstration.</strong> Estimates calibrated churn propensity for decision support. It does not estimate causal offer uplift or represent live private customer data.
      </p>
    </main>
  );
}

function ProofPoint({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="inline-flex rounded-lg bg-indigo-50 p-2 text-indigo-700">{icon}</span><h2 className="mt-4 text-base font-semibold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></article>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></div>;
}
