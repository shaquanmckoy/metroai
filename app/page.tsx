"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse =
  | { ok: true; user: { id: string | number; email: string; role: "admin" | "user" } }
  | { ok: false; error?: string };

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
    const cleanPass = password; // don't trim passwords unless you intentionally want that

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

      // Safely parse JSON (in case Vercel returns HTML / empty body)
      const text = await res.text();
      let data: LoginResponse | null = null;
      try {
        data = text ? (JSON.parse(text) as LoginResponse) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data || data.ok !== true) {
        const msg =
          (data && "error" in data && data.error) ||
          `Login failed (HTTP ${res.status}).`;
        setError(msg);
        return;
      }

      // ✅ save auth info from DB response
      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("email", data.user.email);

      // ✅ route by role
      router.replace(data.user.role === "admin" ? "/admin" : "/dashboard");
    } catch {
      setError("Login failed. Check your server + database connection.");
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
        <h1 className="text-xl font-bold text-center">Login to Deriv Analyzer</h1>

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
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>
    </main>
  );
}