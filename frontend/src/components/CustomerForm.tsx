import React from 'react';
import {
  Shield,
  Headphones,
  Cloud,
  Smartphone,
  Tv,
  Film,
  Sparkles,
  CreditCard,
  Layers,
  Users,
  AlertTriangle,
} from 'lucide-react';
import type { PredictionPayload } from '../types';

export const PRESETS: Record<
  string,
  {
    label: string;
    riskTag: string;
    riskColor: 'rose' | 'amber' | 'emerald';
    description: string;
    highlight: string;
    data: PredictionPayload;
  }
> = {
  atRisk: {
    label: 'At-risk New Customer',
    riskTag: 'High Risk ~86%',
    riskColor: 'rose',
    description: '2 mo tenure, month-to-month, fiber optic, zero protection/support add-ons.',
    highlight: 'Lowest barrier to exit & highest churn sensitivity.',
    data: {
      tenure: 2,
      MonthlyCharges: 89.5,
      TotalCharges: 179.0,
      SeniorCitizen: 0,
      Contract: 'Month-to-month',
      InternetService: 'Fiber optic',
      OnlineSecurity: 'No',
      OnlineBackup: 'No',
      DeviceProtection: 'No',
      TechSupport: 'No',
      StreamingTV: 'Yes',
      StreamingMovies: 'Yes',
      PaymentMethod: 'Electronic check',
      gender: 'Female',
      Partner: 'No',
      Dependents: 'No',
      PhoneService: 'Yes',
      MultipleLines: 'No',
      PaperlessBilling: 'Yes',
    },
  },
  borderline: {
    label: 'Borderline Mid-Contract',
    riskTag: 'Moderate Risk ~24%',
    riskColor: 'amber',
    description: '18 mo tenure, 1-year contract, fiber optic, partial security add-ons.',
    highlight: 'Near economic triage boundary; sensitive to renewal incentives.',
    data: {
      tenure: 18,
      MonthlyCharges: 79.0,
      TotalCharges: 1422.0,
      SeniorCitizen: 1,
      Contract: 'One year',
      InternetService: 'Fiber optic',
      OnlineSecurity: 'No',
      OnlineBackup: 'Yes',
      DeviceProtection: 'No',
      TechSupport: 'No',
      StreamingTV: 'Yes',
      StreamingMovies: 'No',
      PaymentMethod: 'Credit card (automatic)',
      gender: 'Female',
      Partner: 'No',
      Dependents: 'No',
      PhoneService: 'Yes',
      MultipleLines: 'No',
      PaperlessBilling: 'Yes',
    },
  },
  loyal: {
    label: 'Loyal Long-Tenure',
    riskTag: 'Low Risk ~3%',
    riskColor: 'emerald',
    description: '68 mo tenure, 2-year contract, DSL, complete security ecosystem.',
    highlight: 'High ecosystem lock-in; low proactive outreach required.',
    data: {
      tenure: 68,
      MonthlyCharges: 64.0,
      TotalCharges: 4352.0,
      SeniorCitizen: 0,
      Contract: 'Two year',
      InternetService: 'DSL',
      OnlineSecurity: 'Yes',
      OnlineBackup: 'Yes',
      DeviceProtection: 'Yes',
      TechSupport: 'Yes',
      StreamingTV: 'No',
      StreamingMovies: 'No',
      PaymentMethod: 'Bank transfer (automatic)',
      gender: 'Male',
      Partner: 'Yes',
      Dependents: 'Yes',
      PhoneService: 'Yes',
      MultipleLines: 'Yes',
      PaperlessBilling: 'No',
    },
  },
};

const ADDON_CONFIG = [
  {
    key: 'TechSupport' as const,
    label: 'Tech Support',
    desc: '24/7 dedicated engineering support',
    impact: 'High Retention Lever',
    icon: Headphones,
  },
  {
    key: 'OnlineSecurity' as const,
    label: 'Online Security',
    desc: 'Threat & malware protection suite',
    impact: 'High Retention Lever',
    icon: Shield,
  },
  {
    key: 'OnlineBackup' as const,
    label: 'Cloud Backup',
    desc: 'Automated encrypted remote backup',
    impact: 'Ecosystem Lock-in',
    icon: Cloud,
  },
  {
    key: 'DeviceProtection' as const,
    label: 'Device Protection',
    desc: 'Hardware warranty & replacement',
    impact: 'Ecosystem Lock-in',
    icon: Smartphone,
  },
  {
    key: 'StreamingTV' as const,
    label: 'Streaming TV',
    desc: 'Live HD television package',
    impact: 'Entertainment',
    icon: Tv,
  },
  {
    key: 'StreamingMovies' as const,
    label: 'Streaming Movies',
    desc: 'On-demand film catalog',
    impact: 'Entertainment',
    icon: Film,
  },
];

