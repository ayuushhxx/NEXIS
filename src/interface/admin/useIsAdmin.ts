import { useState, useEffect } from 'react';
import { useTraineeProfile } from '../../integration/hooks/useTraineeProfile';

export function useIsAdmin() {
  const { token } = useTraineeProfile();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
            setIsAdmin(false);
          }
        }
      } catch (err) {
        if (mounted) {
          setIsAdmin(false);
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
  }, [token]);

  return { isAdmin, role, loading };
}
