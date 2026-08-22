import React, { useState, useMemo } from 'react';
import { Search, User, History, Clock } from 'lucide-react';
import type { PredictionPayload, ScoredAssessment } from '../types';
import { PRESETS } from './CustomerForm';

export interface CustomerProfile {
  id: string;
  name: string;
  category: 'preset' | 'session';
  riskTier: 'critical' | 'moderate' | 'low';
  riskScore?: number;
  contract: string;
  tenure: number;
  data: PredictionPayload;
  timestamp?: Date;
}

interface CustomerSidebarProps {
  selectedId: string;
  onSelectCustomer: (profile: CustomerProfile) => void;
  assessments: ScoredAssessment[];
}

export const PRESET_PROFILES: CustomerProfile[] = [
  {
    id: 'atRisk',
    name: 'Sarah Connor (New & At-Risk)',
    category: 'preset',
    riskTier: 'critical',
    riskScore: 0.95,
    contract: 'Month-to-month',
    tenure: 2,
    data: PRESETS.atRisk.data,
  },
  {
    id: 'borderline',
    name: 'Marcus Brody (Borderline Mid-Tenure)',
    category: 'preset',
    riskTier: 'moderate',
    riskScore: 0.42,
    contract: 'Month-to-month',
    tenure: 14,
    data: PRESETS.borderline.data,
  },
  {
    id: 'loyal',
    name: 'Elena Rostova (Loyal Multi-Service)',
    category: 'preset',
    riskTier: 'low',
    riskScore: 0.03,
    contract: 'Two year',
    tenure: 58,
    data: PRESETS.loyal.data,
  },
];

export const CustomerSidebar: React.FC<CustomerSidebarProps> = ({
  selectedId,
  onSelectCustomer,
  assessments,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'critical' | 'moderate' | 'low'>('all');

  // Convert session assessments to customer profiles
  const sessionProfiles: CustomerProfile[] = useMemo(() => {
    return assessments.map((assessment) => {
      const prob = assessment.response.calibrated_churn_probability;
      const tier: 'critical' | 'moderate' | 'low' =
        prob >= 0.6 ? 'critical' : prob >= 0.2 ? 'moderate' : 'low';
      
      const maskedId = `CUST-${assessment.response.request_id.slice(0, 6).toUpperCase()}`;
      return {
        id: assessment.response.request_id,
        name: `${maskedId} (${assessment.payload.Contract})`,
        category: 'session',
        riskTier: tier,
        riskScore: prob,
        contract: assessment.payload.Contract,
        tenure: assessment.payload.tenure,
        data: assessment.payload,
        timestamp: assessment.createdAt,
      };
    });
  }, [assessments]);

  const allProfiles = useMemo(() => {
    return [...PRESET_PROFILES, ...sessionProfiles];
  }, [sessionProfiles]);

  const filteredProfiles = useMemo(() => {
    return allProfiles.filter((profile) => {
      const matchesSearch =
        profile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        profile.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        profile.contract.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTier = filterTier === 'all' || profile.riskTier === filterTier;
      return matchesSearch && matchesTier;
    });
  }, [allProfiles, searchTerm, filterTier]);

  return (
    <aside className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col shadow-xs h-[calc(100vh-140px)] sticky top-4">
      {/* Header */}
      <div className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Customer Navigator
            </h2>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
            {filteredProfiles.length} Profiles
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Select a customer to explain churn risk drivers
        </p>

        {/* Search Bar */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, ID, contract..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-medium"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 mt-2.5">
          <button
            onClick={() => setFilterTier('all')}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all ${
              filterTier === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterTier('critical')}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
              filterTier === 'critical'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
            Critical
          </button>
          <button
            onClick={() => setFilterTier('moderate')}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
              filterTier === 'moderate'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Mid
          </button>
          <button
            onClick={() => setFilterTier('low')}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
              filterTier === 'low'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Safe
          </button>
        </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 overflow-y-auto pt-2 space-y-1.5 pr-0.5 custom-scrollbar">
        {filteredProfiles.length === 0 ? (
          <div className="text-center py-8 px-2">
            <p className="text-xs text-slate-400 font-medium">No matching customers found</p>
          </div>
        ) : (
          filteredProfiles.map((profile) => {
            const isSelected = selectedId === profile.id;
            const isCritical = profile.riskTier === 'critical';
            const isModerate = profile.riskTier === 'moderate';

            return (
              <button
                key={profile.id}
                onClick={() => onSelectCustomer(profile)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all relative group ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-400/60 shadow-xs ring-1 ring-indigo-400/30'
                    : 'bg-white hover:bg-slate-50 border-slate-150 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isCritical ? (
                        <span className="flex h-2 w-2 relative shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                        </span>
                      ) : isModerate ? (
                        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      <p
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-indigo-950' : 'text-slate-800 group-hover:text-slate-900'
                        }`}
                      >
                        {profile.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-medium">
                      <span>{profile.tenure} mo tenure</span>
                      <span>•</span>
                      <span className="truncate">{profile.contract}</span>
                    </div>
                  </div>

                  {/* Risk Badge */}
                  {profile.riskScore !== undefined && (
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[11px] font-black px-1.5 py-0.5 rounded-md ${
                          isCritical
                            ? 'bg-rose-100 text-rose-800'
                            : isModerate
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {(profile.riskScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>

                {profile.category === 'session' && profile.timestamp && (
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-400 border-t border-slate-100/80 pt-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Scored {new Date(profile.timestamp).toLocaleTimeString()}</span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-2 border-t border-slate-100 mt-2 text-[10px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <History className="w-3 h-3 text-slate-400" /> Live Audit Trail
        </span>
        <span className="font-semibold text-slate-500">Mondrian Calibrated</span>
      </div>
    </aside>
  );
};
