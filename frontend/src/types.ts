// RetentionAI Decision Intelligence Platform — Types

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

export interface ShapContribution {
  feature: string;
  shap_value: number;
}

export interface PredictionResponse {
  request_id: string;
  model_version: string;
  calibrated_churn_probability: number;
  conformal_prediction_set: number[];
  recommended_arm: string;
  counterfactual_status: string;
  priority_score?: number;
  recommended_action?: string;
  decision_confidence?: 'high' | 'medium' | 'low';
  uncertainty_label?: string;
  human_review_required?: boolean;
  shap_contributions?: ShapContribution[];
  trace_id?: string;
  decision_id?: string;
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

export interface UncertaintyInfo {
  label: 'high_confidence_churn' | 'ambiguous' | 'high_confidence_retain' | 'empty';
  confidence: 'high' | 'medium' | 'low';
  human_review_required: boolean;
}

export interface PriorityBreakdownInfo {
  score: number;
  risk_component: number;
  value_component: number;
  exit_sensitivity_component: number;
  contactability_component: number;
  uncertainty_component: number;
  weights_used: Record<string, number>;
}

export interface CustomerPriorityItem {
  customer_id: string;
  calibrated_probability: number;
  conformal_set: number[];
  uncertainty: UncertaintyInfo;
  customer_value: number;
  exit_sensitivity: number;
  contactability: number;
  priority: PriorityBreakdownInfo;
  recommended_action: string;
  decision_confidence: 'high' | 'medium' | 'low';
  above_economic_threshold: boolean;
}

export interface QueueResponse {
  status: 'ok' | 'queue_not_available';
  total_customers: number;
  queue_generated_at?: string;
  showing: number;
  offset: number;
  risk_bands: {
    '95_plus': number;
    '80_to_95': number;
    '50_to_80': number;
    below_50: number;
  };
  customers: CustomerPriorityItem[];
}

export interface QueueSummary {
  status: string;
  total_customers: number;
  queue_generated_at?: string;
  risk_bands?: {
    '95_plus': number;
    '80_to_95': number;
    '50_to_80': number;
    below_50: number;
  };
  above_threshold?: number;
  human_review_required?: number;
  avg_risk?: number;
  total_value_at_risk?: number;
}

export interface Customer360Data extends CustomerPriorityItem {
  profile?: Record<string, unknown>;
  shap_contributions?: ShapContribution[];
  shap_error?: string;
  audit_records?: AuditRecordData[];
  population_percentile?: number;
  queue_rank?: number;
}

export interface TraceStepData {
  step_name: string;
  timestamp: string;
  duration_ms: number;
  status: string;
  details: Record<string, unknown>;
}

export interface DecisionTraceData {
  trace_id: string;
  customer_id: string;
  started_at: string;
  completed_at?: string;
  total_duration_ms: number;
  model_version?: string;
  final_recommendation?: string;
  calibrated_probability?: number;
  conformal_set?: number[];
  priority_score?: number;
  steps: TraceStepData[];
}

export interface AuditRecordData {
  decision_id: string;
  customer_id: string;
  model_version: string;
  policy_version: string;
  timestamp: string;
  calibrated_probability: number;
  conformal_set: number[];
  raw_probability?: number;
  economic_threshold: number;
  above_threshold: boolean;
  recommended_action: string;
  decision_confidence: string;
  priority_score: number;
  customer_value: number;
  uncertainty_state: string;
  trace_id?: string;
  human_review_status: 'pending' | 'approved' | 'rejected' | 'escalated';
  reviewer?: string;
  review_timestamp?: string;
}

export interface ScenarioRequestData {
  budget: number;
  objective: 'risk_first' | 'value_aware' | 'balanced';
  risk_weight?: number;
  value_weight?: number;
  exit_sensitivity_weight?: number;
  contactability_weight?: number;
  uncertainty_weight?: number;
}

export interface ScenarioResponseData {
  budget: number;
  objective: 'risk_first' | 'value_aware' | 'balanced';
  total_customers: number;
  avg_risk: number;
  total_value: number;
  high_risk_covered: number;
  uncertain_cases: number;
  estimated_revenue_at_risk: number;
  risk_bands: Record<string, number>;
  top_selected: CustomerPriorityItem[];
}

export interface StrategyComparisonData {
  budget: number;
  total_customers: number;
  strategies: Record<
    'risk_first' | 'value_aware' | 'balanced',
    {
      budget: number;
      avg_risk: number;
      total_value: number;
      high_risk_covered: number;
      uncertain_cases: number;
      estimated_revenue_at_risk: number;
    }
  >;
}

export interface ModelRegistryItem {
  version: string;
  created_at: string;
  is_current: boolean;
  training_data: {
    dataset_kind?: string;
    row_count?: number;
    sha256?: string;
  };
  evaluation_summary?: {
    pr_auc?: number;
    precision_at_k?: number;
  };
}

export interface ModelRegistryResponse {
  current_version: string;
  versions: ModelRegistryItem[];
}

export interface ExperimentItem {
  experiment_id: string;
  name: string;
  model_type: string;
  description: string;
  stage: string;
  adr: string;
  metrics: {
    pr_auc: number;
    brier_score?: number | null;
    precision_at_100?: number | null;
    recall_at_100?: number | null;
    conformal_coverage?: number | null;
  };
  calibration?: {
    method: string;
    ece_10_bins: number;
    calibration_set_size: number;
  } | null;
  conformal: boolean;
  status: string;
}

export interface ExperimentsResponse {
  experiments: ExperimentItem[];
  lineage: Record<string, string>;
}

export interface FullModelCard {
  name: string;
  version: string;
  purpose: string;
  intended_use: string;
  not_intended_for: string[];
  training_data: Record<string, unknown>;
  validation: Record<string, unknown>;
  primary_metric: string;
  calibration: Record<string, unknown>;
  uncertainty: Record<string, unknown>;
  known_limitations: string[];
  ethical_considerations: string[];
  current_version?: string;
  live_evaluation?: ModelCardEvaluation;
}

export interface SystemHealthData {
  model: { status: string; version?: string };
  calibration: { status: string };
  drift: { status: string };
  data: { status: string; rows: number };
  queue: { status: string; size: number; generated_at?: string };
  traces: { count: number };
  audit: { count: number };
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

export interface DriftSnapshot {
  id?: number;
  timestamp: string;
  period_label: string;
  model_version?: string;
  reference_version?: string;
  source_type?: string;
  window_start?: string;
  window_end?: string;
  prediction_event_start_id?: number;
  prediction_event_end_id?: number;
  psi: number;
  psi_interpretation: string;
  ks_statistic: number;
  ks_p_value: number;
  ks_drift_detected: boolean;
  n_samples: number;
}

export interface DriftResponse {
  status: 'ok' | 'insufficient_data' | 'benchmark_preview' | 'error';
  n_observations?: number;
  n_recent_predictions?: number;
  minimum_required?: number;
  model_version?: string;
  reference_version?: string;
  window_start?: string;
  window_end?: string;
  prediction_event_start_id?: number;
  prediction_event_end_id?: number;
  psi?: number;
  psi_interpretation?: string;
  ks_statistic?: number;
  ks_p_value?: number;
  ks_drift_detected?: boolean;
  source_type?: string;
  message?: string;
  snapshot?: DriftSnapshot;
}

export interface DriftHistoryResponse {
  total_live_prediction_events: number;
  snapshots_count: number;
  snapshots: DriftSnapshot[];
}

export interface EvaluationSlice {
  slice?: string;
  value?: string;
  n?: number;
  n_examples?: number;
  pr_auc: number;
  brier_score: number;
  empirical_coverage?: number;
  churn_rate?: number;
}

export interface ModelCardEvaluation {
  ranking?: {
    pr_auc?: number;
    pr_auc_95pct_bootstrap_ci?: [number, number] | number[];
    precision_at_k?: number;
    recall_at_k?: number;
    decision_k?: number;
  };
  calibration?: {
    brier_score?: number;
    ece_10_bins?: number;
  };
  conformal?: {
    target_coverage?: number;
    class_conditional_coverage?: Record<string, { n_examples: number; empirical_coverage: number } | number>;
    average_prediction_set_size?: number;
  };
  split_counts?: {
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
