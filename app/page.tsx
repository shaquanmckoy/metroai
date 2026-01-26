"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse =
  | {
      ok: true;
      user: {
        id: string | number;
        email: string;
        role: "admin" | "user";
      };
    }
  | {
      ok: false;
      error?: string;
    };

function getErrorMessage(data: LoginResponse | null, status: number) {
  if (!data) return `Login failed (HTTP ${status})`;
  if (data.ok === false) return data.error || `Login failed (HTTP ${status})`;
  return `Login failed (HTTP ${status})`;
}

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanEmail || !cleanPass) {
      setError("Please enter email and password");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password: cleanPass }),
      });

      const text = await res.text();
      let data: LoginResponse | null = null;

      try {
        data = text ? (JSON.parse(text) as LoginResponse) : null;
      } catch {
        data = null;
      }

      // ❌ failed login
      if (!res.ok || !data || data.ok !== true) {
        setError(getErrorMessage(data, res.status));
        return;
      }

      // ✅ Store auth info (server-validated)
      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("email", data.user.email);

      // ✅ ALWAYS go to dashboard (admin button appears there)
      router.replace("/dashboard");
    } catch {
      setError("Login failed. Check your server or database connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
  <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#0b1a2a,#000000)] text-white p-6">
    <div className="glass-panel w-full max-w-sm p-8 space-y-4 text-center">

      <img
        src="/metroai-logo.png"
        alt="MetroAi Logo"
        className="mx-auto mb-4 w-36"
      />

      <h1 className="text-2xl font-bold">Welcome to MetroAi</h1>
      <p className="text-sm opacity-70 mb-4">
        Sign in to continue to Deriv Analyzer
      </p>

      <form onSubmit={handleLogin} className="space-y-4">

        {error && (
          <p className="text-red-300 text-sm text-center">{error}</p>
        )}

        <input
          placeholder="Email"
          className="w-full p-3 rounded-lg bg-black/40 border border-white/10 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 rounded-lg bg-black/40 border border-white/10 focus:outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
  disabled={loading}
  className="w-full py-3 rounded-lg font-semibold transition
    bg-gradient-to-r from-orange-500 to-orange-600
    hover:from-orange-400 hover:to-orange-500
    active:scale-[0.98]
    border border-white/10
    shadow-[0_6px_20px_rgba(249,115,22,0.35)]
    disabled:opacity-60"
>
          {loading ? "Logging in..." : "Log In"}
        </button>

      </form>
    </div>
  </main>
);
}