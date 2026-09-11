import React, { useState, useMemo, useRef } from 'react';
import {
  Linkedin,
  Loader2,
  Check,
  Plus,
  FileText,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  UploadCloud,
} from 'lucide-react';
import { useLinkedInData } from '../integration/hooks/useLinkedInData';
import { useCoreStore, type ResumeForgeItem } from '../integration/store/coreStore';
import { USER_COLOR } from '../theme/brand';

export const LinkedInIntegrationView: React.FC = () => {
  const {
    resumeForgeItems,
    setResumeForgeItems,
    updateResumeForgeItemBullet,
    acceptResumeForgeBullet,
    addResumeForgeToLedger,
    skillVerifications,
  } = useCoreStore();

  const { token, clearToken, connectUrl, importProfilePdf, isLoading: linkedInLoading, error: linkedInError } = useLinkedInData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isConnected = useMemo(() => Boolean(token), [token]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const { bullets } = await importProfilePdf(file);
      
      if (bullets.length === 0) {
        throw new Error('Could not extract meaningful experience from this PDF.');
      }

      const generated: ResumeForgeItem[] = bullets.map((bullet, idx) => ({
        id: `li_${Date.now()}_${idx}`,
        repository: 'LinkedIn Experience',
        repositoryUrl: 'https://linkedin.com',
        codeSnapshot: `Imported Achievement #${idx + 1}`,
        suggestedBullet: bullet,
        accepted: false,
        addedToLedger: false,
      }));

      setResumeForgeItems(generated);
      showToast(`Extracted ${bullets.length} achievements successfully!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import PDF');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const verifiedCount = Object.values(skillVerifications).filter((s) => s.verified).length;
  const displayError = error || linkedInError;
  const displayLoading = loading || linkedInLoading;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50">
      {/* Toast */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          {successToast}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <Linkedin size={28} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/60 mb-2">
              <Sparkles size={12} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                Nexus-Writer Profile Analysis
              </span>
            </div>
            <h1 className="text-2xl font-black text-darkDelegation tracking-tight">
              LinkedIn Integration
            </h1>
            <p className="text-xs text-zinc-500 mt-1 max-w-xl leading-relaxed">
              Connect your LinkedIn profile for verified identity, and upload your profile PDF to automatically extract and generate quantifiable STAR resume bullets for your portfolio.
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="flex flex-col gap-2 w-full md:w-auto">
          {isConnected ? (
            <button
              onClick={clearToken}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              Disconnect Identity
            </button>
          ) : (
            <a
              href={connectUrl}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
            >
              <Linkedin size={16} />
              Verify Identity
            </a>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Identity Status</p>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
              <span className="text-sm font-black text-darkDelegation">
                {isConnected ? 'LinkedIn Verified' : 'Not Verified'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Extracted Bullets</p>
          <div className="mt-2 flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <span className="text-xl font-black text-darkDelegation">{resumeForgeItems.length}</span>
            <span className="text-xs text-zinc-400 font-bold">active</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Proof-of-Work Ledger</p>
          <div className="mt-2 flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <span className="text-xl font-black text-darkDelegation">{verifiedCount}</span>
            <span className="text-xs text-zinc-400 font-bold">verified skills</span>
          </div>
        </div>
      </div>

      {/* Error display */}
      {displayError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs font-bold text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <span>{displayError}</span>
        </div>
      )}

      {/* Upload Zone */}
      {isConnected && resumeForgeItems.length === 0 && !displayLoading && (
        <div className="bg-white rounded-3xl p-10 border border-zinc-100 border-dashed text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mx-auto">
            <UploadCloud size={32} />
          </div>
          <div>
            <h3 className="text-base font-black text-darkDelegation">
              Import Profile PDF
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto leading-relaxed">
              Export your LinkedIn profile as a PDF and upload it here. Nexus-Writer will extract your experience and generate high-impact resume bullets.
            </p>
          </div>

          <div className="pt-4 flex justify-center">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <FileText size={16} />
              Select PDF File
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {displayLoading && (
        <div className="bg-white rounded-3xl p-10 border border-zinc-100 text-center space-y-4">
          <Loader2 size={32} className="animate-spin text-blue-600 mx-auto" />
          <h3 className="text-sm font-black text-darkDelegation uppercase tracking-wider">
            Processing Profile Data...
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Extracting professional experience and generating quantified STAR bullet points.
          </p>
        </div>
      )}

      {/* Repositories & Generated Bullet Points List */}
      {!displayLoading && resumeForgeItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">
              Extracted Professional Achievements ({resumeForgeItems.length})
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold uppercase cursor-pointer"
              >
                Upload another PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {resumeForgeItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-5 border border-zinc-100 shadow-xs hover:border-zinc-200 transition-all space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 shrink-0">
                      <Linkedin size={16} />
                    </div>
                    <div>
                      <span className="text-sm font-black text-darkDelegation">
                        {item.repository}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-400 font-mono inline-flex items-center gap-1">
                          {item.codeSnapshot}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.accepted && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        <Check size={10} /> Added to CV
                      </span>
                    )}
                    {item.addedToLedger && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-[10px] font-black uppercase tracking-wider text-purple-700">
                        <ShieldCheck size={10} /> In Proof Ledger
                      </span>
                    )}
                  </div>
                </div>

                {/* Generated Bullet Output */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Quantified Resume Bullet Point (Nexus-Writer Output)
                  </label>
                  <textarea
                    value={item.suggestedBullet}
                    onChange={(e) => updateResumeForgeItemBullet(item.id, e.target.value)}
                    rows={2}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-700 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y"
                    placeholder="Refine bullet point here..."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      acceptResumeForgeBullet(item.id);
                      showToast(`Appended achievement to active resume!`);
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      item.accepted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white'
                    }`}
                  >
                    <Check size={13} />
                    {item.accepted ? 'In Resume Draft' : 'Accept into Resume'}
                  </button>

                  <button
                    onClick={() => {
                      addResumeForgeToLedger(item.id);
                      showToast(`Added achievement to Proof-of-Work Ledger!`);
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      item.addedToLedger
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-600 hover:text-white'
                    }`}
                  >
                    <Plus size={13} />
                    {item.addedToLedger ? 'In Proof Ledger' : 'Add to Proof Ledger'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when disconnected */}
      {!isConnected && !displayLoading && (
        <div className="bg-white rounded-3xl p-12 border border-zinc-100 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 mx-auto">
            <Linkedin size={32} />
          </div>
          <div>
            <h3 className="text-base font-black text-darkDelegation">
              Connect Your LinkedIn Profile
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto leading-relaxed">
              Verify your identity with LinkedIn to enable secure profile importing and resume building features.
            </p>
          </div>

          <div className="pt-2">
            <a
              href={connectUrl}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Linkedin size={15} />
              Verify Identity
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInIntegrationView;
