"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    // Fake login (for now)
    localStorage.setItem("loggedIn", "true");
router.push("/dashboard");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-r from-pink-200 to-red-500">
      <div className="w-full max-w-md bg-black/40 rounded-xl p-8 text-white shadow-lg">
        
        <h1 className="text-2xl font-bold text-center mb-6">
          Login to Deriv Analyzer
        </h1>

        {error && (
          <p className="text-red-400 text-sm text-center mb-3">
            {error}
          </p>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 rounded bg-black/60 border border-gray-600"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 rounded bg-black/60 border border-gray-600"
          />

          <button className="w-full py-2 rounded bg-orange-500 hover:bg-orange-600 font-semibold">
            Log In
          </button>
        </form>
      </div>
    </main>
  );
}