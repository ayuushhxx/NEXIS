import React, { useEffect, useState } from 'react';
import {
  MessageSquare, Loader2, ChevronRight, Lightbulb, BookOpen,
  AlertTriangle, Sparkles, Trophy
} from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import { useCoreStore } from '../integration/store/coreStore';
import EmptySectionView from './EmptySectionView';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';
import { CandidateSkill } from '../types';

const CATEGORY_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'technical': { label: 'Technical', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'behavioral': { label: 'Behavioral', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'system-design': { label: 'System Design', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
};

interface FocusArea {
  category: string;
  topic: string;
  why: string;
  tip: string;
}

interface GapTopic {
  skill: string;
  likely_question_angle: string;
  prep_suggestion: string;
}

interface InterviewBrief {
  focus_areas: FocusArea[];
  gap_topics: GapTopic[];
  key_strength_to_lead_with: string;
  overall_readiness_note: string;
}

export const InterviewPrepView: React.FC = () => {
  const { skillProfile } = useUiStore();
  const { runtimeKeys, setNexusMirrorOpen } = useCoreStore();
  const [brief, setBrief] = useState<InterviewBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateNames = new Set(
    (skillProfile?.candidate_skills || []).map((s: CandidateSkill) => s.skill.toLowerCase())
  );
  const requiredGaps = (skillProfile?.jd_required_skills || []).filter(
    (s) => !candidateNames.has(s.toLowerCase())
  );
  const niceGaps = (skillProfile?.jd_nice_to_have_skills || []).filter(
    (s) => !candidateNames.has(s.toLowerCase())
  );
  const matchedSkills = skillProfile?.matched_required || [];

  useEffect(() => {
    if (!skillProfile || brief) return;

    const fetchBrief = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/interview/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleTitle: skillProfile.jd_role_title || 'target role',
            seniority: skillProfile.jd_seniority || '',
            requiredGaps,
            niceGaps,
            matchedSkills,
            key: runtimeKeys.gemini,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Brief generation failed');
        setBrief(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Brief generation failed');
      } finally {
        setLoading(false);
      }
    };

    fetchBrief();
  }, [skillProfile]); // Re-run when skillProfile changes (new upload)

  if (!skillProfile) return <EmptySectionView tab="interview-prep" />;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: USER_COLOR_LIGHT }}
          >
            <MessageSquare size={16} strokeWidth={2.5} style={{ color: USER_COLOR }} />
          </div>
          <div>
            <h1 className="text-base font-black text-zinc-900 leading-tight">Interview Prep</h1>
            <p className="text-[11px] text-zinc-400 font-medium">
              {skillProfile.jd_seniority} {skillProfile.jd_role_title}
            </p>
          </div>
        </div>
        {/* Launch Full Simulator */}
        <button
          onClick={() => setNexusMirrorOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors"
          style={{ background: USER_COLOR, color: '#fff' }}
        >
          <Sparkles size={12} />
          Start Full Mock
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm">
          <Loader2 size={24} className="animate-spin text-zinc-300 mb-3" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Generating your pre-brief…</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium">
          {error}
        </div>
      )}

      {!loading && brief && (
        <>
          {/* Strength to lead with */}
          {brief.key_strength_to_lead_with && (
            <div
              className="rounded-2xl border p-4 flex items-start gap-3"
              style={{ background: USER_COLOR_LIGHT, borderColor: `${USER_COLOR}33` }}
            >
              <Trophy size={16} className="shrink-0 mt-0.5" style={{ color: USER_COLOR }} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: USER_COLOR }}>
                  Lead With This
                </p>
                <p className="text-sm font-bold text-zinc-900">{brief.key_strength_to_lead_with}</p>
              </div>
            </div>
          )}

          {/* Overall readiness note */}
          {brief.overall_readiness_note && (
            <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm p-4 flex items-start gap-3">
              <BookOpen size={16} className="shrink-0 mt-0.5 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-600 leading-relaxed">{brief.overall_readiness_note}</p>
            </div>
          )}

          {/* Focus areas */}
          {brief.focus_areas.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-3 px-1">
                Focus Areas
              </p>
              <div className="flex flex-col gap-3">
                {brief.focus_areas.map((area, i) => {
                  const style = CATEGORY_STYLES[area.category] || CATEGORY_STYLES['technical'];
                  return (
                    <div key={i} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider"
                          style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
                        >
                          {style.label}
                        </span>
                        <span className="text-sm font-black text-zinc-900">{area.topic}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mb-2 leading-relaxed">{area.why}</p>
                      <div className="flex items-start gap-2 bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                        <Lightbulb size={12} className="shrink-0 mt-0.5 text-amber-500" />
                        <p className="text-xs text-zinc-700 font-medium leading-relaxed">{area.tip}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gap-specific topics */}
          {brief.gap_topics.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-3 px-1">
                Expect Questions On Your Gaps
              </p>
              <div className="flex flex-col gap-3">
                {brief.gap_topics.map((topic, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={13} className="shrink-0 text-orange-500" />
                      <span className="text-sm font-black text-zinc-900">{topic.skill}</span>
                    </div>
                    <p className="text-xs text-zinc-600 mb-2 italic leading-relaxed">
                      "{topic.likely_question_angle}"
                    </p>
                    <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <ChevronRight size={12} className="shrink-0 mt-0.5 text-amber-600" />
                      <p className="text-xs text-amber-800 font-medium leading-relaxed">{topic.prep_suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA to launch full mock */}
          <div className="mt-2 rounded-2xl border border-zinc-200/80 bg-white shadow-sm p-5 text-center">
            <p className="text-xs font-bold text-zinc-500 mb-3">
              Ready to test yourself under real interview pressure?
            </p>
            <button
              onClick={() => setNexusMirrorOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-colors"
              style={{ background: USER_COLOR, color: '#fff' }}
            >
              <Sparkles size={14} />
              Launch Nexus-Mirror Full Simulation
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default InterviewPrepView;