interface CustomerFormProps {
  formData: PredictionPayload;
  onChange: (data: PredictionPayload) => void;
  onSelectPreset: (presetKey: string) => void;
  activePreset: string | null;
  disabled?: boolean;
  showPresetPicker?: boolean;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({
  formData,
  onChange,
  disabled = false,
}) => {
  const setField = <K extends keyof PredictionPayload>(key: K, value: PredictionPayload[K]) => {
    const next = { ...formData, [key]: value };
    // Auto-update TotalCharges when tenure or monthly charges change
    if (key === 'tenure' || key === 'MonthlyCharges') {
      const tenureVal = key === 'tenure' ? Number(value) : formData.tenure;
      const monthlyVal = key === 'MonthlyCharges' ? Number(value) : formData.MonthlyCharges;
      next.TotalCharges = Math.round(tenureVal * monthlyVal * 100) / 100;
    }
    onChange(next);
  };

  const handleInternetServiceChange = (value: string) => {
    const noInternet = value === 'No';
    const next = { ...formData, InternetService: value } as PredictionPayload;
    ADDON_CONFIG.forEach(({ key }) => {
      next[key] = noInternet
        ? 'No internet service'
        : formData[key] === 'No internet service'
        ? 'No'
        : formData[key];
    });
    onChange(next);
  };

  const toggleAddon = (key: (typeof ADDON_CONFIG)[number]['key']) => {
    if (disabled || formData.InternetService === 'No') return;
    const current = formData[key];
    const nextVal = current === 'Yes' ? 'No' : 'Yes';
    setField(key, nextVal as PredictionPayload[typeof key]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. FINANCIAL & CONTRACT ARCHITECTURE */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Financial Contract &amp; Billing
              </h4>
              <p className="text-[11px] text-slate-400">
                Core subscription parameters and primary churn drivers
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200/60">
            <AlertTriangle className="h-3 w-3" /> Key Risk Drivers
          </span>
        </div>

        {/* Sliders Grid: Tenure & Monthly Charges */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Tenure Slider */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Customer Tenure</label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-black text-indigo-600">
                  {formData.tenure} mo
                </span>
                <span className="text-[11px] text-slate-400">
                  ({(formData.tenure / 12).toFixed(1)} yrs)
                </span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="72"
              step="1"
              value={formData.tenure}
              disabled={disabled}
              onChange={(e) => setField('tenure', parseInt(e.target.value) || 0)}
              className="w-full cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
            />

            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
              <span>0 mo (New)</span>
              <span>36 mo (3 yrs)</span>
              <span>72 mo (6 yrs)</span>
            </div>
          </div>

          {/* Monthly Charges Slider */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Monthly Subscription</label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-black text-slate-900">
                  ${Number(formData.MonthlyCharges).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400">/month</span>
              </div>
            </div>

            <input
              type="range"
              min="18"
              max="120"
              step="0.5"
              value={formData.MonthlyCharges}
              disabled={disabled}
              onChange={(e) => setField('MonthlyCharges', parseFloat(e.target.value) || 18)}
              className="w-full cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
            />

            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
              <span>$18.00 (Basic)</span>
              <span>$70.00 (Avg)</span>
              <span>$120.00 (Premium)</span>
            </div>
          </div>
        </div>

        {/* Contract Type Segmented Buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Contract Commitment Duration</span>
            {formData.Contract === 'Month-to-month' ? (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                High Exit Sensitivity
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Retention Lock-in Active
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'Month-to-month', label: 'Month-to-Month', desc: 'No lock-in' },
              { value: 'One year', label: 'One Year', desc: '12-mo plan' },
              { value: 'Two year', label: 'Two Year', desc: '24-mo plan' },
            ].map((option) => {
              const active = formData.Contract === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('Contract', option.value as PredictionPayload['Contract'])}
                  className={`rounded-xl border p-3 text-center transition-all cursor-pointer ${
                    active
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">{option.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{option.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Internet Service Segmented Buttons */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Internet Connection Infrastructure
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'Fiber optic', label: 'Fiber Optic', desc: 'High speed' },
              { value: 'DSL', label: 'DSL', desc: 'Stable copper' },
              { value: 'No', label: 'No Internet', desc: 'Voice only' },
            ].map((option) => {
              const active = formData.InternetService === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleInternetServiceChange(option.value)}
                  className={`rounded-xl border p-3 text-center transition-all cursor-pointer ${
                    active
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold">{option.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{option.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment Method Segmented Buttons */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">Payment &amp; Billing Method</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { value: 'Electronic check', label: 'Electronic Check', note: 'High Churn' },
              { value: 'Credit card (automatic)', label: 'Credit Card', note: 'Auto-pay' },
              { value: 'Bank transfer (automatic)', label: 'Bank Transfer', note: 'Auto-pay' },
              { value: 'Mailed check', label: 'Mailed Check', note: 'Manual' },
            ].map((option) => {
              const active = formData.PaymentMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('PaymentMethod', option.value as PredictionPayload['PaymentMethod'])}
                  className={`rounded-xl border p-2.5 text-center transition-all cursor-pointer ${
                    active
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] font-bold truncate">{option.label}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{option.note}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. ACTIONABLE SUPPORT & SECURITY ADD-ON ECOSYSTEM */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Actionable Ecosystem Levers
              </h4>
              <p className="text-[11px] text-slate-400">
                Click any tile to toggle protection, technical support, and entertainment services
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
            <Sparkles className="h-3 w-3" /> Counterfactual Levers
          </span>
        </div>

        {formData.InternetService === 'No' ? (
          <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200">
            Internet add-on features are disabled because <strong>No Internet Service</strong> is selected.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ADDON_CONFIG.map(({ key, label, desc, impact, icon: Icon }) => {
              const isEnabled = formData[key] === 'Yes';
              const isHighImpact = impact === 'High Retention Lever';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAddon(key)}
                  disabled={disabled}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                    isEnabled
                      ? 'border-indigo-600 bg-linear-to-br from-indigo-50/90 to-white shadow-xs ring-1 ring-indigo-500/20'
                      : 'border-slate-200 bg-slate-50/40 hover:border-indigo-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                        isEnabled
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500 group-hover:text-indigo-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isHighImpact && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100/80 px-1.5 py-0.5 rounded">
                          Key Lever
                        </span>
                      )}
                      <span
                        className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          isEnabled
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 text-transparent bg-white'
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900">{label}</p>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isEnabled ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. HOUSEHOLD & DEMOGRAPHICS */}
      <details className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs transition-all">
        <summary className="flex cursor-pointer items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-800 select-none">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <span>Household &amp; Demographics</span>
              <span className="ml-2 text-[11px] font-normal text-slate-400 normal-case">
                (Life-stage stickiness)
              </span>
            </div>
          </div>
          <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200">
            &#9662;
          </span>
        </summary>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 pt-4">
          {/* Senior Citizen */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Senior Citizen Status</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { val: 0, label: 'Under 65' },
                { val: 1, label: '65+ Senior' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('SeniorCitizen', opt.val as PredictionPayload['SeniorCitizen'])}
                  className={`rounded-lg border py-2 text-xs font-semibold text-center transition ${
                    formData.SeniorCitizen === opt.val
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Gender</label>
            <div className="grid grid-cols-2 gap-1.5">
              {['Female', 'Male'].map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('gender', g as PredictionPayload['gender'])}
                  className={`rounded-lg border py-2 text-xs font-semibold text-center transition ${
                    formData.gender === g
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Partner */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Partner</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { val: 'No', label: 'No Partner' },
                { val: 'Yes', label: 'Has Partner' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('Partner', opt.val as PredictionPayload['Partner'])}
                  className={`rounded-lg border py-2 text-xs font-semibold text-center transition ${
                    formData.Partner === opt.val
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dependents */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Dependents</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { val: 'No', label: 'No Dependents' },
                { val: 'Yes', label: 'Has Dependents' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('Dependents', opt.val as PredictionPayload['Dependents'])}
                  className={`rounded-lg border py-2 text-xs font-semibold text-center transition ${
                    formData.Dependents === opt.val
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Paperless Billing */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Paperless Billing</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { val: 'Yes', label: 'Digital (Paperless)' },
                { val: 'No', label: 'Paper Invoices' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('PaperlessBilling', opt.val as PredictionPayload['PaperlessBilling'])}
                  className={`rounded-lg border py-2 text-xs font-semibold text-center transition ${
                    formData.PaperlessBilling === opt.val
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};

