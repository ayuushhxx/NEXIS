import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsAdmin } from './useIsAdmin';
import { useTraineeProfile } from '../../integration/hooks/useTraineeProfile';
import { useUiStore } from '../../integration/store/uiStore';
import {
  BarChart3,
  TrendingUp,
  MapPin,
  Users,
  GraduationCap,
  Building2,
  Calendar,
  Filter,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Briefcase,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// Types for Analytics Payload
interface OverviewData {
  totalEnrolments: number;
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
}

interface DistrictItem {
  district?: string;
  placementDistrict?: string;
  totalTrainees: number;
  dueCheckinTrainees: number;
  respondedTrainees: number;
  responseRate: number | null;
  responseRatePercentage: number | null;
  reportedTrainees: number;
  placedTrainees: number;
  placementRate: number | null;
  placementRatePercentage: number | null;
  employmentStatusBreakdown: Record<string, number>;
  topHomeDistricts?: { homeDistrict: string; count: number }[];
}

interface CohortItem {
  cohortName: string;
  schemes: string[];
  providers: string[];
  totalTrainees: number;
  dueCheckinTrainees: number;
  respondedTrainees: number;
  responseRate: number | null;
  responseRatePercentage: number | null;
  reportedTrainees: number;
  placedTrainees: number;
  placementRate: number | null;
  placementRatePercentage: number | null;
  employmentStatusBreakdown: Record<string, number>;
}

interface CourseScorecard {
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

interface ProviderItem {
  providerName: string;
  schemes: string[];
  enrolledCourses: string[];
  totalTrainees: number;
  dueCheckinTrainees: number;
  respondedTrainees: number;
  responseRate: number | null;
  responseRatePercentage: number | null;
  reportedTrainees: number;
  placedTrainees: number;
  placementRate: number | null;
  placementRatePercentage: number | null;
  averageRelevanceScore: number | null;
  courseScorecards: CourseScorecard[];
}

interface WageProgressionData {
  totalTrainees: number;
  eligibleTrainees: number;
  insufficientDataCount: number;
  movedUpCount: number;
  stayedSameCount: number;
  movedDownCount: number;
  percentageMovedUp: number;
  percentageStayedSame: number;
  percentageMovedDown: number;
  transitions: { transition: string; count: number }[];
}

// ── Impact Estimation (Illustrative — Synthetic Control Group) ─────────────
// NOTE: overallEstimatedUpliftPp is the illustrative uplift in percentage points
//       produced by comparing trainees to a SYNTHETIC control group.
//       This is not a validated causal effect — see disclaimer in every response.
interface ImpactBucketRow {
  ageBand: string;
  district: string;
  priorQualification: string;
  traineeCount: number;
  controlCount: number;
  traineePlacementRate: number | null;
  controlPlacementRate: number | null;
  estimatedUpliftPp: number | null;
  skipped: boolean;
  skipReason: string | null;
}

interface ImpactData {
  overallEstimatedUpliftPp: number | null;
  eligibleBuckets: number;
  skippedBuckets: number;
  totalTraineesInEligibleBuckets: number;
  totalControlsInEligibleBuckets: number;
  perBucketBreakdown: ImpactBucketRow[];
  disclaimer: string;
  methodology: string;
}

export const AnalyticsDashboard: React.FC = () => {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { token } = useTraineeProfile();
  const { setAnalyticsDashboardOpen } = useUiStore();

  // Filters
  const [selectedScheme, setSelectedScheme] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // District View Toggle
  const [districtViewMode, setDistrictViewMode] = useState<'home' | 'placement'>('home');

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [homeDistricts, setHomeDistricts] = useState<DistrictItem[]>([]);
  const [placementDistricts, setPlacementDistricts] = useState<DistrictItem[]>([]);
  const [cohorts, setCohorts] = useState<CohortItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [wageProgression, setWageProgression] = useState<WageProgressionData | null>(null);

  // Provider Table Sorting & Drilldown
  const [providerSortField, setProviderSortField] = useState<'relevance' | 'placement' | 'response' | 'trainees' | 'name'>('relevance');
  const [providerSortAsc, setProviderSortAsc] = useState<boolean>(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Provider Access Link Generator
  const [genProviderName, setGenProviderName] = useState('');
  const [genExpiryDays, setGenExpiryDays] = useState('30');
  const [generatingToken, setGeneratingToken] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ link: string; expiresAt: string; providerName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Impact Estimation state (fetched independently — different auth, no filter params)
  const [impactData, setImpactData] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  // Bucket table is collapsed by default — the overview number is the headline
  const [impactBucketsExpanded, setImpactBucketsExpanded] = useState(false);

  // Fetch all analytics data with query filters
  const fetchData = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const queryParts: string[] = [];
    if (selectedScheme.trim()) queryParts.push(`scheme=${encodeURIComponent(selectedScheme.trim())}`);
    if (startDate) queryParts.push(`from=${encodeURIComponent(startDate)}`);
    if (endDate) queryParts.push(`to=${encodeURIComponent(endDate)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    const authHeaders = { Authorization: `Bearer ${token}` };

    try {
      const [overviewRes, districtRes, cohortRes, providerRes, wageRes] = await Promise.all([
        fetch(`/api/analytics/overview${queryString}`, { headers: authHeaders }),
        fetch(`/api/analytics/by-district${queryString}`, { headers: authHeaders }),
        fetch(`/api/analytics/by-cohort${queryString}`, { headers: authHeaders }),
        fetch(`/api/analytics/by-provider${queryString}`, { headers: authHeaders }),
        fetch(`/api/analytics/wage-progression${queryString}`, { headers: authHeaders }),
      ]);

      if (!overviewRes.ok) throw new Error('Failed to load overview metrics');
      if (!districtRes.ok) throw new Error('Failed to load district breakdown');
      if (!cohortRes.ok) throw new Error('Failed to load cohort breakdown');
      if (!providerRes.ok) throw new Error('Failed to load provider breakdown');
      if (!wageRes.ok) throw new Error('Failed to load wage progression data');

      const overviewJson = await overviewRes.json();
      const districtJson = await districtRes.json();
      const cohortJson = await cohortRes.json();
      const providerJson = await providerRes.json();
      const wageJson = await wageRes.json();

      setOverview(overviewJson);
      setHomeDistricts(districtJson.homeDistrictBreakdown || []);
      setPlacementDistricts(districtJson.placementDistrictBreakdown || []);
      setCohorts(cohortJson.cohorts || []);
      setProviders(providerJson.providers || []);
      setWageProgression(wageJson);
    } catch (err) {
      console.error('[AnalyticsDashboard] Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Error loading analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedScheme, startDate, endDate]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin, fetchData]);

  // Fetch impact estimation separately — no filter params, no retry on filter change
  const fetchImpact = useCallback(async () => {
    if (!token) return;
    setImpactLoading(true);
    setImpactError(null);
    try {
      const res = await fetch('/api/analytics/impact', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404 || res.status === 409) {
        // No control group rows seeded yet — show empty state, not an error
        setImpactData(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load impact estimate');
      const json = await res.json();
      setImpactData(json);
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Failed to load impact estimate');
    } finally {
      setImpactLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin) {
      fetchImpact();
    }
  }, [isAdmin, fetchImpact]);

  // Handle Provider Token Generation
  const handleGenerateProviderToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genProviderName.trim()) return;

    setGeneratingToken(true);
    setGenError(null);
    try {
      const res = await fetch('/api/admin/generate-provider-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerName: genProviderName.trim(),
          expiresInDays: Number(genExpiryDays) || 30,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to generate token');
      }

      const data = await res.json();
      const shareUrl = `${window.location.origin}/provider/${data.token}`;
      setGeneratedLink({
        link: shareUrl,
        expiresAt: data.expiresAt,
        providerName: data.providerName,
      });
      setGenProviderName('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setGeneratingToken(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sorted Providers List (Worst relevance score first by default)
  const sortedProviders = useMemo(() => {
    const list = [...providers];
    list.sort((a, b) => {
      let comparison = 0;
      switch (providerSortField) {
        case 'relevance': {
          // Worst score first (lowest number). Unscored / null scores placed at the very end
          const aScore = a.averageRelevanceScore;
          const bScore = b.averageRelevanceScore;
          if (aScore === null && bScore === null) comparison = a.providerName.localeCompare(b.providerName);
          else if (aScore === null) comparison = 1;
          else if (bScore === null) comparison = -1;
          else comparison = aScore - bScore;
          break;
        }
        case 'placement':
          comparison = (a.placementRatePercentage ?? -1) - (b.placementRatePercentage ?? -1);
          break;
        case 'response':
          comparison = (a.responseRatePercentage ?? -1) - (b.responseRatePercentage ?? -1);
          break;
        case 'trainees':
          comparison = a.totalTrainees - b.totalTrainees;
          break;
        case 'name':
          comparison = a.providerName.localeCompare(b.providerName);
          break;
      }
      return providerSortAsc ? comparison : -comparison;
    });
    return list;
  }, [providers, providerSortField, providerSortAsc]);

  // District Chart Data Preparation
  const districtChartData = useMemo(() => {
    const activeList = districtViewMode === 'home' ? homeDistricts : placementDistricts;
    return activeList.map((item) => ({
      name: (districtViewMode === 'home' ? item.district : item.placementDistrict) || 'Unknown',
      placementRate: item.placementRatePercentage ?? 0,
      responseRate: item.responseRatePercentage ?? 0,
      totalTrainees: item.totalTrainees,
      placedTrainees: item.placedTrainees,
      reportedTrainees: item.reportedTrainees,
      dueTrainees: item.dueCheckinTrainees,
      respondedTrainees: item.respondedTrainees,
    }));
  }, [districtViewMode, homeDistricts, placementDistricts]);

  // Cohort Chart Data Preparation
  const cohortChartData = useMemo(() => {
    return cohorts.map((c) => ({
      name: c.cohortName,
      placementRate: c.placementRatePercentage ?? 0,
      responseRate: c.responseRatePercentage ?? 0,
      totalTrainees: c.totalTrainees,
      placedTrainees: c.placedTrainees,
      schemes: c.schemes.join(', '),
    }));
  }, [cohorts]);

  if (adminLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-500 bg-white">
        <RefreshCw size={24} className="animate-spin text-darkDelegation mb-3" />
        <p className="text-sm font-semibold">Authenticating administrative privileges...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-50">
        <div className="bg-white p-8 rounded-2xl border border-red-200 max-w-md shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-black text-zinc-900 tracking-tight mb-2">Administrative Access Restricted</h2>
          <p className="text-xs text-zinc-600 leading-relaxed mb-6 font-medium">
            This dashboard contains aggregated government labor statistics and provider relevance scorecards. Only users with registered <span className="font-bold text-zinc-800">ANALYST</span>, <span className="font-bold text-zinc-800">REVIEWER</span>, or <span className="font-bold text-zinc-800">SUPER_ADMIN</span> roles may enter.
          </p>
          <button
            onClick={() => setAnalyticsDashboardOpen(false)}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Close Panel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 overflow-y-auto">
      {/* Top Banner & Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-zinc-200/80 px-6 py-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-zinc-900 tracking-tight">
                  Government & Training Provider Analytics
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Live Aggregations
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Outcome tracking, labor migration attribution, paired response rates, and provider scorecards
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Analytics"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setAnalyticsDashboardOpen(false)}
              className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              title="Close Dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-zinc-100 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400 font-bold uppercase tracking-wider text-[11px] mr-1">
            <Filter size={13} />
            <span>Filters:</span>
          </div>

          {/* Scheme Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200">
            <GraduationCap size={13} className="text-zinc-400" />
            <select
              value={selectedScheme}
              onChange={(e) => setSelectedScheme(e.target.value)}
              className="bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
            >
              <option value="">All Schemes</option>
              <option value="PMKVY 4.0">PMKVY 4.0</option>
              <option value="PMKVY">PMKVY</option>
              <option value="DDU-GKY">DDU-GKY</option>
              <option value="ITI">ITI</option>
            </select>
          </div>

          {/* Date Range: From */}
          <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200">
            <Calendar size={13} className="text-zinc-400" />
            <span className="text-[11px] font-bold text-zinc-400">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200">
            <Calendar size={13} className="text-zinc-400" />
            <span className="text-[11px] font-bold text-zinc-400">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
            />
          </div>

          {(selectedScheme || startDate || endDate) && (
            <button
              onClick={() => {
                setSelectedScheme('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-[11px] font-bold text-zinc-400 hover:text-zinc-800 underline ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs font-semibold">
            <AlertTriangle size={18} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* ── SECTION 1: TOP OVERVIEW CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Enrolment Scale */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Trainees Enrolled</span>
              <Users size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-900 tracking-tight">
                {overview?.totalTrainees ?? '—'}
              </span>
              <span className="text-xs text-zinc-500 font-bold">unique candidates</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-medium">
              <span>Total Course Enrolments:</span>
              <span className="font-bold text-zinc-800">{overview?.totalEnrolments ?? '—'}</span>
            </div>
          </div>

          {/* Card 2: Prominently Paired Placement & Response Rate */}
          <div className="bg-white rounded-2xl border border-blue-200/80 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white to-blue-50/40 sm:col-span-2">
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
                  {overview?.placementRatePercentage !== null && overview?.placementRatePercentage !== undefined
                    ? `${overview.placementRatePercentage}%`
                    : 'Insufficient Data'}
                </span>
                <span className="text-xs font-bold text-zinc-500">Placement Rate</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-100/80 border border-blue-200 text-blue-900 text-xs font-bold">
                <Clock size={12} className="text-blue-700" />
                <span>based on {overview?.responseRatePercentage ?? 0}% response rate</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-blue-100/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
              <span>
                <b className="text-zinc-900">{overview?.placedTrainees ?? 0}</b> placed out of{' '}
                <b className="text-zinc-900">{overview?.reportedTrainees ?? 0}</b> reported
              </span>
              <span className="text-zinc-500 font-medium">
                {overview?.respondedTrainees ?? 0} of {overview?.dueCheckinTrainees ?? 0} due candidates responded (90d+)
              </span>
            </div>
          </div>

          {/* Card 3: Wage Band Advancement */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Wage Progression</span>
              <TrendingUp size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600 tracking-tight">
                {wageProgression ? `${wageProgression.percentageMovedUp}%` : '—'}
              </span>
              <span className="text-xs text-zinc-500 font-bold">advanced wage band</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-medium">
              <span>Evaluated Candidates:</span>
              <span className="font-bold text-zinc-800">{wageProgression?.eligibleTrainees ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Status Breakdown Bar */}
        {overview?.employmentStatusBreakdown && (
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-black text-zinc-700 uppercase tracking-wider text-[11px]">
                Reported Employment Status Distribution
              </span>
              <span className="text-zinc-400 text-[11px] font-medium">Latest Check-In per Candidate</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Employed</span>
                <span className="text-lg font-black text-emerald-950 mt-0.5">{overview.employmentStatusBreakdown.EMPLOYED}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-900 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Self-Employed</span>
                <span className="text-lg font-black text-teal-950 mt-0.5">{overview.employmentStatusBreakdown.SELF_EMPLOYED}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Searching</span>
                <span className="text-lg font-black text-amber-950 mt-0.5">{overview.employmentStatusBreakdown.SEARCHING}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 text-purple-900 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">In Training</span>
                <span className="text-lg font-black text-purple-950 mt-0.5">{overview.employmentStatusBreakdown.IN_TRAINING}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Other</span>
                <span className="text-lg font-black text-zinc-900 mt-0.5">{overview.employmentStatusBreakdown.OTHER}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION 2: DISTRICT SECTION (HOME VS PLACEMENT MIGRATION) ── */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  District Attribution & Migration Analytics
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Decoupled trainee origin from workplace location to expose labor mobility
              </p>
            </div>

            {/* Toggle Mode: Home vs Placement */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
              <button
                onClick={() => setDistrictViewMode('home')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  districtViewMode === 'home'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Home District (Origin)
              </button>
              <button
                onClick={() => setDistrictViewMode('placement')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  districtViewMode === 'placement'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Placement District (Workplace)
              </button>
            </div>
          </div>

          {districtChartData.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-medium">
              No district records match the active filter criteria.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={districtChartData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-zinc-900 text-white p-3 rounded-xl text-xs shadow-xl space-y-1">
                              <p className="font-bold border-b border-zinc-800 pb-1">{data.name}</p>
                              <p className="text-emerald-400 font-bold">Placement Rate: {data.placementRate}%</p>
                              <p className="text-blue-300 font-bold">Response Rate: {data.responseRate}%</p>
                              <p className="text-zinc-400 text-[10px]">
                                Placed: {data.placedTrainees} / {data.reportedTrainees} reported ({data.totalTrainees} total)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                    />
                    <Bar dataKey="placementRate" name="Placement Rate (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="responseRate" name="Response Rate (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Migration Origins Table / Badges (Only in Placement view) */}
              {districtViewMode === 'placement' && (
                <div className="mt-4 pt-4 border-t border-zinc-100">
                  <span className="text-xs font-black text-zinc-700 uppercase tracking-wider block mb-2">
                    Inbound Labor Migration Streams (Origin Districts)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {placementDistricts.map((p) => (
                      <div key={p.placementDistrict} className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <div className="flex items-center justify-between text-xs font-bold text-zinc-900 mb-1">
                          <span>{p.placementDistrict}</span>
                          <span className="text-[11px] text-emerald-700 font-bold">{p.totalTrainees} Placed</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {p.topHomeDistricts && p.topHomeDistricts.length > 0 ? (
                            p.topHomeDistricts.map((h) => (
                              <span key={h.homeDistrict} className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-zinc-600 font-semibold">
                                From {h.homeDistrict}: <b className="text-zinc-900">{h.count}</b>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-zinc-400">Local placement</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 3: COHORT PERFORMANCE CHART ── */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Placement Rate by Training Cohort
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Every cohort placement percentage is paired with verified response rate
              </p>
            </div>
            <span className="text-xs text-zinc-400 font-bold">{cohorts.length} Cohorts Analyzed</span>
          </div>

          {cohortChartData.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-medium">
              No cohort data available for selected criteria.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cohortChartData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-zinc-900 text-white p-3 rounded-xl text-xs shadow-xl space-y-1">
                            <p className="font-bold border-b border-zinc-800 pb-1">{data.name}</p>
                            <p className="text-zinc-400 text-[10px]">Schemes: {data.schemes}</p>
                            <p className="text-emerald-400 font-bold">Placement Rate: {data.placementRate}%</p>
                            <p className="text-blue-300 font-bold">Response Rate: {data.responseRate}%</p>
                            <p className="text-zinc-400 text-[10px]">
                              Placed: {data.placedTrainees} of {data.totalTrainees} enrolled candidates
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                  <Bar dataKey="placementRate" name="Placement Rate (%)" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="responseRate" name="Response Rate (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── SECTION 4: PROVIDER PERFORMANCE & RELEVANCE TABLE ── */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Provider Relevance Scorecards & Outcomes
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Sorted by worst relevance score first for targeted curriculum intervention
              </p>
            </div>
            <div className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-xl font-bold flex items-center gap-1.5">
              <AlertCircle size={13} />
              <span>Click any provider row to inspect missing skills & reason breakdown</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[11px] font-black text-zinc-600 uppercase tracking-wider">
                  <th
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => {
                      setProviderSortField('name');
                      setProviderSortAsc(!providerSortAsc);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Provider Name</span>
                      {providerSortField === 'name' && (providerSortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => {
                      setProviderSortField('trainees');
                      setProviderSortAsc(!providerSortAsc);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Enrolled</span>
                      {providerSortField === 'trainees' && (providerSortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => {
                      setProviderSortField('placement');
                      setProviderSortAsc(!providerSortAsc);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Placement Rate</span>
                      {providerSortField === 'placement' && (providerSortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => {
                      setProviderSortField('response');
                      setProviderSortAsc(!providerSortAsc);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Response Rate</span>
                      {providerSortField === 'response' && (providerSortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th
                    className="p-3.5 cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => {
                      setProviderSortField('relevance');
                      setProviderSortAsc(!providerSortAsc);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Relevance Score</span>
                      {providerSortField === 'relevance' && (providerSortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="p-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {sortedProviders.map((provider) => {
                  const isExpanded = expandedProvider === provider.providerName;
                  const score = provider.averageRelevanceScore;

                  return (
                    <React.Fragment key={provider.providerName}>
                      <tr
                        onClick={() => setExpandedProvider(isExpanded ? null : provider.providerName)}
                        className={`hover:bg-zinc-50/80 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <td className="p-3.5 font-bold text-zinc-900">
                          <div>{provider.providerName}</div>
                          <div className="text-[10px] text-zinc-400 font-medium mt-0.5">
                            {provider.enrolledCourses.join(', ')}
                          </div>
                        </td>
                        <td className="p-3.5 text-zinc-700">{provider.totalTrainees} candidates</td>
                        <td className="p-3.5">
                          <span className="font-black text-emerald-700">
                            {provider.placementRatePercentage !== null ? `${provider.placementRatePercentage}%` : '—'}
                          </span>
                          <span className="text-[10px] text-zinc-400 block">
                            {provider.placedTrainees} / {provider.reportedTrainees} reported
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-blue-700">
                            {provider.responseRatePercentage !== null ? `${provider.responseRatePercentage}%` : '—'}
                          </span>
                          <span className="text-[10px] text-zinc-400 block">
                            {provider.respondedTrainees} / {provider.dueCheckinTrainees} due
                          </span>
                        </td>
                        <td className="p-3.5">
                          {score !== null ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-black border ${
                                score >= 0.7
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : score >= 0.4
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {score.toFixed(2)} / 1.00
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-400 italic">Insufficient Data</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right text-zinc-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>

                      {/* Expandable Drilldown Card */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-zinc-50 p-4 border-b border-zinc-200/80">
                            <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-4">
                              <h4 className="text-xs font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles size={14} className="text-darkDelegation" />
                                <span>Course Drill-Down & Missing Skills: {provider.providerName}</span>
                              </h4>

                              {provider.courseScorecards && provider.courseScorecards.length > 0 ? (
                                provider.courseScorecards.map((scorecard) => (
                                  <div key={scorecard.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
                                      <span className="font-bold text-zinc-900 text-xs">{scorecard.courseName}</span>
                                      <div className="flex items-center gap-2 text-[11px]">
                                        <span className="text-zinc-500">
                                          Total Claims: <b>{scorecard.totalClaims}</b> ({scorecard.confirmedCount} confirmed, {scorecard.deniedCount} denied)
                                        </span>
                                        {scorecard.relevanceScore !== null && (
                                          <span className="px-2 py-0.5 rounded-full font-black bg-blue-50 text-blue-700 border border-blue-200">
                                            Score: {scorecard.relevanceScore.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Top Missing Skills */}
                                    <div>
                                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1.5">
                                        Top Missing Skills (From Resume Forge Ats Snapshots)
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {scorecard.topMissingSkills && scorecard.topMissingSkills.length > 0 ? (
                                          scorecard.topMissingSkills.map((sk) => (
                                            <span key={sk.skill} className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-700">
                                              {sk.skill} <b className="text-red-600">({sk.count})</b>
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-zinc-400 text-[11px]">No skill-gap data recorded yet</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Separated Employer vs Trainee Reason Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                      {/* Employer Denial Reasons */}
                                      <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-200 text-red-950">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-red-800 block mb-1">
                                          Employer-Reported Denial Reasons
                                        </span>
                                        {Object.keys(scorecard.employerReasonBreakdown || {}).length > 0 ? (
                                          <div className="space-y-1 text-[11px]">
                                            {Object.entries(scorecard.employerReasonBreakdown).map(([r, c]) => (
                                              <div key={r} className="flex justify-between">
                                                <span>{r}</span>
                                                <b className="text-red-700">{c}</b>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[11px] text-zinc-400 italic">No employer denials recorded</span>
                                        )}
                                      </div>

                                      {/* Trainee Non-Placement Reasons */}
                                      <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-950">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block mb-1">
                                          Trainee-Reported Search Reasons
                                        </span>
                                        {Object.keys(scorecard.traineeReasonBreakdown || {}).length > 0 ? (
                                          <div className="space-y-1 text-[11px]">
                                            {Object.entries(scorecard.traineeReasonBreakdown).map(([r, c]) => (
                                              <div key={r} className="flex justify-between">
                                                <span>{r}</span>
                                                <b className="text-amber-700">{c}</b>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[11px] text-zinc-400 italic">No searching check-ins reported</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-zinc-400 italic">No scorecards computed for this provider yet.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 5: LONGITUDINAL WAGE PROGRESSION ── */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Longitudinal Wage Progression Over Time
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Tracking salary band progression across candidates with multiple check-ins
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
              {wageProgression?.percentageMovedUp ?? 0}% Advanced Band
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Moved Up Band</span>
              <span className="text-2xl font-black text-emerald-950 mt-1">{wageProgression?.movedUpCount ?? 0}</span>
              <span className="text-[10px] text-emerald-600 mt-0.5">{wageProgression?.percentageMovedUp ?? 0}% of eligible</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Stayed Same</span>
              <span className="text-2xl font-black text-blue-950 mt-1">{wageProgression?.stayedSameCount ?? 0}</span>
              <span className="text-[10px] text-blue-600 mt-0.5">{wageProgression?.percentageStayedSame ?? 0}% of eligible</span>
            </div>
            <div className="p-3 rounded-xl bg-red-50/70 border border-red-200 flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-red-700">Moved Down</span>
              <span className="text-2xl font-black text-red-950 mt-1">{wageProgression?.movedDownCount ?? 0}</span>
              <span className="text-[10px] text-red-600 mt-0.5">{wageProgression?.percentageMovedDown ?? 0}% of eligible</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-200 flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Insufficient Data</span>
              <span className="text-2xl font-black text-zinc-900 mt-1">{wageProgression?.insufficientDataCount ?? 0}</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">&lt; 2 check-ins with wage</span>
            </div>
          </div>

          {wageProgression?.transitions && wageProgression.transitions.length > 0 && (
            <div className="pt-3 border-t border-zinc-100">
              <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block mb-2">
                Discrete Band Transitions Recorded
              </span>
              <div className="flex flex-wrap gap-2">
                {wageProgression.transitions.map((t) => (
                  <span key={t.transition} className="px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 flex items-center gap-2">
                    <span>{t.transition}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                      {t.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 6: PROVIDER ACCESS LINK GENERATOR ── */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-darkDelegation" />
                <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Generate Provider Read-Only Access Link
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Issue a token-authenticated link enabling training partners to view their own isolated scorecard without admin login
              </p>
            </div>
            <span className="text-[10px] bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full border border-zinc-200">
              POST /api/admin/generate-provider-token
            </span>
          </div>

          {genError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 font-semibold flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{genError}</span>
            </div>
          )}

          <form onSubmit={handleGenerateProviderToken} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                Training Provider Name *
              </label>
              <input
                type="text"
                value={genProviderName}
                onChange={(e) => setGenProviderName(e.target.value)}
                placeholder="e.g. Skill India Training Partner, Gujarat Solar Institute"
                required
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                Link Validity
              </label>
              <div className="flex gap-2">
                <select
                  value={genExpiryDays}
                  onChange={(e) => setGenExpiryDays(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                >
                  <option value="7">7 Days</option>
                  <option value="14">14 Days</option>
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                </select>

                <button
                  type="submit"
                  disabled={generatingToken || !genProviderName.trim()}
                  className="px-4 py-2 bg-darkDelegation hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shrink-0 shadow-xs active:scale-95"
                >
                  {generatingToken ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </form>

          {/* Generated Share Link Modal / Banner */}
          {generatedLink && (
            <div className="mt-4 p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                <span>Active Read-Only Link for: <b>{generatedLink.providerName}</b></span>
                <span className="text-[10px] text-blue-700">
                  Expires: {new Date(generatedLink.expiresAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink.link}
                  className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-zinc-800 font-mono select-all focus:outline-none"
                />
                <button
                  onClick={() => copyToClipboard(generatedLink.link)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
                <a
                  href={generatedLink.link}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 bg-white hover:bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-lg text-xs transition-colors shrink-0"
                  title="Open Portal in New Tab"
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                This shareable portal isolates aggregate placement rates, response rates, and course scorecards strictly to this provider. No candidate PII or competing provider data is exposed.
              </p>
            </div>
          )}
        </div>

        {/* ── Impact Estimation Section ──────────────────────────────────────────────
             Visual design: amber-50/amber-300 border to signal this section is
             deliberately MORE TENTATIVE than the surrounding data charts.
             Disclaimer is permanently visible — NEVER collapsibled or hidden.
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="mx-6 mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
          {/* Section Header */}
          <div className="px-5 py-4 border-b border-amber-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-900 tracking-tight">
                Impact Estimate (Illustrative — Synthetic Comparison)
              </h3>
              <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                Demonstrates methodology only. Does not represent a validated causal effect.
              </p>
            </div>
          </div>

          {/* Permanent, non-collapsible disclaimer — always visible */}
          <div className="mx-5 mt-4 px-4 py-3 bg-amber-100 border border-amber-300 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                <span className="font-black text-amber-900">Methodology disclaimer: </span>
                {impactData?.disclaimer ||
                  'Estimated using stratified comparison against a synthetic illustrative control group, ' +
                  'not a randomized controlled trial or real non-trainee population. ' +
                  'Intended to demonstrate methodology, not to represent a validated causal effect.'}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 pb-5">
            {impactLoading && (
              <div className="flex items-center gap-2 mt-4 text-amber-700">
                <RefreshCw size={14} className="animate-spin" />
                <span className="text-xs font-semibold">Computing impact estimate...</span>
              </div>
            )}

            {impactError && !impactLoading && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {impactError}
              </div>
            )}

            {!impactLoading && !impactError && !impactData && (
              <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-white/70 text-center">
                <p className="text-xs text-amber-800 font-semibold">
                  No synthetic control group data found.
                </p>
                <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                  An admin must run{' '}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">
                    POST /api/admin/seed-control-group
                  </code>{' '}
                  with{' '}<code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">{'{ confirm: true }'}</code>{' '}
                  before this section will show data.
                </p>
              </div>
            )}

            {!impactLoading && !impactError && impactData && (
              <div className="mt-4 space-y-4">
                {/* Headline Metric — styled more tentatively than main KPI cards */}
                <div className="p-4 bg-white/80 border border-amber-200 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">
                    Estimated Uplift (Illustrative)
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-amber-800">
                      {impactData.overallEstimatedUpliftPp !== null
                        ? `${impactData.overallEstimatedUpliftPp > 0 ? '+' : ''}${impactData.overallEstimatedUpliftPp} pp`
                        : '—'}
                    </span>
                    {impactData.overallEstimatedUpliftPp !== null && (
                      <span className="text-[11px] text-amber-600 font-medium pb-0.5">percentage points</span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Trainee-count-weighted average of stratum-level placement rate differences.
                  </p>

                  {/* Sample counts for transparency */}
                  <div className="flex flex-wrap gap-3 mt-3">
                    {[
                      { label: 'Eligible strata', val: impactData.eligibleBuckets },
                      { label: 'Strata skipped (small sample)', val: impactData.skippedBuckets },
                      { label: 'Trainees in eligible strata', val: impactData.totalTraineesInEligibleBuckets },
                      { label: 'Control records in eligible strata', val: impactData.totalControlsInEligibleBuckets },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center">
                        <div className="text-xs font-black text-amber-900">{val}</div>
                        <div className="text-[10px] text-amber-600">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Methodology summary */}
                <div className="px-3 py-2 bg-amber-100/60 rounded-lg border border-amber-200">
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <span className="font-bold">Matching approach: </span>{impactData.methodology}
                  </p>
                </div>

                {/* Per-Bucket Breakdown — collapsed by default */}
                <div>
                  <button
                    onClick={() => setImpactBucketsExpanded(v => !v)}
                    className="flex items-center gap-2 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors cursor-pointer"
                  >
                    {impactBucketsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {impactBucketsExpanded ? 'Hide' : 'Show'} per-stratum breakdown
                    <span className="text-[10px] font-normal text-amber-600">
                      ({impactData.perBucketBreakdown.length} strata total,{' '}
                      {impactData.perBucketBreakdown.filter(b => b.skipped).length} skipped)
                    </span>
                  </button>

                  {impactBucketsExpanded && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-amber-200">
                      <table className="min-w-full text-[11px]">
                        <thead className="bg-amber-100">
                          <tr>
                            {['Age Band', 'District', 'Qualification', 'Trainees', 'Controls',
                              'Trainee Rate', 'Control Rate', 'Uplift (pp)', 'Status'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-amber-700 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100 bg-white/70">
                          {impactData.perBucketBreakdown.map((row, i) => (
                            <tr key={i} className={row.skipped ? 'opacity-50' : ''}>
                              <td className="px-3 py-2 font-mono text-amber-900">{row.ageBand}</td>
                              <td className="px-3 py-2 text-amber-800">{row.district}</td>
                              <td className="px-3 py-2 text-amber-800">{row.priorQualification}</td>
                              <td className="px-3 py-2 text-center font-bold text-amber-900">{row.traineeCount}</td>
                              <td className="px-3 py-2 text-center text-amber-700">{row.controlCount}</td>
                              <td className="px-3 py-2 text-center">
                                {row.traineePlacementRate !== null ? `${row.traineePlacementRate}%` : '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {row.controlPlacementRate !== null ? `${row.controlPlacementRate}%` : '—'}
                              </td>
                              <td className={`px-3 py-2 text-center font-bold ${
                                row.estimatedUpliftPp === null ? 'text-amber-400'
                                  : row.estimatedUpliftPp > 0 ? 'text-green-700'
                                  : row.estimatedUpliftPp < 0 ? 'text-red-700'
                                  : 'text-amber-700'
                              }`}>
                                {row.estimatedUpliftPp !== null
                                  ? `${row.estimatedUpliftPp > 0 ? '+' : ''}${row.estimatedUpliftPp}`
                                  : '—'}
                              </td>
                              <td className="px-3 py-2">
                                {row.skipped
                                  ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold">Skipped</span>
                                  : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">Eligible</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
