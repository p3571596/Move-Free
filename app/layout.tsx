import type { Metadata, Viewport } from "next";
import { PwaSupport } from "@/components/PwaSupport";
import "./globals.css";
import "./product-shell.css";

export const metadata: Metadata = {
  title: "Move Free",
  description: "Clinician-led home program and recovery companion.",
  appleWebApp: { capable: true, title: "Move Free", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#174e46" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaSupport /></body>
    </html>
  );
}
