import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  Building,
  DollarSign,
  FileText,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  AlertCircle,
  Calendar,
  ShieldCheck,
  Mail,
  AlertTriangle,
  HelpCircle,
  Compass,
  XCircle,
  ChevronRight,
  ExternalLink,
  Landmark,
  MapPin,
} from 'lucide-react';
import { useCoreStore } from '../integration/store/coreStore';
import { OutcomeCheckInRecord, GovtCrossCheckRecord } from '../types';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';

const GITHUB_TOKEN_KEY = 'forge-github-token';
const DEV_DEFAULT_TOKEN = 'dev_trainee';

function formatCheckinType(type: string): string {
  switch (type) {
    case 'SELF_INITIATED':
      return 'Self-Initiated Report';
    case '90_DAY':
      return '90-Day Milestone Check-in';
    case '180_DAY':
      return '180-Day Milestone Check-in';
    case '365_DAY':
      return '365-Day Annual Check-in';
    default:
      return type.replace(/_/g, ' ');
  }
}

function formatEmploymentStatus(status: string | null): string {
  switch (status) {
    case 'EMPLOYED':
      return 'Employed';
    case 'SELF_EMPLOYED':
      return 'Self-Employed / Freelancer';
    case 'SEARCHING':
      return 'Actively Searching';
    case 'IN_TRAINING':
      return 'In Training / Education';
    case 'OTHER':
      return 'Other';
    default:
      return status || 'Unknown';
  }
}

function getStatusBadgeStyle(status: string | null): { bg: string; text: string; border: string } {
  switch (status) {
    case 'EMPLOYED':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'SELF_EMPLOYED':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'SEARCHING':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'IN_TRAINING':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    default:
      return { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200' };
  }
}

function formatRelevanceLabel(relevance: string | null | undefined): string {
  switch (relevance) {
    case 'DIRECTLY_RELATED':
      return 'Directly Related to Training';
    case 'SOMEWHAT_RELATED':
      return 'Somewhat Related to Training';
    case 'UNRELATED':
      return 'Unrelated to Training';
    default:
      return relevance?.replace(/_/g, ' ') || '';
  }
}

function formatNonPlacementReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'SKILL_GAP':
      return 'Skill Gap / Needs Further Training';
    case 'WAGE_EXPECTATION':
      return 'Wage Expectations Not Met';
    case 'LOCATION':
      return 'Location / Commute Constraints';
    case 'NO_RESPONSE_FROM_EMPLOYERS':
      return 'Awaiting Employer Responses';
    case 'OTHER':
      return 'Other Factors';
    default:
      return reason?.replace(/_/g, ' ') || '';
  }
}

