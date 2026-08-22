import React from 'react';
import {
  FileText,
  ShieldAlert,
  Database,
  Cpu,
} from 'lucide-react';

const ADR_LIST = [
  { id: 'ADR-000', title: 'Staged Build Process & False-Start Restart', category: 'Foundation' },
  { id: 'ADR-001', title: 'Business Problem Framing & Constraints', category: 'Problem' },
  { id: 'ADR-002', title: 'Success Metric (PR-AUC) & Economic Prioritization', category: 'Problem' },
  { id: 'ADR-003', title: 'Reproducible Data Extraction & Provenance', category: 'Data' },
  { id: 'ADR-004', title: 'Data Understanding & Schema Validation', category: 'Data' },
  { id: 'ADR-005', title: 'Hypothesis-Driven Exploratory Data Analysis', category: 'EDA' },
  { id: 'ADR-006', title: 'Information Value (IV) Feature Engineering', category: 'Features' },
  { id: 'ADR-007', title: 'Leakage-Safe Preprocessing Pipeline', category: 'Pipeline' },
  { id: 'ADR-008', title: 'Baseline Logistic Regression Model', category: 'Modeling' },
  { id: 'ADR-009', title: 'Champion XGBoost Model Selection', category: 'Modeling' },
  { id: 'ADR-010', title: 'Calibration & Mondrian Conformal Prediction', category: 'Uncertainty' },
  { id: 'ADR-011', title: 'Survival Analysis (Cox Proportional Hazards)', category: 'Analytics' },
  { id: 'ADR-012', title: 'Thompson Sampling for Retention Offers', category: 'Policy' },
  { id: 'ADR-013', title: 'Counterfactual Scenario Search', category: 'Explainability' },
  { id: 'ADR-014', title: 'FastAPI Production Serving Architecture', category: 'Engineering' },
  { id: 'ADR-015', title: 'Docker, CI/CD, and Container Orchestration', category: 'DevOps' },
  { id: 'ADR-016', title: 'SHAP Global & Local Interpretability', category: 'Explainability' },
  { id: 'ADR-017', title: 'System Hardening & Disjoint Split Audit', category: 'Audit' },
];

export const AboutPage: React.FC = () => {
  return (
    <main className="animate-fade-in max-w-5xl space-y-10 p-5 sm:p-8">
      {/* Title & Introduction */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
          About RetentionAI
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          RetentionAI is a decision-documented machine learning system designed to solve a constrained business question: <em>Which customers should a telecom retention team prioritize when operating with a finite call budget?</em>
        </p>
      </div>

      {/* Dataset Provenance */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Database className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-bold">Dataset &amp; Provenance</h3>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          The models in this application are trained on the standard <strong>Kaggle Telco Customer Churn dataset</strong> (7,043 records, 21 attributes).
        </p>
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
            <span className="font-semibold text-slate-700">Total Observations</span>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">7,043 rows</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
            <span className="font-semibold text-slate-700">Baseline Churn Rate</span>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">26.5%</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
            <span className="font-semibold text-slate-700">Data Integrity</span>
            <p className="mt-1 font-mono text-sm font-bold text-emerald-600">SHA-256 Verified</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 italic">
          Raw data is never committed to Git or hardcoded into Docker containers (ADR-003). Preprocessed artifacts carry verified cryptographic hash tags.
        </p>
      </section>

      {/* Core Technical Pillars */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Cpu className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-bold">Engineering Pillars</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              1. Leakage-Safe Pipeline
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              All encoders, variance filters, and standardizers are fit strictly on training splits. Test and calibration data are transformed purely out-of-sample to prevent target leakage.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              2. Isotonic Calibration
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Raw tree probabilities often distort near tails. Isotonic regression transforms raw XGBoost scores into true posterior probabilities, aligning scores directly with economic thresholds.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              3. Mondrian Conformal Prediction
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Provides guaranteed class-conditional coverage sets at the 95% level on disjoint holdouts, alerting reviewers when predictions carry ambiguous uncertainty.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              4. Thompson Sampling Bandit
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Explores multiple retention offers with Beta posteriors stored in Redis, dynamically updating routing probabilities as downstream retention feedback is recorded.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture Decision Records (ADRs) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <FileText className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-bold">18 Architecture Decision Records</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">docs/decisions/</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          Every stage of the engineering process is backed by an ADR detailing the context, options considered, trade-offs, and final decision rationale.
        </p>

        <div className="grid gap-2 sm:grid-cols-2 pt-2">
          {ADR_LIST.map((adr) => (
            <div
              key={adr.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-indigo-600">{adr.id}</span>
                <span className="text-slate-700">{adr.title}</span>
              </div>
              <span className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {adr.category}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Honest Scope & Disclaimers */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-900">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-bold">Scope, Assumptions &amp; Limitations</h3>
        </div>
        <ul className="space-y-2 text-xs text-amber-800 list-disc list-inside">
          <li>
            <strong>Propensity vs. Uplift:</strong> The Kaggle dataset lacks randomized offer assignment. Predictions reflect churn propensity, not causal treatment effects or proof of retainability.
          </li>
          <li>
            <strong>Cost-Sensitive Decision Boundary:</strong> The 8.33% cutoff assumes an illustrative ~$70 intervention cost against ~$840 annual revenue. In production, this threshold would be calibrated to actual call-center unit economics.
          </li>
          <li>
            <strong>Disjoint Verification:</strong> All holdout metrics are generated from a genuine 4-way split (Train / Calibration / Conformal / Holdout) to preserve exchangeability guarantees.
          </li>
        </ul>
      </section>
    </main>
  );
};
