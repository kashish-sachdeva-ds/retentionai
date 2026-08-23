// Design tokens and helpers for RetentionAI Decision Intelligence Platform

export const COLORS = {
  risk: {
    critical: '#e11d48', // rose-600
    high: '#ea580c',     // orange-600
    moderate: '#d97706', // amber-600
    low: '#059669',      // emerald-600
  },
  status: {
    healthy: '#10b981',  // emerald-500
    warning: '#f59e0b',  // amber-500
    critical: '#ef4444', // red-500
    neutral: '#64748b',  // slate-500
  },
  accent: {
    primary: '#4f46e5',  // indigo-600
    secondary: '#0284c7',// sky-600
  },
};

export function getRiskColor(prob: number): { bg: string; text: string; border: string; label: string } {
  if (prob >= 0.80) {
    return {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      label: 'Critical Risk',
    };
  }
  if (prob >= 0.50) {
    return {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      label: 'Elevated Risk',
    };
  }
  if (prob >= 0.0833) {
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      label: 'Above Economic Threshold',
    };
  }
  return {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Low Churn Risk',
  };
}

export function getUncertaintyBadge(label: string): { bg: string; text: string; border: string; description: string } {
  switch (label) {
    case 'high_confidence_churn':
      return {
        bg: 'bg-rose-100',
        text: 'text-rose-800',
        border: 'border-rose-300',
        description: 'Mondrian set {1} · Conformal guarantee holds',
      };
    case 'high_confidence_retain':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        description: 'Mondrian set {0} · Conformal guarantee holds',
      };
    case 'ambiguous':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border-amber-300',
        description: 'Mondrian set {0, 1} · Model Refusal / Human Review Required',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-800',
        border: 'border-slate-300',
        description: 'Set empty / Review needed',
      };
  }
}
