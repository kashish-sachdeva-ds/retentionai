import React from 'react';
import {
  Shield,
  Headphones,
  Cloud,
  Smartphone,
  Tv,
  Film,
  Check,
  AlertTriangle,
  Sparkles,
  CreditCard,
  Layers,
  Users,
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
    desc: '24/7 dedicated support',
    impact: 'High Retention Impact',
    icon: Headphones,
  },
  {
    key: 'OnlineSecurity' as const,
    label: 'Online Security',
    desc: 'Threat & malware protection',
    impact: 'High Retention Impact',
    icon: Shield,
  },
  {
    key: 'OnlineBackup' as const,
    label: 'Cloud Backup',
    desc: 'Automated encrypted backup',
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
    impact: 'Entertainment Add-on',
    icon: Tv,
  },
  {
    key: 'StreamingMovies' as const,
    label: 'Streaming Movies',
    desc: 'On-demand movie library',
    impact: 'Entertainment Add-on',
    icon: Film,
  },
];

interface CustomerFormProps {
  formData: PredictionPayload;
  onChange: (data: PredictionPayload) => void;
  onSelectPreset: (presetKey: string) => void;
  activePreset: string | null;
  disabled?: boolean;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({
  formData,
  onChange,
  onSelectPreset,
  activePreset,
  disabled = false,
}) => {
  const setField = <K extends keyof PredictionPayload>(key: K, value: PredictionPayload[K]) => {
    onChange({ ...formData, [key]: value });
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

  const handlePhoneServiceChange = (value: string) => {
    const next = {
      ...formData,
      PhoneService: value,
      MultipleLines:
        value === 'No'
          ? 'No phone service'
          : formData.MultipleLines === 'No phone service'
          ? 'No'
          : formData.MultipleLines,
    };
    onChange(next);
  };

  const toggleAddon = (key: (typeof ADDON_CONFIG)[number]['key']) => {
    if (disabled || formData.InternetService === 'No') return;
    const current = formData[key];
    const nextVal = current === 'Yes' ? 'No' : 'Yes';
    setField(key, nextVal as PredictionPayload[typeof key]);
  };

  return (
    <div className="space-y-6">
      {/* 1. ARCHETYPE PRESET SELECTOR */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
              1
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Select Customer Archetype
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
            Quick-load production benchmark personas
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(PRESETS).map(([key, preset]) => {
            const isSelected = activePreset === key;
            const badgeColorMap = {
              rose: 'bg-rose-50 text-rose-700 border-rose-200',
              amber: 'bg-amber-50 text-amber-700 border-amber-200',
              emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            };

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPreset(key)}
                disabled={disabled}
                className={`relative group rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-linear-to-br from-indigo-50/90 via-white to-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      badgeColorMap[preset.riskColor]
                    }`}
                  >
                    {preset.riskColor === 'rose' && <AlertTriangle className="h-2.5 w-2.5" />}
                    {preset.riskColor === 'emerald' && <Check className="h-2.5 w-2.5" />}
                    {preset.riskTag}
                  </span>
                  {isSelected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                      ✓
                    </span>
                  )}
                </div>

                <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {preset.label}
                </p>

                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {preset.description}
                </p>

                <div className="mt-2.5 pt-2 border-t border-slate-100/80 text-[10px] text-slate-400 italic">
                  💡 {preset.highlight}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ACCOUNT & CORE FINANCIAL SERVICES */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Account &amp; Financial Contract
              </h4>
              <p className="text-[11px] text-slate-400">
                Tenure, billing commitment, and connection infrastructure
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            Primary Churn Drivers
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Tenure */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
              <span>Tenure (Months)</span>
              <span className="font-mono text-indigo-600 font-bold">{formData.tenure} mo</span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={formData.tenure}
                disabled={disabled}
                onChange={(e) => setField('tenure', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
            </div>
            <p className="text-[10px] text-slate-400">Months customer has stayed with service</p>
          </div>

          {/* Monthly Charges */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
              <span>Monthly Charges ($)</span>
              <span className="font-mono text-slate-600">${Number(formData.MonthlyCharges).toFixed(2)}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.5"
                value={formData.MonthlyCharges}
                disabled={disabled}
                onChange={(e) => setField('MonthlyCharges', parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
            </div>
            <p className="text-[10px] text-slate-400">Recurring monthly subscription fee</p>
          </div>

          {/* Total Charges */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
              <span>Total Charges ($)</span>
              <span className="font-mono text-slate-600">${Number(formData.TotalCharges).toFixed(2)}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={formData.TotalCharges}
                disabled={disabled}
                onChange={(e) => setField('TotalCharges', parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
            </div>
            <p className="text-[10px] text-slate-400">Cumulative historical spend (LTV)</p>
          </div>

          {/* Contract Type */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Contract Type</span>
              {formData.Contract === 'Month-to-month' && (
                <span className="text-[10px] text-rose-600 font-bold">High Risk</span>
              )}
            </div>
            <select
              value={formData.Contract}
              disabled={disabled}
              onChange={(e) => setField('Contract', e.target.value as PredictionPayload['Contract'])}
              className={`w-full rounded-lg border p-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 ${
                formData.Contract === 'Month-to-month'
                  ? 'border-amber-300 bg-amber-50/40 text-slate-800'
                  : 'border-slate-200 bg-slate-50/70 text-slate-800 focus:border-indigo-500 focus:bg-white'
              }`}
            >
              <option value="Month-to-month">Month-to-month (No lock-in)</option>
              <option value="One year">One year (Moderate lock-in)</option>
              <option value="Two year">Two year (High retention lock-in)</option>
            </select>
          </div>

          {/* Internet Service */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              Internet Service
            </label>
            <select
              value={formData.InternetService}
              disabled={disabled}
              onChange={(e) => handleInternetServiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            >
              <option value="Fiber optic">Fiber optic (High speed / High churn)</option>
              <option value="DSL">DSL (Stable copper)</option>
              <option value="No">No Internet Service</option>
            </select>
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Method
            </label>
            <select
              value={formData.PaymentMethod}
              disabled={disabled}
              onChange={(e) => setField('PaymentMethod', e.target.value as PredictionPayload['PaymentMethod'])}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            >
              <option value="Electronic check">Electronic check (Highest churn)</option>
              <option value="Mailed check">Mailed check</option>
              <option value="Bank transfer (automatic)">Bank transfer (automatic)</option>
              <option value="Credit card (automatic)">Credit card (automatic)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. SUPPORT & ADD-ON FEATURES (INTERACTIVE TOGGLE TILES) */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Support &amp; Add-on Ecosystem
              </h4>
              <p className="text-[11px] text-slate-400">
                Click cards to toggle protection &amp; entertainment services
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
            <Sparkles className="h-3 w-3" /> Actionable Levers
          </span>
        </div>

        {formData.InternetService === 'No' ? (
          <div className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200">
            Internet add-on features are disabled because <strong>No Internet Service</strong> is selected.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ADDON_CONFIG.map(({ key, label, desc, impact, icon: Icon }) => {
              const isEnabled = formData[key] === 'Yes';
              const isHighImpact = impact === 'High Retention Impact';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAddon(key)}
                  disabled={disabled}
                  className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                    isEnabled
                      ? 'border-indigo-600 bg-linear-to-br from-indigo-50/80 to-white shadow-xs ring-1 ring-indigo-500/30'
                      : 'border-slate-200/90 bg-slate-50/40 hover:border-indigo-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        isEnabled
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500 group-hover:text-indigo-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isHighImpact && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Key
                        </span>
                      )}
                      <span
                        className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isEnabled
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-800">{label}</p>
                      <span
                        className={`text-[10px] font-bold ${
                          isEnabled ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      >
                        {isEnabled ? 'ACTIVE' : 'NONE'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. HOUSEHOLD & DEMOGRAPHICS (COLLAPSIBLE WITH PROGRESSIVE DISCLOSURE) */}
      <details className="group rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all">
        <summary className="flex cursor-pointer items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 select-none">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Users className="h-3.5 w-3.5" />
            </div>
            <div>
              <span>Household &amp; Demographics</span>
              <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">
                (Life-stage stickiness &amp; communication channel)
              </span>
            </div>
          </div>
          <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200">
            &#9662;
          </span>
        </summary>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 pt-4">
          {/* Senior Citizen */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Senior Citizen</label>
            <select
              value={formData.SeniorCitizen}
              disabled={disabled}
              onChange={(e) =>
                setField('SeniorCitizen', parseInt(e.target.value) as PredictionPayload['SeniorCitizen'])
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value={0}>No (Under 65)</option>
              <option value={1}>Yes (65+)</option>
            </select>
          </div>

          {/* Gender */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Gender</label>
            <select
              value={formData.gender}
              disabled={disabled}
              onChange={(e) => setField('gender', e.target.value as PredictionPayload['gender'])}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>

          {/* Partner */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Partner</label>
            <select
              value={formData.Partner}
              disabled={disabled}
              onChange={(e) => setField('Partner', e.target.value as PredictionPayload['Partner'])}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="No">No Partner</option>
              <option value="Yes">Has Partner</option>
            </select>
          </div>

          {/* Dependents */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Dependents</label>
            <select
              value={formData.Dependents}
              disabled={disabled}
              onChange={(e) => setField('Dependents', e.target.value as PredictionPayload['Dependents'])}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="No">No Dependents</option>
              <option value="Yes">Has Dependents</option>
            </select>
          </div>

          {/* Phone Service */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Phone Service</label>
            <select
              value={formData.PhoneService}
              disabled={disabled}
              onChange={(e) => handlePhoneServiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>

          {/* Multiple Lines */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Multiple Lines</label>
            <select
              value={formData.MultipleLines}
              disabled={disabled}
              onChange={(e) => setField('MultipleLines', e.target.value as PredictionPayload['MultipleLines'])}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              {formData.PhoneService === 'No' ? (
                <option value="No phone service">No phone service</option>
              ) : (
                <>
                  <option value="No">Single Line</option>
                  <option value="Yes">Multiple Lines</option>
                </>
              )}
            </select>
          </div>

          {/* Paperless Billing */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Paperless Billing</label>
            <select
              value={formData.PaperlessBilling}
              disabled={disabled}
              onChange={(e) =>
                setField('PaperlessBilling', e.target.value as PredictionPayload['PaperlessBilling'])
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="Yes">Yes (Digital invoice)</option>
              <option value="No">No (Paper invoice)</option>
            </select>
          </div>
        </div>
      </details>
    </div>
  );
};
