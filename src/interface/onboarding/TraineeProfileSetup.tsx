import React, { useState } from 'react';
import { UserCheck, Loader2, ArrowRight, AlertCircle, Sparkles, Building2, Calendar, BookOpen } from 'lucide-react';
import { CreateProfilePayload } from '../../integration/hooks/useTraineeProfile';
import { USER_COLOR, USER_COLOR_LIGHT } from '../../theme/brand';

interface TraineeProfileSetupProps {
  onProfileSaved: (payload: CreateProfilePayload) => Promise<boolean>;
}

export const TraineeProfileSetup: React.FC<TraineeProfileSetupProps> = ({ onProfileSaved }) => {
  const [formData, setFormData] = useState<CreateProfilePayload>(() => ({
    phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
    name: 'Aarav Sharma',
    preferredLanguage: 'en',
    scheme: 'PMKVY 4.0',
    courseName: 'Full-Stack Software Development',
    providerName: 'Skill India Training Partner',
    cohortName: 'Cohort-2024-A',
    enrolmentDate: new Date().toISOString().split('T')[0],
  }));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState<'FORM' | 'OTP'>('FORM');
  const [otpCode, setOtpCode] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client validation
    if (!formData.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!formData.phoneNumber.trim()) {
      setError('Phone number is required.');
      return;
    }
    if (!formData.scheme.trim()) {
      setError('Scheme is required.');
      return;
    }
    if (!formData.courseName.trim()) {
      setError('Course name is required.');
      return;
    }
    if (!formData.providerName.trim()) {
      setError('Training provider name is required.');
      return;
    }
    if (!formData.cohortName.trim()) {
      setError('Cohort name is required.');
      return;
    }
    if (!formData.enrolmentDate) {
      setError('Enrolment date is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formData.phoneNumber })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send OTP');
      }
      setOtpStep('OTP');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!otpCode.trim() || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formData.phoneNumber, code: otpCode })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to verify OTP');
      }
      
      const data = await res.json();
      const payload = { ...formData, otpVerificationToken: data.verificationToken };
      
      const success = await onProfileSaved(payload);
      if (!success) {
        setError('Failed to create trainee record. Please check your details and try again.');
        setOtpStep('FORM'); // Go back on failure
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 pointer-events-auto overflow-hidden">
      {/* Frosted Glass Backdrop */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xl animate-in fade-in duration-500" />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] p-6 md:p-8 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/80 mb-2">
              <Sparkles size={13} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                Step 2 of 2 • Unified Trainee Record
              </span>
            </div>
            <h2 className="text-2xl font-black text-darkDelegation tracking-tight leading-tight">
              Create Your Trainee Profile
            </h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Link your vocational scheme enrolment, certification history, and identity to unlock automated job discovery and follow-up outcome tracking.
            </p>
          </div>

          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 hidden sm:flex"
            style={{ backgroundColor: USER_COLOR_LIGHT }}
          >
            <UserCheck size={22} style={{ color: USER_COLOR }} />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 font-medium flex items-center gap-2 shrink-0">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        {otpStep === 'FORM' ? (
        <form onSubmit={handleSendOtp} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {/* Section 1: Candidate Identity */}
            <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-200/70 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                <UserCheck size={13} />
                <span>Identity Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Aarav Sharma"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Phone Number (E.164) *
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    placeholder="+919876543210"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Date of Birth <span className="font-normal text-zinc-400">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth || ''}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    District <span className="font-normal text-zinc-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="district"
                    value={formData.district || ''}
                    onChange={handleChange}
                    placeholder="e.g. Pune"
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Aadhaar Last 4 <span className="font-normal text-zinc-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="aadhaarLast4"
                    value={formData.aadhaarLast4 || ''}
                    onChange={handleChange}
                    placeholder="e.g. 1234"
                    maxLength={4}
                    pattern="\d{4}"
                    title="Must be exactly 4 digits"
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 font-mono tracking-widest"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Prior Qualification <span className="font-normal text-zinc-400">(Optional)</span>
                  </label>
                  <select
                    name="priorQualification"
                    value={formData.priorQualification || ''}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                  >
                    <option value="">Not specified</option>
                    <option value="Below 10th">Below 10th</option>
                    <option value="10th Pass">10th Pass</option>
                    <option value="12th Pass">12th Pass</option>
                    <option value="Graduate">Graduate</option>
                  </select>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Helps improve outcome analysis accuracy
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Preferred Language
                  </label>
                  <select
                    name="preferredLanguage"
                    value={formData.preferredLanguage}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 cursor-pointer"
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi (हिंदी)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Vocational Enrolment */}
            <div className="p-4 rounded-2xl bg-zinc-50/70 border border-zinc-200/70 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                <BookOpen size={13} />
                <span>Training & Scheme Enrolment</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Skill Scheme *
                  </label>
                  <input
                    type="text"
                    name="scheme"
                    value={formData.scheme}
                    onChange={handleChange}
                    placeholder="e.g. PMKVY, ITI, DDU-GKY"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Course / Trade Name *
                  </label>
                  <input
                    type="text"
                    name="courseName"
                    value={formData.courseName}
                    onChange={handleChange}
                    placeholder="e.g. Full-Stack Web Development"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Training Provider / Center *
                  </label>
                  <input
                    type="text"
                    name="providerName"
                    value={formData.providerName}
                    onChange={handleChange}
                    placeholder="e.g. NSDC Partner Institute"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Cohort / Batch Name *
                  </label>
                  <input
                    type="text"
                    name="cohortName"
                    value={formData.cohortName}
                    onChange={handleChange}
                    placeholder="e.g. 2024-Q3-Batch"
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Enrolment Date *
                  </label>
                  <input
                    type="date"
                    name="enrolmentDate"
                    value={formData.enrolmentDate}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-darkDelegation/20 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-5 mt-3 border-t border-zinc-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-darkDelegation text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating Record...
                </>
              ) : (
                <>
                  Complete Setup & Open Dashboard
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex-1 flex flex-col min-h-0 justify-center items-center py-8">
            <h3 className="text-xl font-black text-zinc-900 mb-2">Verify Phone Number</h3>
            <p className="text-sm text-zinc-500 mb-8 text-center max-w-sm leading-relaxed">
              We've sent a 6-digit verification code to <span className="font-mono text-zinc-800 font-bold bg-zinc-100 px-1 py-0.5 rounded">{formData.phoneNumber}</span>.
            </p>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-4xl font-mono tracking-[0.5em] w-72 bg-white border-2 border-zinc-200 rounded-2xl px-4 py-4 text-zinc-900 focus:outline-none focus:border-darkDelegation focus:ring-4 focus:ring-darkDelegation/10 mb-8 shadow-inner"
            />
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setOtpStep('FORM')}
                className="px-6 py-3 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 text-sm font-bold transition-colors"
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting || otpCode.length !== 6}
                className="inline-flex items-center gap-2 px-8 py-3 bg-darkDelegation text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Verify & Complete'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TraineeProfileSetup;
