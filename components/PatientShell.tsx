"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Home, LogOut, TrendingUp } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function PatientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() { await createSupabaseBrowserClient().auth.signOut(); router.push("/login"); }
  const navigation = [
    { href: "/patient", label: "Today", icon: Home, exact: true },
    { href: "/patient/program", label: "Program", icon: Activity },
    { href: "/patient/progress", label: "Progress", icon: TrendingUp },
  ];

  return (
    <div className="patient-shell">
      <header className="patient-appbar">
        <Link href="/patient" className="patient-brand" aria-label="Move Free patient home">
          <span className="patient-brand-mark">MF</span>
          <span><strong>Move Free</strong><small>My movement plan</small></span>
        </Link>
        <button className="patient-signout" type="button" onClick={signOut} aria-label="Sign out">
          <LogOut size={19} />
        </button>
      </header>
      <main className="patient-main">{children}</main>
      <nav className="patient-tabbar" aria-label="Patient app navigation">
        {navigation.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={21}/><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
