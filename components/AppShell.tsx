"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Stethoscope,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const primary = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Stethoscope },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];
const more = [
  { href: "/program-builder", label: "Programs", icon: Target },
  { href: "/exercise-studio", label: "Exercise Library", icon: Activity },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/team", label: "Care Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!data.user) return null;
        return supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      })
      .then((result) => setIsAdmin(result?.data?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  async function signOut() {
    if (isSupabaseConfigured()) await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">MF</span>
          <span>
            <h1>Move Free</h1>
            <p>Rehabilitation workspace</p>
          </span>
        </Link>

        <nav className="nav" aria-label="Main">
          {primary.map((item) => <Link href={item.href} key={item.href} className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "active" : undefined}><item.icon size={18}/><span>{item.label}</span></Link>)}
          <details className="more-navigation" key={pathname}>
            <summary>More</summary>
            <div className="more-menu">{more.map((item) => <Link href={item.href} key={item.href} className={pathname.startsWith(item.href) ? "active" : undefined}><item.icon size={18}/><span>{item.label}</span></Link>)}
              {isAdmin ? <Link href="/feedback"><MessageSquare size={18}/>Pilot Feedback</Link> : null}<button type="button" onClick={signOut}><UserRound size={18}/>Sign out</button>
            </div>
          </details>

          <button type="button" onClick={signOut}>
            <UserRound size={18} />
            Sign out
          </button>
        </nav>
      </aside>
      <main className="main">
        <Link className="clinician-home-button" href="/dashboard" aria-label="Return to clinician dashboard">
          <Home size={16} />
          Today
        </Link>
        {children}
      </main>
    </div>
  );
}
