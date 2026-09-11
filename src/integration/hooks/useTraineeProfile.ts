import { useCallback, useEffect, useState } from 'react';
import { ConsentScope, ConsentStateMap, TraineeProfileData } from '../../types';
import { useCoreStore } from '../store/coreStore';

const GITHUB_TOKEN_KEY = 'forge-github-token';
const DEV_DEFAULT_TOKEN = 'dev_trainee';

export interface CreateProfilePayload {
  phoneNumber: string;
  name: string;
  preferredLanguage: string;
  scheme: string;
  courseName: string;
  providerName: string;
  cohortName: string;
  enrolmentDate: string;
  certificationDate?: string | null;
  dateOfBirth?: string | null;
  district?: string | null;
  aadhaarLast4?: string | null;
  /** Optional educational background, used as a stratification signal for
   *  the illustrative impact estimation. Values: "Below 10th" | "10th Pass" | "12th Pass" | "Graduate" */
  priorQualification?: string | null;
  otpVerificationToken?: string;
}

export interface UseTraineeProfileResult {
  token: string;
  loading: boolean;
  error: string | null;
  needsConsent: boolean;
  needsProfile: boolean;
  traineeProfile: TraineeProfileData | null;
  consentState: ConsentStateMap | null;
  refreshProfile: () => Promise<void>;
  submitConsents: (scopes: Record<ConsentScope, boolean>) => Promise<boolean>;
  saveProfile: (payload: CreateProfilePayload) => Promise<boolean>;
}

export function useTraineeProfile(): UseTraineeProfileResult {
  const {
    traineeProfile,
    consentState,
    setTraineeProfile,
    setConsentState,
  } = useCoreStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  // Read GitHub token from localStorage or URL query parameter
  const getActiveToken = useCallback((): string => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get('github_token');
      if (queryToken) {
        localStorage.setItem(GITHUB_TOKEN_KEY, queryToken);
        return queryToken;
      }
      const stored = localStorage.getItem(GITHUB_TOKEN_KEY);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch {
      // Ignore localStorage access failures
    }
    return DEV_DEFAULT_TOKEN;
  }, []);

  const token = getActiveToken();

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    const activeToken = getActiveToken();
    const authHeaders = {
      Authorization: `Bearer ${activeToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    try {
      // 1. Check Consent status via GET /api/consent
      let consentMap: ConsentStateMap = {};
      try {
        const consentRes = await fetch('/api/consent', { headers: authHeaders });
        if (consentRes.ok) {
          const consentJson = await consentRes.json();
          consentMap = consentJson.consent || {};
          setConsentState(consentMap);
        }
      } catch (cErr) {
        console.warn('[useTraineeProfile] Consent check error:', cErr);
      }

      // Check whether any scope is granted
      const grantedScopes = Object.values(consentMap).filter((item) => item?.granted === true);
      const missingConsent = grantedScopes.length === 0;
      setNeedsConsent(missingConsent);

      // 2. Check Profile status via GET /api/trainee/profile
      const profileRes = await fetch('/api/trainee/profile', { credentials: 'omit', headers: authHeaders });

      if (profileRes.status === 404) {
        setTraineeProfile(null);
        // If consent is already completed, prompt profile setup
        setNeedsProfile(true);
      } else if (profileRes.ok) {
        const profileData = await profileRes.json();
        setTraineeProfile(profileData);
        if (profileData.consent) {
          setConsentState(profileData.consent);
          const activeGranted = Object.values(profileData.consent).filter((item: any) => item?.granted === true);
          setNeedsConsent(activeGranted.length === 0);
        }
        const isStub = Boolean(profileData.trainee?.phoneNumber?.startsWith('temp_'));
        const hasEnrolments = Array.isArray(profileData.enrolments) && profileData.enrolments.length > 0;
        setNeedsProfile(isStub || !hasEnrolments);
      } else {
        const errJson = await profileRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Profile fetch failed with status ${profileRes.status}`);
      }
    } catch (err) {
      console.error('[useTraineeProfile] Error loading trainee profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trainee profile');
    } finally {
      setLoading(false);
    }
  }, [getActiveToken, setConsentState, setTraineeProfile]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Submit consent for all 4 scopes (one POST /api/consent call per scope)
  const submitConsents = useCallback(
    async (scopes: Record<ConsentScope, boolean>): Promise<boolean> => {
      setError(null);
      const activeToken = getActiveToken();
      const authHeaders = {
        Authorization: `Bearer ${activeToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      try {
        const entries = Object.entries(scopes) as [ConsentScope, boolean][];
        for (const [scope, granted] of entries) {
          const res = await fetch('/api/consent', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ scope, granted, version: 'v1' }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error || `Failed to record consent for ${scope}`);
          }
        }

        // Refresh profile and consent state after submission
        await refreshProfile();
        return true;
      } catch (err) {
        console.error('[useTraineeProfile] Consent submission failed:', err);
        setError(err instanceof Error ? err.message : 'Consent submission failed');
        return false;
      }
    },
    [getActiveToken, refreshProfile]
  );

  // Submit trainee profile to POST /api/trainee/profile
  const saveProfile = useCallback(
    async (payload: CreateProfilePayload): Promise<boolean> => {
      setError(null);
      const activeToken = getActiveToken();
      const authHeaders = {
        Authorization: `Bearer ${activeToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      try {
        const res = await fetch('/api/trainee/profile', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Failed to save profile (${res.status})`);
        }

        const data = await res.json();
        setTraineeProfile({
          trainee: data.trainee,
          enrolments: data.enrolment ? [data.enrolment] : [],
          consent: consentState || {},
        });
        setNeedsProfile(false);
        await refreshProfile();
        return true;
      } catch (err) {
        console.error('[useTraineeProfile] Save profile failed:', err);
        const message = err instanceof Error ? err.message : 'Save profile failed';
        setError(message);
        throw new Error(message);
      }
    },
    [getActiveToken, consentState, refreshProfile, setTraineeProfile]
  );

  return {
    token,
    loading,
    error,
    needsConsent,
    needsProfile,
    traineeProfile,
    consentState,
    refreshProfile,
    submitConsents,
    saveProfile,
  };
}
