"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Dumbbell, Home, LayoutDashboard, MessageSquare, Stethoscope, UserRound } from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients/demo-patient", label: "Patient Workspace", icon: Stethoscope },
  { href: "/program-builder/demo-patient", label: "Program Builder", icon: Dumbbell },
  { href: "/exercise-studio", label: "Exercise Studio", icon: Activity },
  { href: "/app", label: "Patient App", icon: Home },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

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
          <button type="button" onClick={signOut}>
            <UserRound size={18} />
            Sign out
          </button>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
