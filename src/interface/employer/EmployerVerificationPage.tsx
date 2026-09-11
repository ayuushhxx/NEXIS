import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  GraduationCap,
  ShieldCheck,
  User,
  Loader2,
  ChevronRight,
  Info,
  Award,
} from 'lucide-react';

interface VerificationData {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'DENIED' | string;
  traineeFirstName: string;
  employerNameClaimed: string;
  contactDomainFlag: boolean;
  employerContactEmail: string;
  tokenExpiresAt: string;
  verifiedByName: string | null;
  verifiedAt: string | null;
  reasonCode: string | null;
  reasonNotes: string | null;
  courseContext: {
    scheme: string;
    courseName: string;
    providerName: string;
  } | null;
  claimedWageBand: string | null;
  claimedRelevance: string | null;
}

const REASON_OPTIONS = [
  { value: 'SKILL_GAP', label: 'Skill Gap — Candidate lacked required technical/soft skills' },
  { value: 'WAGE_MISMATCH', label: 'Wage Mismatch — Compensation expectations could not be met' },
  { value: 'LOCATION', label: 'Location Constraint — Commute or relocation constraints' },
  { value: 'NO_SHOW', label: 'No Show — Candidate accepted or interviewed but did not join' },
  { value: 'ROLE_MISMATCH', label: 'Role Mismatch — Job profile differed from candidate background' },
  { value: 'OTHER', label: 'Other — Reason documented in notes' },
];

