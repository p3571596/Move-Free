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

const sections = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Today", icon: LayoutDashboard },
      { href: "/patients", label: "Patients", icon: Stethoscope },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
    ],
  },
  {
    label: "Care",
    items: [
      { href: "/program-builder", label: "Programs", icon: Target },
      { href: "/exercise-studio", label: "Exercise Library", icon: Activity },
      { href: "/messages", label: "Messages", icon: MessageSquare, preview: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/outcomes", label: "Outcomes", icon: BarChart3, preview: true },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/team", label: "Team", icon: Users, preview: true },
      { href: "/settings", label: "Settings", icon: Settings, preview: true },
    ],
  },
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
          {sections.map((section) => (
            <div key={section.label} className="nav-section">
              <span className="nav-section-label">{section.label}</span>
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link href={item.href} key={item.href} className={active ? "active" : undefined}>
                    <item.icon size={18} />
                    <span>{item.label}</span>
                    {item.preview ? <small className="nav-preview">Preview</small> : null}
                  </Link>
                );
              })}
            </div>
          ))}

          {isAdmin ? (
            <div className="nav-section">
              <span className="nav-section-label">Pilot</span>
              <Link href="/analytics" className={pathname.startsWith("/analytics") ? "active" : undefined}>
                <BarChart3 size={18} />
                <span>Founder Analytics</span>
              </Link>
              <Link href="/feedback" className={pathname.startsWith("/feedback") ? "active" : undefined}>
                <MessageSquare size={18} />
                <span>Pilot Feedback</span>
              </Link>
            </div>
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
          Today
        </Link>
        {children}
      </main>
    </div>
  );
}