export const OutcomeStatusView: React.FC = () => {
  const { traineeProfile, outcomeHistory, setOutcomeHistory } = useCoreStore();

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [employmentStatus, setEmploymentStatus] = useState<string>('EMPLOYED');
  const [employerName, setEmployerName] = useState<string>('');
  const [wageBand, setWageBand] = useState<string>('10-20k');
  const [notes, setNotes] = useState<string>('');

  // Outcome Enrichment Form State
  const [roleRelevance, setRoleRelevance] = useState<string>('DIRECTLY_RELATED');
  const [selfEmploymentType, setSelfEmploymentType] = useState<string>('');
  const [apprenticeshipEmployer, setApprenticeshipEmployer] = useState<string>('');
  const [nonPlacementReason, setNonPlacementReason] = useState<string>('SKILL_GAP');
  const [placementDistrict, setPlacementDistrict] = useState<string>('');

  // Verification Request UI State
  const [requestingVerificationId, setRequestingVerificationId] = useState<string | null>(null);
  const [employerEmailInput, setEmployerEmailInput] = useState<{ [key: string]: string }>({});
  const [verifyingSubmitting, setVerifyingSubmitting] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<{
    id: string;
    type: 'success' | 'error' | 'consent_warning';
    message: string;
    link?: string;
  } | null>(null);

  const [govtChecks, setGovtChecks] = useState<GovtCrossCheckRecord[]>([]);

  const getActiveToken = useCallback((): string => {
    try {
      const stored = localStorage.getItem(GITHUB_TOKEN_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    return DEV_DEFAULT_TOKEN;
  }, []);

  // Fetch govt registry cross-check history
  const fetchGovtChecks = useCallback(async () => {
    const traineeId = traineeProfile?.trainee?.id;
    if (!traineeId) return;

    try {
      const res = await fetch(`/api/trainee/govt-crosscheck-history/${traineeId}`);
      if (res.ok) {
        const data = await res.json();
        setGovtChecks(data.history || []);
      }
    } catch (err) {
      console.warn('[OutcomeStatusView] Error fetching govt checks:', err);
    }
  }, [traineeProfile?.trainee?.id]);

  // Fetch status history
  const fetchHistory = useCallback(async () => {
    const traineeId = traineeProfile?.trainee?.id;
    if (!traineeId) return;

    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/trainee/status-history/${traineeId}`);
      if (!res.ok) {
        throw new Error('Failed to load outcome history');
      }
      const data = await res.json();
      setOutcomeHistory(data.history || []);
    } catch (err) {
      console.warn('[OutcomeStatusView] Error fetching history:', err);
    } finally {
      setLoadingHistory(false);
    }

    void fetchGovtChecks();
  }, [traineeProfile?.trainee?.id, setOutcomeHistory, fetchGovtChecks]);

  useEffect(() => {
    fetchHistory();
    fetchGovtChecks();
  }, [fetchHistory, fetchGovtChecks]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    const token = getActiveToken();

    try {
      const payload: Record<string, any> = {
        employmentStatus,
        employerName: employmentStatus === 'EMPLOYED' ? employerName.trim() : null,
        wageBand: wageBand || null,
        notes: notes.trim() || null,
        roleRelevance:
          employmentStatus === 'EMPLOYED' || employmentStatus === 'SELF_EMPLOYED'
            ? roleRelevance
            : null,
        selfEmploymentType:
          employmentStatus === 'SELF_EMPLOYED' && selfEmploymentType.trim()
            ? selfEmploymentType.trim()
            : null,
        apprenticeshipEmployer:
          employmentStatus === 'EMPLOYED' && apprenticeshipEmployer.trim()
            ? apprenticeshipEmployer.trim()
            : null,
        nonPlacementReason: employmentStatus === 'SEARCHING' ? nonPlacementReason : null,
        placementDistrict:
          (employmentStatus === 'EMPLOYED' || employmentStatus === 'SELF_EMPLOYED') && placementDistrict.trim()
            ? placementDistrict.trim()
            : null,
      };

      const res = await fetch('/api/trainee/status-update', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Status update failed (${res.status})`);
      }

      setSuccessMessage('Employment status and outcome details successfully self-reported!');
      setNotes('');
      setPlacementDistrict('');
      if (employmentStatus !== 'EMPLOYED') {
        setEmployerName('');
        setApprenticeshipEmployer('');
      }
      if (employmentStatus !== 'SELF_EMPLOYED') {
        setSelfEmploymentType('');
      }

      // Refresh list
      await fetchHistory();

      // Clear success notification after 4s
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit status update');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Request Employer Verification
  const handleRequestVerification = async (checkInId: string) => {
    setVerificationFeedback(null);
    const email = (employerEmailInput[checkInId] || '').trim();

    if (!email || !email.includes('@')) {
      setVerificationFeedback({
        id: checkInId,
        type: 'error',
        message: 'Please enter a valid employer contact email address.',
      });
      return;
    }

    // Consent check check via client state first for fast feedback
    const isConsentGranted = traineeProfile?.consent?.EMPLOYER_SHARING?.granted === true;
    if (!isConsentGranted) {
      setVerificationFeedback({
        id: checkInId,
        type: 'consent_warning',
        message:
          'Employer verification requires your "EMPLOYER_SHARING" consent under DPDP compliance. Please update your consent settings to allow employer data sharing before requesting verification.',
      });
      return;
    }

    setVerifyingSubmitting(true);
    const token = getActiveToken();

    try {
      const res = await fetch('/api/trainee/request-employer-verification', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcomeCheckInId: checkInId,
          employerContact: email,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403 && json.consentRequired) {
          setVerificationFeedback({
            id: checkInId,
            type: 'consent_warning',
            message:
              'Employer verification requires your "EMPLOYER_SHARING" consent. Please enable it in your Consent Settings to proceed.',
          });
          return;
        }
        throw new Error(json.error || 'Failed to request verification');
      }

      setVerificationFeedback({
        id: checkInId,
        type: 'success',
        message: 'Verification request sent to employer successfully! Link has been generated.',
        link: json.verificationLink,
      });

      // Clear open input
      setRequestingVerificationId(null);

      // Refresh history to display newly created EmployerVerification record
      await fetchHistory();
    } catch (err) {
      setVerificationFeedback({
        id: checkInId,
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send verification request',
      });
    } finally {
      setVerifyingSubmitting(false);
    }
  };

  const traineeName = traineeProfile?.trainee?.name || 'Trainee';

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-4 md:p-6 flex flex-col gap-6">
      {/* Top Banner / Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs"
            style={{ backgroundColor: USER_COLOR_LIGHT }}
          >
            <Award size={20} strokeWidth={2.5} style={{ color: USER_COLOR }} />
          </div>
          <div>
            <h1 className="text-lg font-black text-zinc-900 tracking-tight leading-tight">
              My Employment Outcome
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Self-report job status, track training relevance, and request employer verification • {traineeName}
            </p>
          </div>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loadingHistory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-600 rounded-xl text-[11px] font-bold border border-zinc-200 transition-colors shadow-xs cursor-pointer active:scale-95"
          title="Refresh History"
        >
          <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Form Card: Self-Report Status */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100">
          <Send size={15} className="text-darkDelegation" />
          <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
            Self-Report Current Status & Training Relevance
          </h2>
          <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100 ml-auto">
            POST /api/trainee/status-update
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 font-medium flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl border border-emerald-100 font-medium flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Employment Status Dropdown */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Employment Status *
              </label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value)}
                className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
              >
                <option value="EMPLOYED">Employed</option>
                <option value="SELF_EMPLOYED">Self-Employed / Freelancer</option>
                <option value="SEARCHING">Searching for Employment</option>
                <option value="IN_TRAINING">In Training / Further Studies</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Employer Name (Conditional: EMPLOYED) */}
            {employmentStatus === 'EMPLOYED' && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Employer / Company Name *
                </label>
                <div className="relative">
                  <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
                    placeholder="e.g. Infosys, Tata Technologies, Local MSME"
                    required={employmentStatus === 'EMPLOYED'}
                    className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>
              </div>
            )}

            {/* Wage Band Dropdown (EMPLOYED or SELF_EMPLOYED) */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Monthly Wage Band
              </label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <select
                  value={wageBand}
                  onChange={(e) => setWageBand(e.target.value)}
                  className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                >
                  <option value="0-10k">₹0 – ₹10,000 / month</option>
                  <option value="10-20k">₹10,000 – ₹20,000 / month</option>
                  <option value="20k+">₹20,000+ / month</option>
                </select>
              </div>
            </div>

            {/* Role Relevance Dropdown (Conditional: EMPLOYED or SELF_EMPLOYED) */}
            {(employmentStatus === 'EMPLOYED' || employmentStatus === 'SELF_EMPLOYED') && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Relevance to Vocational Training *
                </label>
                <div className="relative">
                  <Compass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <select
                    value={roleRelevance}
                    onChange={(e) => setRoleRelevance(e.target.value)}
                    required
                    className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                  >
                    <option value="DIRECTLY_RELATED">Directly Related (matches my trade)</option>
                    <option value="SOMEWHAT_RELATED">Somewhat Related (uses learned skills)</option>
                    <option value="UNRELATED">Unrelated (general employment)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Self-Employment Type (Conditional: SELF_EMPLOYED) */}
            {employmentStatus === 'SELF_EMPLOYED' && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Business / Self-Employment Type
                </label>
                <input
                  type="text"
                  value={selfEmploymentType}
                  onChange={(e) => setSelfEmploymentType(e.target.value)}
                  placeholder="e.g. Freelance Web Designer, Mobile Repair Shop"
                  className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                />
              </div>
            )}

            {/* Apprenticeship Employer (Conditional: EMPLOYED) */}
            {employmentStatus === 'EMPLOYED' && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Apprenticeship / Partner (Optional)
                </label>
                <input
                  type="text"
                  value={apprenticeshipEmployer}
                  onChange={(e) => setApprenticeshipEmployer(e.target.value)}
                  placeholder="e.g. Maruti Suzuki NAPS Partner"
                  className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                />
              </div>
            )}

            {/* Placement District (Conditional: EMPLOYED or SELF_EMPLOYED) */}
            {(employmentStatus === 'EMPLOYED' || employmentStatus === 'SELF_EMPLOYED') && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Placement / Work District (Optional)
                </label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={placementDistrict}
                    onChange={(e) => setPlacementDistrict(e.target.value)}
                    placeholder="e.g. Pune, Bengaluru, Jaipur"
                    className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>
              </div>
            )}

            {/* Non-Placement Reason (Conditional: SEARCHING) */}
            {employmentStatus === 'SEARCHING' && (
              <div className="animate-in fade-in duration-200 sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Primary Reason for Ongoing Search *
                </label>
                <select
                  value={nonPlacementReason}
                  onChange={(e) => setNonPlacementReason(e.target.value)}
                  className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                >
                  <option value="SKILL_GAP">Skill Gap — Need more practical or advanced training</option>
                  <option value="WAGE_EXPECTATION">Wage Expectation — Offered salary did not meet expectations</option>
                  <option value="LOCATION">Location Constraints — Distance or relocation not possible</option>
                  <option value="NO_RESPONSE_FROM_EMPLOYERS">Awaiting Employer Responses — Applied and waiting</option>
                  <option value="OTHER">Other Personal / Market Factors</option>
                </select>
              </div>
            )}
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Candidate Notes / Role Summary (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Working as Junior React Developer in Pune. Training program certificate was verified."
              rows={2}
              className="w-full bg-zinc-50/70 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 resize-y"
            />
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-darkDelegation hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Recording Status...
                </>
              ) : (
                <>
                  <PlusCircle size={14} />
                  Submit Self-Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Verification Feedback Banner */}
      {verificationFeedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium flex items-start gap-3 animate-in fade-in duration-200 ${
            verificationFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : verificationFeedback.type === 'consent_warning'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {verificationFeedback.type === 'success' && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
          {verificationFeedback.type === 'consent_warning' && <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />}
          {verificationFeedback.type === 'error' && <AlertCircle size={18} className="text-red-600 shrink-0" />}

          <div className="flex-1 space-y-1">
            <p className="leading-relaxed">{verificationFeedback.message}</p>
            {verificationFeedback.link && (
              <div className="pt-1 flex items-center gap-2">
                <span className="text-zinc-500 font-mono text-[11px]">Direct Link:</span>
                <a
                  href={verificationFeedback.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline text-blue-700 hover:text-blue-900 flex items-center gap-1"
                >
                  <span>Open Verification Portal</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          <button
            onClick={() => setVerificationFeedback(null)}
            className="text-zinc-400 hover:text-zinc-700 cursor-pointer font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Outcome History Timeline */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-zinc-400" />
            <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
              Outcome Check-In History
            </h2>
          </div>
          <span className="text-[11px] font-bold text-zinc-400">
            {outcomeHistory.length} {outcomeHistory.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {/* Empty State Fallback */}
        {outcomeHistory.length === 0 && !loadingHistory && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-10 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform hover:scale-105"
              style={{ backgroundColor: USER_COLOR_LIGHT }}
            >
              <Award size={26} strokeWidth={2} style={{ color: USER_COLOR }} />
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200/60 mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-darkDelegation">
                Outcome Record
              </span>
            </div>

            <h3 className="text-base font-black text-darkDelegation mb-1 tracking-tight">
              No outcome check-ins recorded yet
            </h3>

            <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mb-4 font-medium">
              Self-report your current placement status using the form above to record your first milestone, or wait for automated 90/180/365-day follow-ups.
            </p>
          </div>
        )}

        {/* Timeline Cards */}
        {outcomeHistory.length > 0 && (
          <div className="space-y-3">
            {outcomeHistory.map((item) => {
              const badge = getStatusBadgeStyle(item.employmentStatus);
              const respondedDate = item.respondedAt || item.createdAt;
              const verification = item.employerVerification;
              const isEmployed = item.employmentStatus === 'EMPLOYED';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs hover:shadow-md transition-shadow p-4 md:p-5 flex flex-col gap-3"
                >
                  {/* Card Top Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-900 tracking-tight">
                        {formatCheckinType(item.checkinType)}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          item.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                      <Calendar size={12} />
                      <span>
                        {new Date(respondedDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Card Badges Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Employment Status Badge */}
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      <Briefcase size={13} />
                      <span>{formatEmploymentStatus(item.employmentStatus)}</span>
                    </div>

                    {/* Employer Badge */}
                    {item.employerName && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-zinc-50 border border-zinc-200 text-zinc-700">
                        <Building size={13} className="text-zinc-400" />
                        <span>{item.employerName}</span>
                      </div>
                    )}

                    {/* Wage Band Badge */}
                    {item.wageBand && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-zinc-50 border border-zinc-200 text-zinc-700 font-mono">
                        <DollarSign size={13} className="text-zinc-400" />
                        <span>₹{item.wageBand}</span>
                      </div>
                    )}

                    {/* Training Relevance Badge */}
                    {item.roleRelevance && (
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                          item.roleRelevance === 'DIRECTLY_RELATED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : item.roleRelevance === 'SOMEWHAT_RELATED'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <Compass size={12} />
                        <span>{formatRelevanceLabel(item.roleRelevance)}</span>
                      </div>
                    )}

                    {/* Self-Employment Type */}
                    {item.selfEmploymentType && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-zinc-50 border border-zinc-200 text-zinc-700">
                        <span className="text-zinc-400 font-bold">Trade:</span>
                        <span>{item.selfEmploymentType}</span>
                      </div>
                    )}

                    {/* Apprenticeship Employer */}
                    {item.apprenticeshipEmployer && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-50 border border-purple-200 text-purple-800">
                        <span className="font-bold">Apprenticeship:</span>
                        <span>{item.apprenticeshipEmployer}</span>
                      </div>
                    )}

                    {/* Placement District */}
                    {item.placementDistrict && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-50/80 border border-emerald-200 text-emerald-800">
                        <MapPin size={12} className="text-emerald-600" />
                        <span>Placed in: {item.placementDistrict}</span>
                      </div>
                    )}

                    {/* Non-Placement Reason */}
                    {item.nonPlacementReason && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-800">
                        <AlertTriangle size={12} />
                        <span>{formatNonPlacementReason(item.nonPlacementReason)}</span>
                      </div>
                    )}
                  </div>

                  {/* Candidate Notes */}
                  {item.notes && (
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-xs text-zinc-600 leading-relaxed font-medium">
                      "{item.notes}"
                    </div>
                  )}

                  {/* Employer Verification Status / Action Row */}
                  {isEmployed && (
                    <div className="pt-2 border-t border-zinc-100 flex flex-col gap-2">
                      {/* Case 1: Verification Already Exists */}
                      {verification ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/70">
                          <div className="flex flex-wrap items-center gap-2">
                            <div
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                verification.status === 'CONFIRMED'
                                  ? 'bg-emerald-100/70 text-emerald-800 border-emerald-300'
                                  : verification.status === 'DENIED'
                                  ? 'bg-rose-100/70 text-rose-800 border-rose-300'
                                  : 'bg-amber-100/70 text-amber-800 border-amber-300'
                              }`}
                            >
                              {verification.status === 'CONFIRMED' && <ShieldCheck size={14} className="text-emerald-700" />}
                              {verification.status === 'DENIED' && <XCircle size={14} className="text-rose-700" />}
                              {verification.status === 'PENDING' && <Clock size={14} className="text-amber-700" />}
                              <span>
                                {verification.status === 'CONFIRMED' && 'Employer Verified'}
                                {verification.status === 'DENIED' && 'Employer Denied'}
                                {verification.status === 'PENDING' && 'Verification Pending'}
                              </span>
                            </div>

                            <span className="text-xs text-zinc-500 font-medium">
                              Sent to: <code className="font-mono text-zinc-700">{verification.employerContactEmail}</code>
                            </span>

                            {verification.verifiedByName && (
                              <span className="text-xs text-zinc-500">
                                • Attested by <span className="font-semibold text-zinc-800">{verification.verifiedByName}</span>
                              </span>
                            )}

                            {/* Domain flag notice: Surface lower-confidence signal once resolved */}
                            {verification.contactDomainFlag && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md"
                                title="Employer email belongs to a free consumer domain (e.g. Gmail, Yahoo)"
                              >
                                <AlertTriangle size={11} className="text-amber-600" />
                                <span>Lower confidence — personal email domain</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-zinc-400 font-medium">
                            {verification.status === 'PENDING' ? (
                              <a
                                href={`/verify/${verification.verificationToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <span>Preview Link</span>
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              verification.verifiedAt && (
                                <span>{new Date(verification.verifiedAt).toLocaleDateString()}</span>
                              )
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Case 2: No Verification Exists Yet -> Show Request Action */
                        <div className="space-y-2">
                          {requestingVerificationId === item.id ? (
                            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2.5 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                                  <ShieldCheck size={14} className="text-blue-600" />
                                  <span>Request Direct Employer Verification</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRequestingVerificationId(null)}
                                  className="text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer font-bold"
                                >
                                  Cancel
                                </button>
                              </div>

                              <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Enter your HR or supervisor's business email. They will receive a 1-click verification link to attest your employment.
                              </p>

                              <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                  <input
                                    type="email"
                                    placeholder="e.g. hr@company.com or manager@example.com"
                                    value={employerEmailInput[item.id] || ''}
                                    onChange={(e) =>
                                      setEmployerEmailInput((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full bg-white border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={verifyingSubmitting}
                                  onClick={() => handleRequestVerification(item.id)}
                                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
                                >
                                  {verifyingSubmitting ? (
                                    <>
                                      <Loader2 size={13} className="animate-spin" />
                                      <span>Sending...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Send size={13} />
                                      <span>Send Verification Request</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-zinc-400 font-medium">
                                Unverified employment claim
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setRequestingVerificationId(item.id);
                                  setVerificationFeedback(null);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
                              >
                                <ShieldCheck size={14} className="text-blue-600" />
                                <span>Request Employer Verification</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Corroboration Signals (Beta) Section */}
        {/* Rendered ONLY if GOVT_CROSS_CHECK consent is granted AND records exist */}
        {traineeProfile?.consent?.GOVT_CROSS_CHECK?.granted && govtChecks.length > 0 && (
          <div className="mt-4 pt-5 border-t border-zinc-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                  <Landmark size={13} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Corroboration Signals (Beta)
                    </h2>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                      Informative Corroboration
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Supplementary national registry cross-checks. Not verified ground truth.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {govtChecks.length} {govtChecks.length === 1 ? 'Check' : 'Checks'}
              </span>
            </div>

            {/* Advisory Information Callout */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2.5">
              <HelpCircle size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>Registry Corroboration Scope:</strong> Cross-checks query the Ministry of Labour & Employment (e-Shram) and Ministry of MSME (UDYAM) to identify whether uncontactable candidates have registered in the unorganised workforce or formed a micro-enterprise. These signals support outcome monitoring but do not replace direct employer confirmation.
              </span>
            </div>

            {/* Corroboration Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {govtChecks.map((item) => {
                const isEShram = item.source === 'ESHRAM';
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200/80 p-3.5 flex flex-col justify-between gap-2 shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">
                          {isEShram ? 'e-Shram Registry' : 'UDYAM Portal'}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          ({isEShram ? 'Informal Sector' : 'MSME Enterprise'})
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          item.matchFound
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : 'bg-zinc-50 text-zinc-500 border-zinc-200'
                        }`}
                      >
                        {item.matchFound
                          ? `Match Found (${Math.round((item.matchConfidence || 0.8) * 100)}% conf)`
                          : 'No Associated Record'}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 leading-relaxed font-medium bg-zinc-50/70 p-2 rounded-lg border border-zinc-100">
                      {item.matchedRecordSummary || 'No additional summary recorded.'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                      <span>Checked: {new Date(item.checkedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      <span className="font-mono">ID: {item.id.slice(-6)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OutcomeStatusView;
