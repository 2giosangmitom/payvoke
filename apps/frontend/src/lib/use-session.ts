import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";

export function useSession() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const {
        data: { subscription },
      } = getSupabase().auth.onAuthStateChange((_event, session) => {
        setAccountId(session?.user.id ?? null);
        setChecking(false);
      });
      return () => subscription.unsubscribe();
    } catch {
      setChecking(false);
      setError("Sign-in is not configured. Contact the site administrator.");
      return undefined;
    }
  }, []);
  return { accountId, checking, error };
}
