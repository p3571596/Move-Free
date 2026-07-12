"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { getCurrentUser, getEffectiveRole } from "@/lib/data";
import type { Role } from "@/lib/types";

export function RoleGate({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "allowed" | "missing-link">("loading");

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    getCurrentUser(client).then(async (user) => {
      if (!user) return router.replace("/login");
      const role = await getEffectiveRole(client, user);
      if (allowed.includes(role)) return setState("allowed");
      router.replace(role === "patient" ? "/patient" : "/dashboard");
    }).catch(() => setState("missing-link"));
  }, [router, allowed.join(",")]);

  if (state === "loading") return <div className="empty">Loading your secure workspace...</div>;
  if (state === "missing-link") return <div className="empty"><strong>Account setup needs attention.</strong><p>Ask your clinician to link this login to your patient record.</p><Link className="button" href="/login">Back to login</Link></div>;
  return children;
}
