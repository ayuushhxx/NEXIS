import React, { useState } from 'react';
import { FileText, Download, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import { useCoreStore } from '../integration/store/coreStore';
import EmptySectionView from './EmptySectionView';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';

export const NewCVView: React.FC = () => {
  const { skillProfile } = useUiStore();
  const { currentResume, structuredResume, runtimeKeys } = useCoreStore();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Check if we have tailored content (Phase 1 must have been run)
  const hasTailoredContent =
    currentResume.content.trim().length > 50 && skillProfile !== null;

  if (!hasTailoredContent) {
    return <EmptySectionView tab="new-cv" />;
  }

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);

    try {
      const res = await fetch('/api/resume/render-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredResume: structuredResume || undefined,
          resume: currentResume.content,
          jd: currentResume.targetJD,
          keys: {
            sarvam: runtimeKeys.sarvam,
            gemini: runtimeKeys.gemini,
          },
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `PDF generation failed (${res.status})`);
      }

      // Stream the PDF blob to a download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus-cv-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setDownloading(false);
    }
  };

  // Preview a first few sections from the tailored content
  const contentLines = currentResume.content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const previewLines = contentLines.slice(0, 18);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: USER_COLOR_LIGHT }}
        >
          <FileText size={16} strokeWidth={2.5} style={{ color: USER_COLOR }} />
        </div>
        <div>
          <h1 className="text-base font-black text-zinc-900 leading-tight">New CV</h1>
          <p className="text-[11px] text-zinc-400 font-medium">
            {skillProfile?.jd_role_title
              ? `Tailored for ${skillProfile.jd_role_title}`
              : 'AI-optimised for your target role'}
          </p>
        </div>
      </div>

      {/* Review disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-100 bg-amber-50">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
        <p className="text-xs font-medium text-amber-800 leading-relaxed">
          Rewritten based on your original resume — please review before sending. The AI only
          uses facts present in your uploaded resume; no skills or achievements have been added.
        </p>
      </div>

      {/* Download button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          style={{ background: USER_COLOR, color: '#fff' }}
        >
          {downloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {downloading ? 'Generating PDF…' : 'Download PDF'}
        </button>

        {downloadSuccess && (
          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
            <CheckCircle size={14} />
            Downloaded!
          </div>
        )}
        {downloadError && (
          <p className="text-xs text-red-600 font-medium">{downloadError}</p>
        )}
      </div>

      {/* Resume text preview */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 flex flex-col gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Tailored Content Preview
        </p>
        <div className="font-mono text-xs text-zinc-700 leading-relaxed space-y-1 max-h-96 overflow-y-auto pr-1">
          {previewLines.map((line, i) => (
            <p
              key={i}
              className={
                line.toUpperCase() === line && line.length > 3
                  ? 'font-black text-zinc-900 mt-3 first:mt-0'
                  : ''
              }
            >
              {line}
            </p>
          ))}
          {contentLines.length > 18 && (
            <p className="text-zinc-400 italic mt-2">
              … {contentLines.length - 18} more lines — download PDF for full output.
            </p>
          )}
        </div>
      </div>

      {/* Skills that were used */}
      {skillProfile?.candidate_skills && skillProfile.candidate_skills.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">
            Skills From Your Resume Used In This CV
          </p>
          <div className="flex flex-wrap gap-2">
            {skillProfile.candidate_skills.map((s) => (
              <span
                key={s.skill}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={
                  s.demonstrated
                    ? { background: USER_COLOR_LIGHT, color: USER_COLOR, border: `1px solid ${USER_COLOR}33` }
                    : { background: '#f4f4f5', color: '#71717a', border: '1px solid #e4e4e7' }
                }
              >
                {s.skill}
                {!s.demonstrated && ' ·'}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            Highlighted = demonstrated with evidence · Faded = listed only
          </p>
        </div>
      )}
    </div>
  );
};

export default NewCVView;
