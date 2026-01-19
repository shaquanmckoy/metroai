"use client";

import Link from "next/link";

export default function Navbar({ connected }: { connected: boolean }) {
  return (
    <nav className="w-full bg-[#0d1117]/80 border-b border-white/10 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          MetroAi
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {/* Connection indicator */}
          <span
            className={`px-3 py-1 rounded-full border text-xs ${
              connected
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                : "bg-red-600/20 border-red-500/40 text-red-300"
            }`}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>

          <Link href="/dashboard">Dashboard</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/analyzer">Analyzer</Link>
          <Link href="/autotrader">Auto Trader</Link>
          <Link href="/logout">Logout</Link>
        </div>
      </div>
    </nav>
  );
}