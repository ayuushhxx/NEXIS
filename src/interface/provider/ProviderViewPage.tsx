import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Award,
  Users,
  Clock,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  GraduationCap,
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface Scorecard {
  id: string;
  courseName: string;
  providerName: string;
  totalClaims: number;
  confirmedCount: number;
  deniedCount: number;
  relevanceScore: number | null;
  employerReasonBreakdown: Record<string, number>;
  traineeReasonBreakdown: Record<string, number>;
  topMissingSkills: { skill: string; count: number }[];
  computedAt: string;
}

interface ProviderViewPayload {
  providerName: string;
  tokenExpiresAt: string | null;
  filterApplied: {
    scheme: string | null;
    from: string | null;
    to: string | null;
  };
  schemes: string[];
  enrolledCourses: string[];
  overview: {
    totalTrainees: number;
    dueCheckinTrainees: number;
    respondedTrainees: number;
    responseRate: number | null;
    responseRatePercentage: number | null;
    reportedTrainees: number;
    placedTrainees: number;
    placementRate: number | null;
    placementRatePercentage: number | null;
    employmentStatusBreakdown: {
      EMPLOYED: number;
      SELF_EMPLOYED: number;
      SEARCHING: number;
      IN_TRAINING: number;
      OTHER: number;
    };
  };
  averageRelevanceScore: number | null;
  courses: Scorecard[];
}

