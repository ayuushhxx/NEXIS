import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { ConsentScope } from '../../types';
import { USER_COLOR, USER_COLOR_LIGHT } from '../../theme/brand';

interface ConsentScreenProps {
  onConsentsSaved: (scopes: Record<ConsentScope, boolean>) => Promise<boolean>;
}

interface ScopeDefinition {
  scope: ConsentScope;
  title: string;
  description: string;
  dataAccess: string;
  defaultGranted: boolean;
}

const SCOPES_CONFIG: ScopeDefinition[] = [
  {
    scope: 'JOB_SEARCH_DATA',
    title: 'Job Search & Opportunity Matching',
    description: 'Allows us to process your verified skills, course history, and career goals to surface targeted blue-ocean job openings.',
    dataAccess: 'Visible to: Nexus-Hunter & AI job matching engines',
    defaultGranted: true,
  },
  {
    scope: 'EMPLOYER_SHARING',
    title: 'Employer Profile Sharing',
    description: 'Allows sharing your anonymized candidate summary and verified competencies with hiring partners for placement interviews.',
    dataAccess: 'Visible to: Verified corporate and MSME hiring partners',
    defaultGranted: true,
  },
  {
    scope: 'ANALYTICS',
    title: 'Skill Analytics & Curriculum Feedback',
    description: 'Allows using aggregated, de-identified training metrics to evaluate course efficacy and improve vocational programs.',
    dataAccess: 'Visible to: Vocational program directors & training institutes',
    defaultGranted: true,
  },
  {
    scope: 'GOVT_CROSS_CHECK',
    title: 'Government Registry & Certificate Verification',
    description: 'Allows government authorities to verify your training certification and enrolment credentials against national registries.',
    dataAccess: 'Visible to: Ministry auditing bodies (PMKVY / NCVET / DDU-GKY)',
    defaultGranted: false,
  },
];

export const ConsentScreen: React.FC<ConsentScreenProps> = ({ onConsentsSaved }) => {
  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>(() => {
    const initial: Record<ConsentScope, boolean> = {
      JOB_SEARCH_DATA: true,
      EMPLOYER_SHARING: true,
      ANALYTICS: true,
      GOVT_CROSS_CHECK: false,
    };
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (scope: ConsentScope) => {
    setConsents((prev) => ({
      ...prev,
      [scope]: !prev[scope],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasAnyGranted = Object.values(consents).some((val) => val === true);
    if (!hasAnyGranted) {
      setError('Please grant at least one consent scope to proceed with career services.');
      return;
    }

    setSubmitting(true);
    try {
      const success = await onConsentsSaved(consents);
      if (!success) {
        setError('Failed to record consent preferences. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving consent');
    } finally {
      setSubmitting(false);
    }
  };

  const grantedCount = Object.values(consents).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 pointer-events-auto overflow-hidden">
      {/* Frosted Glass Backdrop */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xl animate-in fade-in duration-500" />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] p-6 md:p-8 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 mb-5 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 mb-2">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                DPDP Act 2023 Aligned
              </span>
            </div>
            <h2 className="text-2xl font-black text-darkDelegation tracking-tight leading-tight">
              Trainee Consent & Data Privacy
            </h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Your trainee record is privacy-first. In compliance with the Digital Personal Data Protection Act,
              grant granular permissions for how your profile, skill certifications, and job search records are utilized.
            </p>
          </div>

          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 hidden sm:flex"
            style={{ backgroundColor: USER_COLOR_LIGHT }}
          >
            <Lock size={22} style={{ color: USER_COLOR }} />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 font-medium flex items-center gap-2 shrink-0">
            <ShieldAlert size={16} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Independent Scopes List (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {SCOPES_CONFIG.map((item) => {
              const isChecked = !!consents[item.scope];
              return (
                <div
                  key={item.scope}
                  onClick={() => handleToggle(item.scope)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'bg-zinc-50/70 border-zinc-300 shadow-xs'
                      : 'bg-white border-zinc-200/80 opacity-75 hover:opacity-100 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-zinc-900 tracking-tight">
                          {item.title}
                        </span>
                        <span className="text-[9px] font-mono font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                          {item.scope}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-relaxed font-normal">
                        {item.description}
                      </p>
                      <div className="mt-2 text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                        <span>{item.dataAccess}</span>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="shrink-0 pt-0.5">
                      <div
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                          isChecked ? 'bg-darkDelegation' : 'bg-zinc-200'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal Footer */}
          <div className="pt-5 mt-3 border-t border-zinc-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
              <CheckCircle2 size={15} className="text-darkDelegation" />
              <span>
                {grantedCount} of {SCOPES_CONFIG.length} scopes granted
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-darkDelegation text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Recording Consent...
                </>
              ) : (
                <>
                  Confirm & Continue
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConsentScreen;
