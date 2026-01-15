"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // ✅ important: wipe any old/stale login the moment you land on /
  useEffect(() => {
    try {
      localStorage.removeItem("loggedIn");
      localStorage.removeItem("role");
      localStorage.removeItem("email");
    } catch {}
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanEmail || !cleanPass) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ prevent cached weirdness
        cache: "no-store",
        body: JSON.stringify({ email: cleanEmail, password: cleanPass }),
      });

      // ✅ don’t assume JSON (405/500 often returns HTML/empty)
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      // ✅ if API is not working, DO NOT log in
      if (!res.ok || !data?.ok || !data?.user?.role) {
        const msg =
          data?.error ||
          `Login failed (${res.status}). Your /api/auth/login route is not accepting POST in production.`;
        setError(msg);
        return;
      }

      // ✅ only here do we store auth
      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("role", String(data.user.role).toLowerCase());
      localStorage.setItem("email", String(data.user.email).toLowerCase());

      const role = String(data.user.role).toLowerCase();
      router.replace(role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError("Login failed. Your server route or database connection is broken.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b1220] to-black text-white p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white/10 border border-white/10 rounded-2xl p-6 space-y-4"
      >
        <h1 className="text-xl font-bold text-center">MetroAI Login</h1>

        {error && <p className="text-red-300 text-sm text-center">{error}</p>}

        <input
          placeholder="Email"
          className="w-full p-2 rounded bg-black/40 border border-white/10"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 rounded bg-black/40 border border-white/10"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 py-2 rounded font-semibold disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="text-xs text-white/50 text-center">
          This login ONLY succeeds if /api/auth/login returns ok.
        </p>
      </form>
    </main>
  );
}