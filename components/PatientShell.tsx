"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Home, LogOut, TrendingUp } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function PatientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  async function signOut() { await createSupabaseBrowserClient().auth.signOut(); router.push("/login"); }
  return <div className="patient-shell">
    <header className="patient-nav"><Link href="/patient" className="brand"><span className="brand-mark">MF</span><strong>Move Free</strong></Link><nav aria-label="Patient navigation"><Link href="/patient"><Home size={17}/>Home</Link><Link href="/patient/program"><Activity size={17}/>Program</Link><Link href="/patient/progress"><TrendingUp size={17}/>Progress</Link><button type="button" onClick={signOut}><LogOut size={17}/>Sign out</button></nav></header>
    <main className="patient-main">{children}</main>
  </div>;
}
