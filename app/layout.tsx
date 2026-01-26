import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "MetroAi",
  description: "AI Trading",
  icons: {
    icon: "/metroai-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
  <head>
    <link rel="icon" href="/metroai-logo.png" />
  </head>
  <body className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    {children}
  </body>
</html>
  );
}