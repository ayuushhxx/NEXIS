import React, { useState, useEffect } from 'react';
import { Target, ExternalLink, Loader2, Sparkles, Briefcase } from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import { useCoreStore } from '../integration/store/coreStore';
import EmptySectionView from './EmptySectionView';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';
import { DiscoveredJob } from '../types';

export const JobMatchesView: React.FC = () => {
  const { skillProfile, jobMatchesCurrent, jobMatchesReachable, setJobMatches } = useUiStore();
  const { currentResume, runtimeKeys, userCareerProfile } = useCoreStore();
  const [mode, setMode] = useState<'current' | 'reachable'>('current');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentJobs = mode === 'current' ? jobMatchesCurrent : jobMatchesReachable;

  useEffect(() => {
    if (!skillProfile || currentJobs.length > 0) return;

    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const targetRole = currentResume.targetJD.trim().split('\n')[0]?.slice(0, 120) || userCareerProfile.targetRole || 'AI Engineer';
        
        const res = await fetch('/api/jobs/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resume: currentResume.content,
            targetRole,
            key: runtimeKeys.gemini,
            serperKey: runtimeKeys.sarvam, // Reusing sarvam key slot for serper if configured there, or default fallback
            mode,
            skillProfile,
          }),
        });

        const raw = await res.text();
        let json: any = null;
        try { json = JSON.parse(raw); } catch { }
        
        if (!res.ok || !json) {
          throw new Error(json?.error || 'Nexus-Hunter discovery failed');
        }

        const mapped: DiscoveredJob[] = (Array.isArray(json.items) ? json.items : []).map((item: any, idx: number) => ({
          id: `job_${Date.now()}_${idx}`,
          title: String(item.job_title || 'Target Role'),
          company: String(item.company_name || 'Company'),
          url: String(item.application_link || '#'),
          alignmentScore: Number(item.alignment_score || 80),
          blueOceanScore: Number(item.blue_ocean_score || 75),
          nexusMatchReason: String(item.nexus_match_reason || 'Strong fit based on Nexus profile.'),
          competitionLevel: (String(item.competition_level || 'Medium') as 'Low' | 'Medium' | 'High'),
          discoveredAt: Date.now(),
          source: (String(item.source || 'hidden') as 'linkedin' | 'company-careers' | 'hidden'),
        }));

        setJobMatches(mode, mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nexus-Hunter failed');
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [mode, skillProfile, jobMatchesCurrent.length, jobMatchesReachable.length, currentResume, runtimeKeys, userCareerProfile.targetRole, setJobMatches]);

  if (!skillProfile || !currentResume.content) {
    return <EmptySectionView tab="job-matches" />;
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: USER_COLOR_LIGHT }}>
          <Briefcase size={16} strokeWidth={2.5} style={{ color: USER_COLOR }} />
        </div>
        <div>
          <h1 className="text-base font-black text-zinc-900 leading-tight">Job Matches</h1>
          <p className="text-[11px] text-zinc-400 font-medium">Discovered via Nexus-Hunter</p>
        </div>
        <div className="ml-auto flex items-center gap-2 p-1 bg-zinc-200/50 rounded-xl">
          <button
            onClick={() => setMode('current')}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
              mode === 'current' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Current Fit
          </button>
          <button
            onClick={() => setMode('reachable')}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 ${
              mode === 'reachable' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Sparkles size={12} className={mode === 'reachable' ? '' : 'opacity-50'} style={{ color: mode === 'reachable' ? USER_COLOR : undefined }} />
            Reachable
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm">
          <Loader2 size={24} className="animate-spin text-zinc-300 mb-3" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Running Nexus-Hunter...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium">
          {error}
        </div>
      )}

      {!loading && !error && currentJobs.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm">
          <Target size={24} className="text-zinc-300 mb-3" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No prime targets discovered yet</p>
        </div>
      )}

      {!loading && !error && currentJobs.length > 0 && (
        <div className="flex flex-col gap-3">
          {currentJobs.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-zinc-900">{job.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{job.company}</p>
                </div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                  style={{ background: USER_COLOR_LIGHT, color: USER_COLOR }}
                >
                  Apply
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="text-zinc-500 font-semibold uppercase tracking-wider">Alignment</span>
                  <span className="font-black text-emerald-600">{Math.round(job.alignmentScore)}%</span>
                </div>
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="text-zinc-500 font-semibold uppercase tracking-wider">Blue Ocean</span>
                  <span className="font-black text-blue-600">{Math.round(job.blueOceanScore)}%</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-600 font-medium leading-relaxed">
                {job.nexusMatchReason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobMatchesView;