export const EmployerVerificationPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form State
  const [decision, setDecision] = useState<'CONFIRMED' | 'DENIED' | null>(null);
  const [verifiedByName, setVerifiedByName] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Verification request not found (${res.status})`);
      }
      const json = await res.json();
      setData(json);
      if (json.status !== 'PENDING') {
        setDecision(json.status);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load verification details');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision) return;

    setSubmitError(null);
    if (decision === 'DENIED' && !reasonCode) {
      setSubmitError('Please select a reason for denying this employment claim.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reasonCode: decision === 'DENIED' ? reasonCode : null,
          reasonNotes: reasonNotes.trim() || null,
          verifiedByName: verifiedByName.trim() || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit verification decision');
      }

      setSubmitSuccess(
        decision === 'CONFIRMED'
          ? 'Employment claim successfully verified and confirmed!'
          : 'Employment claim denial has been recorded.'
      );
      // Refresh to lock the state
      await fetchDetails();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100 flex flex-col font-sans text-zinc-900 overflow-y-auto">
      {/* Top Header / Portal Brand */}
      <header className="w-full bg-white border-b border-zinc-200 shadow-xs px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-black text-sm shadow-xs">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
                National Outcome Verification
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Secure Channel
              </span>
            </div>
            <h1 className="text-base font-black text-zinc-900 leading-tight">
              Employer Confirmation Portal
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            ← Return to App
          </a>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="hidden sm:inline">DPDP Compliant Verification</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-8 flex flex-col justify-center">
        {loading && (
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-md p-12 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-zinc-900" />
            <p className="text-sm font-bold text-zinc-600">Loading verification details...</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="bg-white rounded-3xl border border-red-200 shadow-md p-8 md:p-10 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-black text-zinc-900 mb-2">Verification Link Unavailable</h2>
            <p className="text-sm text-zinc-600 max-w-md mx-auto mb-4 leading-relaxed">
              {loadError}
            </p>
            <div className="text-xs text-zinc-400 font-mono bg-zinc-50 py-2 px-4 rounded-xl inline-block border border-zinc-200 mb-6">
              Token ID: {token.slice(0, 16)}...
            </div>
            <div>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                ← Return to Forge Main App
              </a>
            </div>
          </div>
        )}

        {data && !loading && (
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xl overflow-hidden animate-in fade-in duration-300">
            {/* Domain Legitimacy Signal Notice */}
            {data.contactDomainFlag && (
              <div className="bg-amber-50 border-b border-amber-200/80 px-6 py-3.5 flex items-start gap-3 text-amber-900 text-xs">
                <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">Informal/Personal Domain Notice:</span> This request was sent to a consumer email domain (<code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">{data.employerContactEmail}</code>). While common for MSMEs and private employers, please confirm your official affiliation and name when submitting your response.
                </div>
              </div>
            )}

            {/* Content Body */}
            <div className="p-6 md:p-8 space-y-6">
              {/* Claim Title */}
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                  Employment Claim Confirmation
                </span>
                <h2 className="text-2xl font-black text-zinc-900 mt-1">
                  Did <span className="text-blue-600">{data.traineeFirstName}</span> work at <span className="text-zinc-900 underline decoration-zinc-300">{data.employerNameClaimed}</span>?
                </h2>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  A vocational training graduate has self-reported employment with your organization. Please verify the accuracy of this record to maintain genuine national placement analytics.
                </p>
              </div>

              {/* Trainee & Program Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Candidate & Employer Box */}
                <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Candidate & Employer
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-zinc-500" />
                    <span className="text-sm font-bold text-zinc-800">
                      {data.traineeFirstName} (First Name Protected)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-zinc-500" />
                    <span className="text-sm font-bold text-zinc-800">
                      {data.employerNameClaimed}
                    </span>
                  </div>
                  {data.claimedWageBand && (
                    <div className="text-xs text-zinc-600 pt-1 border-t border-zinc-200/60 flex items-center justify-between">
                      <span className="text-zinc-400">Reported Wage Band:</span>
                      <span className="font-semibold font-mono">₹{data.claimedWageBand}/mo</span>
                    </div>
                  )}
                </div>

                {/* Training Context Box */}
                <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Vocational Background
                  </div>
                  {data.courseContext ? (
                    <>
                      <div className="flex items-center gap-2">
                        <GraduationCap size={15} className="text-zinc-500" />
                        <span className="text-sm font-bold text-zinc-800 truncate" title={data.courseContext.courseName}>
                          {data.courseContext.courseName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award size={15} className="text-zinc-500" />
                        <span className="text-xs font-semibold text-zinc-700">
                          {data.courseContext.scheme} • {data.courseContext.providerName}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-zinc-500 italic">No formal course context recorded</div>
                  )}
                  {data.claimedRelevance && (
                    <div className="text-xs text-zinc-600 pt-1 border-t border-zinc-200/60 flex items-center justify-between">
                      <span className="text-zinc-400">Claimed Relevance:</span>
                      <span className="font-semibold">{data.claimedRelevance.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Already Resolved Banner */}
              {data.status !== 'PENDING' && (
                <div
                  className={`rounded-2xl p-5 border flex items-start gap-4 ${
                    data.status === 'CONFIRMED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {data.status === 'CONFIRMED' ? (
                    <CheckCircle size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={24} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <h3 className="text-sm font-black uppercase tracking-wide">
                      Verification Status: {data.status}
                    </h3>
                    <p className="text-xs leading-relaxed">
                      This claim was resolved on{' '}
                      {data.verifiedAt
                        ? new Date(data.verifiedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : 'record'}
                      {data.verifiedByName ? ` by ${data.verifiedByName}` : ''}.
                    </p>
                    {data.reasonCode && (
                      <div className="mt-2 text-xs bg-white/80 p-2.5 rounded-xl border border-rose-200/60 font-medium">
                        <span className="font-bold">Denial Reason:</span> {data.reasonCode.replace(/_/g, ' ')}
                        {data.reasonNotes && <div className="mt-1 text-zinc-600 italic">"{data.reasonNotes}"</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Form for PENDING verifications */}
              {data.status === 'PENDING' && (
                <form onSubmit={handleSubmit} className="space-y-5 pt-2 border-t border-zinc-100">
                  {submitSuccess && (
                    <div className="p-4 bg-emerald-50 text-emerald-800 text-xs rounded-2xl border border-emerald-200 font-bold flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                      <span>{submitSuccess}</span>
                    </div>
                  )}

                  {submitError && (
                    <div className="p-4 bg-rose-50 text-rose-800 text-xs rounded-2xl border border-rose-200 font-bold flex items-center gap-2">
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Verifier Identity Input */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                      Your Name & Designation (HR / Manager / Supervisor) *
                    </label>
                    <input
                      type="text"
                      required
                      value={verifiedByName}
                      onChange={(e) => setVerifiedByName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar, HR Operations"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  {/* Decision Selector */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-2">
                      Verification Decision *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDecision('CONFIRMED');
                          setSubmitError(null);
                        }}
                        className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border text-xs font-black tracking-wide transition-all cursor-pointer ${
                          decision === 'CONFIRMED'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.01]'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-emerald-50/50 hover:border-emerald-300'
                        }`}
                      >
                        <CheckCircle size={16} />
                        <span>Confirm Employment</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDecision('DENIED');
                          setSubmitError(null);
                        }}
                        className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border text-xs font-black tracking-wide transition-all cursor-pointer ${
                          decision === 'DENIED'
                            ? 'bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/20 scale-[1.01]'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-rose-50/50 hover:border-rose-300'
                        }`}
                      >
                        <XCircle size={16} />
                        <span>Deny Claim</span>
                      </button>
                    </div>
                  </div>

                  {/* Conditional Denial Reason Dropdown */}
                  {decision === 'DENIED' && (
                    <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-xs font-bold text-rose-900 mb-1">
                          Reason for Denial *
                        </label>
                        <select
                          required
                          value={reasonCode}
                          onChange={(e) => setReasonCode(e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                        >
                          <option value="">-- Select primary reason for non-placement / denial --</option>
                          {REASON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-rose-900 mb-1">
                          Additional Notes / Specific Reason (Optional)
                        </label>
                        <textarea
                          rows={2}
                          value={reasonNotes}
                          onChange={(e) => setReasonNotes(e.target.value)}
                          placeholder="e.g. Candidate withdrew application, or candidate was offered role in a different city."
                          className="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 resize-y"
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={!decision || submitting || !verifiedByName.trim()}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer active:scale-95"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Submitting Decision...
                        </>
                      ) : (
                        <>
                          <span>Submit Verification Response</span>
                          <ChevronRight size={15} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Expiry / Footer Details */}
              <div className="flex items-center justify-between pt-4 border-t border-zinc-100 text-[11px] text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} />
                  <span>
                    Valid until{' '}
                    {new Date(data.tokenExpiresAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div>Request ID: {data.id.slice(-8)}</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-zinc-400 border-t border-zinc-200 bg-white">
        Forge Outcome Verification System • Direct Employer Attestation Service
      </footer>
    </div>
  );
};

export default EmployerVerificationPage;
