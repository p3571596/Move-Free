"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (user === undefined) {
    return <div className="empty">Checking secure session...</div>;
  }

  if (!user) {
    return (
      <div className="empty">
        <strong>Secure session required.</strong>
        <p>Connect Supabase env vars and sign in to load protected pilot data.</p>
        <Link className="button" href="/login" style={{ marginTop: 14 }}>
          Go to login
        </Link>
      </div>
    );
  }

  return children;
}
