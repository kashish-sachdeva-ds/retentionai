// Remove HighRiskCustomer (demo-only type), add new page/component types

export interface PredictionPayload {
  tenure: number;
  MonthlyCharges: number;
  TotalCharges: number;
  SeniorCitizen: number;
  Contract: string;
  InternetService: string;
  OnlineSecurity: string;
  OnlineBackup: string;
  DeviceProtection: string;
  TechSupport: string;
  StreamingTV: string;
  StreamingMovies: string;
  PaymentMethod: string;
  gender: string;
  Partner: string;
  Dependents: string;
  PhoneService: string;
  MultipleLines: string;
  PaperlessBilling: string;
}

export interface PredictionResponse {
  request_id: string;
  model_version: string;
  calibrated_churn_probability: number;
  conformal_prediction_set: number[];
  recommended_arm: string;
  counterfactual_status: string;
}

export interface CounterfactualResponse {
  status: string;
  raw_changes?: Record<string, unknown> | null;
  flippable?: boolean;
}

export interface ApiHealth {
  status: 'ok';
  model_loaded: boolean;
  model_version: string | null;
}

export interface BanditArm {
  arm: string;
  alpha: number;
  beta: number;
  n_observations: number;
}

export interface BanditPosteriorResponse {
  arms: BanditArm[];
}

export interface DriftResponse {
  status: 'ok' | 'insufficient_data';
  n_recent_predictions: number;
  minimum_required?: number;
  psi?: number;
  psi_interpretation?: string;
  ks_p_value?: number;
  ks_drift_detected?: boolean;
}

export interface EvaluationSlice {
  slice: string;
  n: number;
  pr_auc: number;
  brier_score: number;
  empirical_coverage?: number;
  churn_rate?: number;
}

export interface ModelCardEvaluation {
  ranking?: {
    pr_auc?: number;
    pr_auc_95pct_bootstrap_ci?: [number, number] | number[];
    pr_auc_ci_lower?: number;
    pr_auc_ci_upper?: number;
    precision_at_k?: number;
    recall_at_k?: number;
    decision_k?: number;
    k?: number;
  };
  calibration?: {
    brier_score?: number;
    ece_10_bins?: number;
  };
  conformal?: {
    target_coverage?: number;
    class_conditional_coverage?: Record<string, { n_examples: number; empirical_coverage: number } | number>;
    average_prediction_set_size?: number;
    average_set_size?: number;
  };
  split_counts?: {
    train?: number;
    calibration?: number;
    conformal?: number;
    holdout?: number;
  };
  splits?: {
    train?: number;
    calibration?: number;
    conformal?: number;
    holdout?: number;
  };
  slices?: Record<string, Array<{
    value: string;
    n_examples: number;
    churn_rate: number;
    pr_auc: number;
    brier_score: number;
  }>> | EvaluationSlice[];
  decision_policy?: {
    churn_probability_threshold?: number;
    note?: string;
  };
  limitations?: string[];
}

export interface ModelCardResponse {
  model_version: string;
  evaluation: ModelCardEvaluation;
}

export interface ScoredAssessment {
  response: PredictionResponse;
  payload: PredictionPayload;
  createdAt: Date;
  feedback?: { retained: boolean; recordedAt: Date };
}

