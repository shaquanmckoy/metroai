"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// ✅ MUST match dashboard/page.tsx
const STRATEGY_FLAGS_KEY = "strategy_flags";
const DEFAULT_STRATEGIES = { matches: true, overunder: true };

type Flags = {
  matches: boolean;
  overunder: boolean;
};

function readFlags(): Flags {
  try {
    const raw = localStorage.getItem(STRATEGY_FLAGS_KEY);
    if (!raw) return DEFAULT_STRATEGIES;
    const parsed = JSON.parse(raw);
    return {
      matches: typeof parsed.matches === "boolean" ? parsed.matches : true,
      overunder: typeof parsed.overunder === "boolean" ? parsed.overunder : true,
    };
  } catch {
    return DEFAULT_STRATEGIES;
  }
}

function saveFlags(flags: Flags) {
  localStorage.setItem(STRATEGY_FLAGS_KEY, JSON.stringify(flags));
  // ✅ same-tab immediate update (storage event doesn't fire in same tab)
  window.dispatchEvent(new Event("storage"));
}

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [flags, setFlags] = useState<Flags>(DEFAULT_STRATEGIES);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn") === "true";
    const role = (localStorage.getItem("role") || "").toLowerCase();

    if (!loggedIn) {
      router.replace("/");
      return;
    }
    if (role !== "admin") {
      router.replace("/dashboard");
      return;
    }

    setFlags(readFlags());
    setReady(true);
  }, [router]);

  const email = useMemo(() => localStorage.getItem("email") || "admin", []);

  const logout = () => {
    localStorage.clear();
    router.replace("/");
  };

  const onSave = () => {
    saveFlags(flags);
    setSavedMsg("Saved! Users will see the new strategy settings immediately.");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const onReset = () => {
    setFlags(DEFAULT_STRATEGIES);
    saveFlags(DEFAULT_STRATEGIES);
    setSavedMsg("Reset to defaults.");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  if (!ready) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-white/10 border border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Admin Settings</h1>
            <p className="text-xs text-white/60">Signed in as: {email}</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded bg-red-600/80 font-bold">ADMIN</span>
        </div>

        <div className="mt-4 rounded-lg bg-black/30 border border-white/10 p-4">
          <p className="text-sm font-semibold mb-3">Enable strategies for USERS</p>

          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between">
              <span>MetroX (Matches/Differs)</span>
              <input
                type="checkbox"
                checked={flags.matches}
                onChange={(e) => setFlags((f) => ({ ...f, matches: e.target.checked }))}
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Over / Under</span>
              <input
                type="checkbox"
                checked={flags.overunder}
                onChange={(e) => setFlags((f) => ({ ...f, overunder: e.target.checked }))}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 py-2 text-sm font-semibold"
            >
              Back to Dashboard
            </button>

            <button
              onClick={onSave}
              className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-700 py-2 text-sm font-semibold"
            >
              Save
            </button>
          </div>

          <button
            onClick={onReset}
            className="mt-2 w-full rounded-md bg-white/10 hover:bg-white/15 border border-white/10 py-2 text-sm font-semibold"
          >
            Reset to Defaults
          </button>

          {savedMsg && <p className="mt-3 text-xs text-emerald-300">{savedMsg}</p>}
        </div>

        <button
          onClick={logout}
          className="mt-4 w-full rounded-md bg-red-600 hover:bg-red-700 py-2 text-sm font-semibold"
        >
          Logout
        </button>
      </div>
    </main>
  );
}