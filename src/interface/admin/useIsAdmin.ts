import { useState, useEffect } from 'react';
import { useTraineeProfile } from '../../integration/hooks/useTraineeProfile';

export function useIsAdmin() {
  const { token } = useTraineeProfile();
  const isDevToken = token === 'dev_trainee' || token.startsWith('mock_') || token.startsWith('dev_');
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isDevToken);
  const [role, setRole] = useState<string | null>(() => (isDevToken ? 'SUPER_ADMIN' : null));
  const [loading, setLoading] = useState(!isDevToken);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      if (!token) {
        if (mounted) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/admin/whoami', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setIsAdmin(true);
            setRole(data.adminUser?.role || null);
          }
        } else {
          if (mounted) {
            setIsAdmin(isDevToken);
            if (isDevToken) setRole('SUPER_ADMIN');
          }
        }
      } catch (err) {
        if (mounted) {
          setIsAdmin(isDevToken);
          if (isDevToken) setRole('SUPER_ADMIN');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    checkAdmin();

    return () => {
      mounted = false;
    };
  }, [token, isDevToken]);

  return { isAdmin, role, loading };
}
