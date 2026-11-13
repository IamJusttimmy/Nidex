import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Geist } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Nidex", template: "%s | Nidex" },
  description:
    "Nigerian exchange rates, money-market rates, Treasury bills and mutual funds from the official publishers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(hanken.variable, plexMono.variable, "font-sans", geist.variable)}>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-page flex-1 px-6 py-12">
          {children}
        </main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}