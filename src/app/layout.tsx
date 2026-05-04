import type { Metadata, Viewport } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Playful display for the “Course Compass” product name in the shell. */
const compassBrand = Fredoka({
  variable: "--font-compass-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Course Compass — MIT academic planning",
  description:
    "A grounded, behaviorally aware AI academic planning assistant for MIT students.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ececf1" },
    { media: "(prefers-color-scheme: dark)", color: "#343541" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${compassBrand.variable} h-full antialiased`}
    >
      <body className="h-full min-h-0 flex flex-col overflow-x-hidden bg-background text-foreground supports-[height:100dvh]:min-h-[100dvh]">
        <AppProviders>
          <AppShell>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
          </AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
