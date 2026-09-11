import React, { useEffect, useState } from 'react';
import { GraduationCap, ExternalLink, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import { useCoreStore } from '../integration/store/coreStore';
import EmptySectionView from './EmptySectionView';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';
import { CandidateSkill } from '../types';

export const RecommendedProgramsView: React.FC = () => {
  const { skillProfile, recommendedPrograms, setRecommendedPrograms } = useUiStore();
  const { runtimeKeys } = useCoreStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateNames = new Set((skillProfile?.candidate_skills || []).map((s: CandidateSkill) => s.skill.toLowerCase()));
  const requiredGaps = (skillProfile?.jd_required_skills || []).filter((s) => !candidateNames.has(s.toLowerCase()));
  const niceGaps = (skillProfile?.jd_nice_to_have_skills || []).filter((s) => !candidateNames.has(s.toLowerCase()));
  const allGaps = [...requiredGaps, ...niceGaps];

  useEffect(() => {
    if (!skillProfile || allGaps.length === 0 || Object.keys(recommendedPrograms).length > 0) return;

    const fetchPrograms = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/programs/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gaps: allGaps,
            key: runtimeKeys.gemini,
            serperKey: runtimeKeys.sarvam,
          }),
        });

        const json = await res.json();
        
        if (!res.ok || !json.programs) {
          throw new Error(json?.error || 'Failed to fetch recommended programs');
        }

        setRecommendedPrograms(json.programs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Program discovery failed');
      } finally {
        setLoading(false);
      }
    };

    fetchPrograms();
  }, [skillProfile, Object.keys(recommendedPrograms).length, runtimeKeys, setRecommendedPrograms]); // Dependencies simplified to avoid infinite loops

  if (!skillProfile) {
    return <EmptySectionView tab="recommended-programs" />;
  }

  const renderCourseList = (skill: string) => {
    const courses = recommendedPrograms[skill];
    if (!courses) {
      return null;
    }
    if (courses.length === 0) {
      return (
        <p className="text-xs text-zinc-500 italic mt-2 ml-1">No programs found for this skill yet.</p>
      );
    }
    return (
      <div className="grid gap-2 mt-3">
        {courses.map((course, idx) => (
          <a
            key={idx}
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-100 p-3 rounded-xl hover:border-zinc-200 hover:bg-zinc-100/50 transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-800 truncate group-hover:text-zinc-900 transition-colors">
                {course.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{course.provider}</span>
                {course.isFree && (
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-wider">Free</span>
                )}
              </div>
            </div>
            <div className="shrink-0 w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 group-hover:border-zinc-300 transition-all">
              <ChevronRight size={14} strokeWidth={3} />
            </div>
          </a>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: USER_COLOR_LIGHT }}>
          <GraduationCap size={16} strokeWidth={2.5} style={{ color: USER_COLOR }} />
        </div>
        <div>
          <h1 className="text-base font-black text-zinc-900 leading-tight">Recommended Programs</h1>
          <p className="text-[11px] text-zinc-400 font-medium">Targeted upskilling for your skill gaps</p>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm">
          <Loader2 size={24} className="animate-spin text-zinc-300 mb-3" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Searching course catalogs...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium">
          {error}
        </div>
      )}

      {!loading && !error && allGaps.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-6 text-center">
          <BookOpen size={24} className="text-zinc-300 mb-3 mx-auto" />
          <p className="text-sm font-black text-zinc-900 mb-1">No Skill Gaps Detected!</p>
          <p className="text-xs font-medium text-zinc-500">You already possess all the required and nice-to-have skills for this role.</p>
        </div>
      )}

      {!loading && !error && allGaps.length > 0 && (
        <div className="flex flex-col gap-4">
          {requiredGaps.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-3 px-1">Critical Priority (Required Gaps)</p>
              <div className="flex flex-col gap-4">
                {requiredGaps.slice(0, 3).map(skill => (
                  <div key={skill} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[11px] font-bold select-none">
                        {skill}
                      </span>
                    </div>
                    {renderCourseList(skill)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {niceGaps.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-3 px-1">Secondary Priority (Nice-to-Have Gaps)</p>
              <div className="flex flex-col gap-4">
                {niceGaps.slice(0, 2).map(skill => (
                  <div key={skill} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[11px] font-bold select-none">
                        {skill}
                      </span>
                    </div>
                    {renderCourseList(skill)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecommendedProgramsView;
