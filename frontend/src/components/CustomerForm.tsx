import React from 'react';
import type { PredictionPayload } from '../types';

export const PRESETS: Record<string, { label: string; description: string; data: PredictionPayload }> = {
  atRisk: {
    label: 'At-risk new customer',
    description: '2 mo tenure, month-to-month, fiber optic, no tech support or security add-ons.',
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
    label: 'Borderline mid-contract',
    description: '18 mo tenure, one-year contract, fiber optic, partial security add-ons.',
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
    label: 'Loyal long-tenure',
    description: '68 mo tenure, two-year contract, DSL, complete security ecosystem.',
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

const internetAddons = [
  'OnlineSecurity',
  'OnlineBackup',
  'DeviceProtection',
  'TechSupport',
  'StreamingTV',
  'StreamingMovies',
] as const;

interface CustomerFormProps {
  formData: PredictionPayload;
  onChange: (data: PredictionPayload) => void;
  onSelectPreset: (presetKey: string) => void;
  activePreset: string | null;
  disabled?: boolean;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string | number;
  options: Array<string | number>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
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
    internetAddons.forEach((field) => {
      next[field] = noInternet
        ? 'No internet service'
        : formData[field] === 'No internet service'
        ? 'No'
        : formData[field];
    });
    onChange(next);
  };

  const handlePhoneServiceChange = (value: string) => {
    const next = {
      ...formData,
      PhoneService: value,
      MultipleLines: value === 'No' ? 'No phone service' : formData.MultipleLines === 'No phone service' ? 'No' : formData.MultipleLines,
    };
    onChange(next);
  };

  const addonOptions = formData.InternetService === 'No' ? ['No internet service'] : ['No', 'Yes'];

  return (
    <div className="space-y-6">
      {/* Preset Archetypes */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Select Customer Archetype
        </p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {Object.entries(PRESETS).map(([key, preset]) => {
            const isSelected = activePreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPreset(key)}
                disabled={disabled}
                className={`rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {preset.label}
                  </p>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-tight text-slate-500 line-clamp-2">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Core Attributes */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
          Account &amp; Core Services
        </h4>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-semibold text-slate-700">
            Tenure (months)
            <input
              type="number"
              min="0"
              max="100"
              value={formData.tenure}
              disabled={disabled}
              onChange={(e) => setField('tenure', Math.max(0, parseInt(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            Monthly Charges ($)
            <input
              type="number"
              min="0"
              step="0.1"
              value={formData.MonthlyCharges}
              disabled={disabled}
              onChange={(e) => setField('MonthlyCharges', parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            Total Charges ($)
            <input
              type="number"
              min="0"
              step="0.1"
              value={formData.TotalCharges}
              disabled={disabled}
              onChange={(e) => setField('TotalCharges', parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
          </label>

          <SelectField
            label="Contract Type"
            value={formData.Contract}
            options={['Month-to-month', 'One year', 'Two year']}
            disabled={disabled}
            onChange={(v) => setField('Contract', v as PredictionPayload['Contract'])}
          />

          <SelectField
            label="Internet Service"
            value={formData.InternetService}
            options={['Fiber optic', 'DSL', 'No']}
            disabled={disabled}
            onChange={handleInternetServiceChange}
          />

          <SelectField
            label="Payment Method"
            value={formData.PaymentMethod}
            options={[
              'Electronic check',
              'Mailed check',
              'Bank transfer (automatic)',
              'Credit card (automatic)',
            ]}
            disabled={disabled}
            onChange={(v) => setField('PaymentMethod', v as PredictionPayload['PaymentMethod'])}
          />
        </div>
      </div>

      {/* Support & Add-on Services */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
          Support &amp; Add-on Features
        </h4>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Tech Support"
            value={formData.TechSupport}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('TechSupport', v as PredictionPayload['TechSupport'])}
          />
          <SelectField
            label="Online Security"
            value={formData.OnlineSecurity}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('OnlineSecurity', v as PredictionPayload['OnlineSecurity'])}
          />
          <SelectField
            label="Online Backup"
            value={formData.OnlineBackup}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('OnlineBackup', v as PredictionPayload['OnlineBackup'])}
          />
          <SelectField
            label="Device Protection"
            value={formData.DeviceProtection}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('DeviceProtection', v as PredictionPayload['DeviceProtection'])}
          />
          <SelectField
            label="Streaming TV"
            value={formData.StreamingTV}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('StreamingTV', v as PredictionPayload['StreamingTV'])}
          />
          <SelectField
            label="Streaming Movies"
            value={formData.StreamingMovies}
            options={addonOptions}
            disabled={disabled}
            onChange={(v) => setField('StreamingMovies', v as PredictionPayload['StreamingMovies'])}
          />
        </div>
      </div>

      {/* Demographics & Secondary Options (Collapsible for progressive disclosure) */}
      <details className="group rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <summary className="flex cursor-pointer items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
          <span>Household &amp; Demographics</span>
          <span className="text-slate-400 group-open:rotate-180 transition-transform">&#9662;</span>
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 pt-4">
          <SelectField
            label="Senior Citizen"
            value={formData.SeniorCitizen}
            options={[0, 1]}
            disabled={disabled}
            onChange={(v) => setField('SeniorCitizen', parseInt(v) as PredictionPayload['SeniorCitizen'])}
          />
          <SelectField
            label="Gender"
            value={formData.gender}
            options={['Female', 'Male']}
            disabled={disabled}
            onChange={(v) => setField('gender', v as PredictionPayload['gender'])}
          />
          <SelectField
            label="Partner"
            value={formData.Partner}
            options={['No', 'Yes']}
            disabled={disabled}
            onChange={(v) => setField('Partner', v as PredictionPayload['Partner'])}
          />
          <SelectField
            label="Dependents"
            value={formData.Dependents}
            options={['No', 'Yes']}
            disabled={disabled}
            onChange={(v) => setField('Dependents', v as PredictionPayload['Dependents'])}
          />
          <SelectField
            label="Phone Service"
            value={formData.PhoneService}
            options={['Yes', 'No']}
            disabled={disabled}
            onChange={handlePhoneServiceChange}
          />
          <SelectField
            label="Multiple Lines"
            value={formData.MultipleLines}
            options={formData.PhoneService === 'No' ? ['No phone service'] : ['No', 'Yes']}
            disabled={disabled}
            onChange={(v) => setField('MultipleLines', v as PredictionPayload['MultipleLines'])}
          />
          <SelectField
            label="Paperless Billing"
            value={formData.PaperlessBilling}
            options={['No', 'Yes']}
            disabled={disabled}
            onChange={(v) => setField('PaperlessBilling', v as PredictionPayload['PaperlessBilling'])}
          />
        </div>
      </details>
    </div>
  );
};
