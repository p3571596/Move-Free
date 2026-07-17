"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Home, LayoutDashboard, MessageSquare, Stethoscope, UserRound } from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Stethoscope },
  { href: "/exercise-studio", label: "Exercise Studio", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          return null;
        }

        return supabase
          .from("profiles")
          .select("role")
          .or(`user_id.eq.${data.user.id},id.eq.${data.user.id}`)
          .maybeSingle();
      })
      .then((result) => setIsAdmin(result?.data?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  async function signOut() {
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">MF</span>
          <span>
            <h1>Move Free</h1>
            <p>Clinical MVP</p>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/feedback">
              <MessageSquare size={18} />
              Pilot Command Center
            </Link>
          ) : null}
          <button type="button" onClick={signOut}>
            <UserRound size={18} />
            Sign out
          </button>
        </nav>
      </aside>
      <main className="main">
        <Link className="clinician-home-button" href="/dashboard" aria-label="Return to clinician dashboard">
          <Home size={16} />
          Dashboard
        </Link>
        {children}
      </main>
    </div>
  );
}