export const ProviderViewPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<ProviderViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProviderData() {
      if (!token) {
        setErrorStatus(400);
        setErrorMessage('Missing access token in URL.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/provider-view/${token}`);
        if (!res.ok) {
          setErrorStatus(res.status);
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error ${res.status}`);
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to retrieve provider analytics.');
      } finally {
        setLoading(false);
      }
    }

    fetchProviderData();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-zinc-500 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center shadow-xs mb-3">
          <Building2 size={24} className="text-darkDelegation animate-pulse" />
        </div>
        <p className="text-xs font-bold text-zinc-600">Verifying secure provider access token...</p>
      </div>
    );
  }

  if (errorStatus || !data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-zinc-900 font-sans">
        <div className="bg-white rounded-3xl border border-zinc-200 p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-black tracking-tight mb-2">
            {errorStatus === 403 ? 'Access Token Expired' : 'Invalid Access Link'}
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed mb-6 font-medium">
            {errorMessage ||
              (errorStatus === 403
                ? 'This read-only provider access token has expired. Please contact the program administrator to request a renewed link.'
                : 'The provider link you followed is invalid, unrecognized, or has been revoked.')}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  const { overview, averageRelevanceScore, courses } = data;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-zinc-200/80 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-zinc-900 tracking-tight">
                {data.providerName}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Provider Portal
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-medium">
              Verified outcomes, response integrity, and course relevance analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {data.tokenExpiresAt && (
            <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">
              Access valid until: <b className="text-zinc-700">{new Date(data.tokenExpiresAt).toLocaleDateString()}</b>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-bold">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>Isolated Read-Only</span>
          </span>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Enrolled Candidates */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Trainees Enrolled</span>
              <Users size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-900 tracking-tight">
                {overview.totalTrainees}
              </span>
              <span className="text-xs text-zinc-500 font-bold">candidates</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-medium">
              <span>Schemes:</span>
              <span className="font-bold text-zinc-800">{data.schemes.join(', ') || 'N/A'}</span>
            </div>
          </div>

          {/* Card 2: Paired Placement & Response Rate */}
          <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white to-blue-50/40 sm:col-span-2">
            <div className="flex items-center justify-between text-blue-600 mb-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={16} />
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-900">
                  Placement & Response Integrity
                </span>
              </div>
              <span className="text-[10px] font-black bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                Audited Pair
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3 my-1">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-zinc-900 tracking-tight">
                  {overview.placementRatePercentage !== null ? `${overview.placementRatePercentage}%` : '—'}
                </span>
                <span className="text-xs font-bold text-zinc-500">Placement Rate</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-100/80 border border-blue-200 text-blue-900 text-xs font-bold">
                <Clock size={12} className="text-blue-700" />
                <span>based on {overview.responseRatePercentage ?? 0}% response rate</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-blue-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
              <span>
                <b className="text-zinc-900">{overview.placedTrainees}</b> placed out of{' '}
                <b className="text-zinc-900">{overview.reportedTrainees}</b> reported
              </span>
              <span className="text-zinc-500 font-medium">
                {overview.respondedTrainees} of {overview.dueCheckinTrainees} due candidates responded (90d+)
              </span>
            </div>
          </div>
        </div>

        {/* Reported Status Breakdown */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs">
          <span className="text-[11px] font-black text-zinc-700 uppercase tracking-wider block mb-3">
            Trainee Employment Status Breakdown
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Employed</span>
              <span className="text-xl font-black text-emerald-950 mt-0.5">{overview.employmentStatusBreakdown.EMPLOYED}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-900 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Self-Employed</span>
              <span className="text-xl font-black text-teal-950 mt-0.5">{overview.employmentStatusBreakdown.SELF_EMPLOYED}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Searching</span>
              <span className="text-xl font-black text-amber-950 mt-0.5">{overview.employmentStatusBreakdown.SEARCHING}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 text-purple-900 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">In Training</span>
              <span className="text-xl font-black text-purple-950 mt-0.5">{overview.employmentStatusBreakdown.IN_TRAINING}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Other</span>
              <span className="text-xl font-black text-zinc-900 mt-0.5">{overview.employmentStatusBreakdown.OTHER}</span>
            </div>
          </div>
        </div>

        {/* Course Relevance Scorecards Section */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Course Relevance Scorecards
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Multi-signal curriculum assessment combining employer verification and candidate skill gaps
              </p>
            </div>

            {averageRelevanceScore !== null && (
              <span className="px-3 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-black">
                Provider Average: {averageRelevanceScore.toFixed(2)} / 1.00
              </span>
            )}
          </div>

          {courses.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-medium">
              No course relevance scorecards computed for this provider yet.
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course) => (
                <div key={course.id} className="p-4 bg-zinc-50/70 border border-zinc-200 rounded-2xl space-y-4">
                  {/* Course Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">{course.courseName}</h3>
                      <span className="text-[11px] text-zinc-500 font-medium">
                        Total Claims: <b>{course.totalClaims}</b> ({course.confirmedCount} confirmed, {course.deniedCount} denied)
                      </span>
                    </div>

                    {course.relevanceScore !== null ? (
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black border ${
                          course.relevanceScore >= 0.7
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : course.relevanceScore >= 0.4
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}
                      >
                        Score: {course.relevanceScore.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Insufficient Data</span>
                    )}
                  </div>

                  {/* Top Missing Skills */}
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1.5">
                      Top Identified Skill Gaps (From Trainee ATS Resumes)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {course.topMissingSkills && course.topMissingSkills.length > 0 ? (
                        course.topMissingSkills.map((sk) => (
                          <span key={sk.skill} className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-xs font-semibold text-zinc-800 shadow-2xs">
                            {sk.skill} <b className="text-red-600">({sk.count})</b>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400">No skill gaps recorded</span>
                      )}
                    </div>
                  </div>

                  {/* Separated Reason Breakdowns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Employer Reasons */}
                    <div className="p-3 rounded-xl bg-red-50/60 border border-red-200 text-red-950">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-800 block mb-1.5">
                        Employer-Reported Denial Reasons
                      </span>
                      {Object.keys(course.employerReasonBreakdown || {}).length > 0 ? (
                        <div className="space-y-1 text-xs font-medium">
                          {Object.entries(course.employerReasonBreakdown).map(([r, c]) => (
                            <div key={r} className="flex justify-between">
                              <span>{r}</span>
                              <b className="text-red-700">{c}</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">No employer denial records</span>
                      )}
                    </div>

                    {/* Trainee Reasons */}
                    <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-950">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block mb-1.5">
                        Trainee-Reported Ongoing Search Reasons
                      </span>
                      {Object.keys(course.traineeReasonBreakdown || {}).length > 0 ? (
                        <div className="space-y-1 text-xs font-medium">
                          {Object.entries(course.traineeReasonBreakdown).map(([r, c]) => (
                            <div key={r} className="flex justify-between">
                              <span>{r}</span>
                              <b className="text-amber-700">{c}</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">No ongoing search records</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Privacy & Scope Isolation Banner */}
        <div className="p-4 bg-zinc-100 rounded-2xl border border-zinc-200 flex items-start gap-3 text-xs text-zinc-600 font-medium leading-relaxed">
          <ShieldCheck size={18} className="text-zinc-500 shrink-0 mt-0.5" />
          <p>
            <b>Data Scope & Security Notice:</b> This view is cryptographically bound to <b>{data.providerName}</b>. To preserve candidate privacy under India's Digital Personal Data Protection (DPDP) Act, individual candidate personal data (names, Aadhaar hashes, mobile numbers) is strictly redacted. Competing training provider data is not accessible.
          </p>
        </div>
      </main>
    </div>
  );
};

export default ProviderViewPage;
