import React, { useState, useEffect, useCallback } from 'react';
import { useIsAdmin } from './useIsAdmin';
import { useTraineeProfile } from '../../integration/hooks/useTraineeProfile';
import { AlertCircle, CheckCircle2, Search, Loader2, XCircle, Users } from 'lucide-react';
import { USER_COLOR, USER_COLOR_LIGHT } from '../../theme/brand';

interface TraineeSummary {
  id: string;
  name: string;
  phoneNumber: string;
  dateOfBirth: string | null;
  district: string | null;
  enrolments: any[];
}

interface DedupCandidate {
  id: string;
  traineeA: TraineeSummary;
  traineeB: TraineeSummary;
  matchScore: number;
  matchReasons: string[];
}

export const DedupReviewPanel: React.FC = () => {
  const { isAdmin, role, loading: adminLoading } = useIsAdmin();
  const { token } = useTraineeProfile();

  const [candidates, setCandidates] = useState<DedupCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // OTP Flow State
  const [mergeCandidate, setMergeCandidate] = useState<DedupCandidate | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'IDLE' | 'SENDING' | 'OTP_INPUT' | 'VERIFYING'>('IDLE');
  const [otpError, setOtpError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    if (role !== 'REVIEWER' && role !== 'SUPER_ADMIN') return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dedup-candidates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch candidates');
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching candidates');
    } finally {
      setLoading(false);
    }
  }, [token, role]);

  useEffect(() => {
    if (isAdmin && (role === 'REVIEWER' || role === 'SUPER_ADMIN')) {
      fetchCandidates();
    }
  }, [isAdmin, role, fetchCandidates]);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setScanSummary(null);
    try {
      const res = await fetch('/api/admin/run-dedup-scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();
      setScanSummary({ scanned: data.scanned, created: data.created, skipped: data.skipped });
      if (role === 'REVIEWER' || role === 'SUPER_ADMIN') {
        await fetchCandidates();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error running scan');
    } finally {
      setScanning(false);
    }
  };

  const resolveCandidate = async (id: string, action: 'MERGE' | 'REJECT', otpVerificationToken?: string) => {
    try {
      const payload: any = { action };
      if (otpVerificationToken) payload.otpVerificationToken = otpVerificationToken;

      const res = await fetch(`/api/admin/dedup-candidates/${id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to ${action} candidate`);
      }
      // Remove candidate from list locally to feel responsive
      setCandidates(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error resolving candidate as ${action}`);
      return false;
    }
  };

  const handleInitiateMerge = async (candidate: DedupCandidate) => {
    setMergeCandidate(candidate);
    setOtpStep('SENDING');
    setOtpError(null);
    setOtpCode('');
    
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: candidate.traineeA.phoneNumber })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send OTP to Trainee A');
      }
      setOtpStep('OTP_INPUT');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to send OTP');
      setOtpStep('IDLE');
    }
  };

  const handleVerifyAndMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeCandidate || otpCode.length !== 6) return;
    
    setOtpStep('VERIFYING');
    setOtpError(null);

    try {
      // 1. Verify OTP
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: mergeCandidate.traineeA.phoneNumber, code: otpCode })
      });
      
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid OTP');
      }
      
      const { verificationToken } = await verifyRes.json();
      
      // 2. Resolve MERGE with token
      const success = await resolveCandidate(mergeCandidate.id, 'MERGE', verificationToken);
      
      if (success) {
        setMergeCandidate(null);
        setOtpStep('IDLE');
      } else {
        setOtpStep('OTP_INPUT');
        setOtpError('OTP verified, but merge failed. Check main error alert.');
      }
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to verify OTP');
      setOtpStep('OTP_INPUT');
    }
  };

  if (adminLoading) {
    return <div className="p-8 text-center text-zinc-500">Loading admin context...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-xl m-4">
        <AlertCircle className="mx-auto mb-2" size={24} />
        <h2 className="font-bold">Access Denied</h2>
        <p className="text-sm mt-1">You do not have permission to view the admin deduplication panel.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-darkDelegation tracking-tight flex items-center gap-2">
            <Users size={24} style={{ color: USER_COLOR }} />
            Trainee Deduplication
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Identify and merge duplicate trainee profiles across schemes.
          </p>
        </div>

        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-darkDelegation text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Run Similarity Scan
        </button>
      </div>

      {scanSummary && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <div>
            <h3 className="text-sm font-bold text-blue-900">Scan Complete</h3>
            <p className="text-xs text-blue-800 mt-1">
              Scanned {scanSummary.scanned} pairs, found {scanSummary.created} new candidates, skipped {scanSummary.skipped} already-flagged pairs.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {(role === 'REVIEWER' || role === 'SUPER_ADMIN') ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-800">Pending Review ({candidates.length})</h2>
          
          {loading ? (
            <div className="p-8 text-center text-zinc-500"><Loader2 className="animate-spin mx-auto" /></div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-100">
              No pending candidates. Run a scan to find potential duplicates.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {candidates.map(candidate => (
                <div key={candidate.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Card Header */}
                  <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 rounded bg-orange-100 text-orange-800 text-xs font-bold font-mono">
                        Score: {candidate.matchScore.toFixed(3)}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {candidate.matchReasons.map((r, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded-sm bg-zinc-200 text-zinc-700 text-[10px] uppercase font-bold tracking-wider">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveCandidate(candidate.id, 'REJECT')}
                        className="px-3 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-bold uppercase hover:bg-red-50 transition-colors flex items-center gap-1"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        onClick={() => handleInitiateMerge(candidate)}
                        className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-xs font-bold uppercase hover:bg-black transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Merge into A
                      </button>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200">
                    {/* Trainee A (Canonical) */}
                    <div className="p-4 bg-green-50/30">
                      <div className="text-[10px] font-black uppercase text-green-700 mb-2">Record A (Canonical)</div>
                      <h3 className="font-bold text-zinc-900">{candidate.traineeA.name}</h3>
                      <p className="text-sm font-mono text-zinc-600 mt-1">{candidate.traineeA.phoneNumber}</p>
                      <div className="mt-2 text-xs text-zinc-500 space-y-1">
                        <p>DOB: {candidate.traineeA.dateOfBirth ? new Date(candidate.traineeA.dateOfBirth).toISOString().split('T')[0] : 'N/A'}</p>
                        <p>District: {candidate.traineeA.district || 'N/A'}</p>
                        <p>Enrolments: {candidate.traineeA.enrolments.length}</p>
                      </div>
                      {candidate.traineeA.enrolments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {candidate.traineeA.enrolments.map(e => (
                            <div key={e.id} className="p-2 rounded bg-white border border-green-100 text-xs">
                              <div className="font-bold">{e.scheme} - {e.courseName}</div>
                              <div className="text-zinc-500">{e.providerName} • {new Date(e.enrolmentDate).toLocaleDateString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Trainee B (Will be merged) */}
                    <div className="p-4 bg-red-50/30">
                      <div className="text-[10px] font-black uppercase text-red-700 mb-2">Record B (Will Soft-Delete)</div>
                      <h3 className="font-bold text-zinc-900">{candidate.traineeB.name}</h3>
                      <p className="text-sm font-mono text-zinc-600 mt-1">{candidate.traineeB.phoneNumber}</p>
                      <div className="mt-2 text-xs text-zinc-500 space-y-1">
                        <p>DOB: {candidate.traineeB.dateOfBirth ? new Date(candidate.traineeB.dateOfBirth).toISOString().split('T')[0] : 'N/A'}</p>
                        <p>District: {candidate.traineeB.district || 'N/A'}</p>
                        <p>Enrolments: {candidate.traineeB.enrolments.length}</p>
                      </div>
                      {candidate.traineeB.enrolments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {candidate.traineeB.enrolments.map(e => (
                            <div key={e.id} className="p-2 rounded bg-white border border-red-100 text-xs">
                              <div className="font-bold">{e.scheme} - {e.courseName}</div>
                              <div className="text-zinc-500">{e.providerName} • {new Date(e.enrolmentDate).toLocaleDateString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-center text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-200">
          You are an Analyst. You can trigger scans, but only Reviewers and Super Admins can resolve candidates.
        </div>
      )}

      {/* OTP Modal for Merge */}
      {mergeCandidate && otpStep !== 'IDLE' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Merge Confirmation</h3>
            <p className="text-sm text-zinc-600 mb-4">
              {otpStep === 'SENDING' 
                ? 'Sending OTP to Trainee A...' 
                : <>Ask the trainee for the 6-digit code sent to <b>{mergeCandidate.traineeA.phoneNumber}</b> to authorize this merge.</>}
            </p>
            
            {otpError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100 flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{otpError}</span>
              </div>
            )}

            {otpStep === 'OTP_INPUT' || otpStep === 'VERIFYING' || otpError ? (
              <form onSubmit={handleVerifyAndMerge} className="flex flex-col gap-4">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-3xl font-mono tracking-[0.5em] bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                />
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => { setMergeCandidate(null); setOtpStep('IDLE'); }}
                    className="px-4 py-2 rounded-lg text-zinc-500 hover:bg-zinc-100 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={otpStep === 'VERIFYING' || otpCode.length !== 6}
                    className="flex items-center gap-2 px-4 py-2 bg-darkDelegation text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {otpStep === 'VERIFYING' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Confirm Merge
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
