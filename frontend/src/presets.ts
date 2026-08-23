import type { PredictionPayload } from './types';

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
    riskTag: 'High Risk ~95%',
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
    label: 'Borderline Mid-Tenure',
    riskTag: 'Moderate Risk ~23%',
    riskColor: 'amber',
    description: '18 mo tenure, month-to-month, DSL, Tech Support & Online Security attached.',
    highlight: 'Ambiguous 95% conformal set [0, 1]; requires human review before intervention.',
    data: {
      tenure: 18,
      MonthlyCharges: 72.0,
      TotalCharges: 1296.0,
      SeniorCitizen: 0,
      Contract: 'Month-to-month',
      InternetService: 'DSL',
      OnlineSecurity: 'Yes',
      OnlineBackup: 'No',
      DeviceProtection: 'No',
      TechSupport: 'Yes',
      StreamingTV: 'No',
      StreamingMovies: 'No',
      PaymentMethod: 'Electronic check',
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
    riskTag: 'Low Risk ~1%',
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
