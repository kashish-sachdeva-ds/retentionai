import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, FlaskConical, Shield, Sparkles, Target, Zap } from 'lucide-react';
import type { ApiHealth } from '../types';

interface HomePageProps {
  health: ApiHealth | null;
  assessmentCount: number;
}

export function HomePage({ health, assessmentCount }: HomePageProps) {
  const navigate = useNavigate();

  return (
    <main className="animate-fade-in max-w-6xl space-y-10 p-5 sm:p-8">
      {/* Hero section */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-8 py-14 text-white shadow-lg sm:px-12">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative z-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" />
            Portfolio Demonstration
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Predict churn risk with calibrated ML
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-indigo-100">
            RetentionAI scores which telecom customers are most likely to leave, so a retention team
            with a limited budget knows who to call first. Powered by a leakage-safe pipeline,
            isotonic calibration, and conformal uncertainty quantification.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/assess')}
              className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 hover:shadow-md"
            >
              <Sparkles className="h-4 w-4" />
              Try Risk Assessment
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/evidence')}
              className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <BarChart3 className="h-4 w-4" />
              View Model Evidence
            </button>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section>
        <h3 className="mb-6 text-lg font-bold text-slate-900">How it works</h3>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Target className="h-5 w-5 text-indigo-600" />}
            title="Calibrated Risk Scoring"
            description="An XGBoost model with isotonic calibration produces well-calibrated churn probabilities — the number means what it says."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5 text-violet-600" />}
            title="Uncertainty Quantification"
            description="Mondrian conformal prediction sets communicate when the model is confident vs. when reviewer judgement is warranted."
          />
          <FeatureCard
            icon={<FlaskConical className="h-5 w-5 text-emerald-600" />}
            title="Intervention Policy"
            description="Thompson Sampling explores retention actions (discount, technician, control) — a demonstrative mechanism, not a causal claim."
          />
        </div>
      </section>

      {/* Architecture overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-4">Pipeline Architecture</h3>
        <div className="overflow-x-auto">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-600 min-w-[600px]">
            <PipelineStep label="Kaggle Telco" sublabel="7,043 rows" color="bg-slate-100" />
            <PipelineArrow />
            <PipelineStep label="Leakage-safe features" sublabel="IV-scored, VIF-pruned" color="bg-blue-50" />
            <PipelineArrow />
            <PipelineStep label="XGBoost champion" sublabel="PR-AUC optimized" color="bg-indigo-50" />
            <PipelineArrow />
            <PipelineStep label="Calibration" sublabel="Isotonic + conformal" color="bg-violet-50" />
            <PipelineArrow />
            <PipelineStep label="FastAPI" sublabel="Versioned artifacts" color="bg-emerald-50" />
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Every stage is documented with an Architecture Decision Record.
          Features are fit on training data only. Calibration and conformal thresholds
          use disjoint splits. Model artifacts are versioned with data provenance.
        </p>
      </section>

      {/* Session summary */}
      <section className="grid gap-5 sm:grid-cols-3">
        <StatusCard
          label="API Status"
          value={health?.status === 'ok' ? 'Ready' : 'Offline'}
          detail={health?.model_version ? `Model v${health.model_version.slice(0, 14)}` : 'Not connected'}
          color={health?.status === 'ok' ? 'text-emerald-700' : 'text-amber-700'}
        />
        <StatusCard
          label="Session Assessments"
          value={String(assessmentCount)}
          detail="Live API-backed predictions this session"
          color="text-slate-900"
        />
        <StatusCard
          label="Dataset"
          value="Telco Churn"
          detail="Public Kaggle benchmark, not live customer data"
          color="text-slate-900"
        />
      </section>

      {/* Honest scope disclosure */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-800">Scope &amp; limitations</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-700">
          This is a portfolio demonstration built on a static, public dataset. It estimates churn
          propensity — it does <strong>not</strong> estimate the causal effect of a retention offer,
          prove customer retainability, or constitute a production deployment. The Thompson Sampling
          mechanism is illustrative; no randomized intervention-outcome data exists in this project.
        </p>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-sm">
      <div className="mb-3 inline-flex rounded-lg bg-slate-50 p-2.5">{icon}</div>
      <h4 className="text-sm font-bold text-slate-900">{title}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{description}</p>
    </article>
  );
}

function PipelineStep({ label, sublabel, color }: { label: string; sublabel: string; color: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 ${color} px-3 py-2 text-center min-w-[100px]`}>
      <p className="font-semibold text-slate-800 text-[11px]">{label}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sublabel}</p>
    </div>
  );
}

function PipelineArrow() {
  return <span className="text-slate-400 text-sm font-bold shrink-0">→</span>;
}

function StatusCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-extrabold tracking-tight ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
