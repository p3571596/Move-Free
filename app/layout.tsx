import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Move Free",
  description: "Clinician-led home program and recovery companion.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
