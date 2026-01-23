"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Flags = { matches: boolean; overunder: boolean };
const DEFAULT_FLAGS: Flags = { matches: true, overunder: true };

type DbUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  created_at?: string;
};

export default function AdminPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("admin");

  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [savedMsg, setSavedMsg] = useState("");

  const [users, setUsers] = useState<DbUser[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [userMsg, setUserMsg] = useState("");

  /* ===================== AUTH CHECK ===================== */
  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn") === "true";
    const storedRole = (localStorage.getItem("role") || "").toLowerCase();

    if (!loggedIn) {
      router.replace("/");
      return;
    }
    if (storedRole !== "admin") {
      router.replace("/dashboard");
      return;
    }

    setEmail(localStorage.getItem("email") || "admin");

    setReady(true);
    void loadFlags();
    void loadUsers();
  }, [router]);

  const logout = () => {
    localStorage.clear();
    router.replace("/");
  };

  /* ===================== LOAD / SAVE STRATEGIES ===================== */

  async function loadFlags() {
  try {
    const res = await fetch("/api/admin/strategies", { cache: "no-store" });
    const data = await res.json();

    if (data?.ok) {
      const f = data.flags ?? DEFAULT_FLAGS;

      setFlags(f);

      // ✅ CRITICAL: sync to localStorage so Dashboard sees it
      localStorage.setItem("strategy_flags", JSON.stringify(f));
    }
  } catch {}
}

  async function saveFlags() {
    setSavedMsg("");

    try {
      const res = await fetch("/api/admin/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matches: flags.matches,
          overunder: flags.overunder
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");

      const newFlags = data.flags ?? flags;

setFlags(newFlags);

// ✅ CRITICAL: sync to localStorage so users see it
localStorage.setItem("strategy_flags", JSON.stringify(newFlags));

setSavedMsg("Saved! Users will see changes immediately.");
// 🔑 ALSO write to localStorage so users can read it
localStorage.setItem("strategy_flags", JSON.stringify(data.flags));
      setTimeout(() => setSavedMsg(""), 2000);

    } catch (e: any) {
      setSavedMsg(e?.message || "Failed to save.");
      setTimeout(() => setSavedMsg(""), 2500);
    }
  }

  /* ===================== USER MANAGEMENT ===================== */

  async function loadUsers() {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setUsers(data.users ?? []);
    } catch {}
  }

  async function addUser() {
    setUserMsg("");

    const email = newEmail.trim().toLowerCase();
    if (!email || !newPass) {
      setUserMsg("Email + password required.");
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: newPass, role: newRole }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Add user failed");

      setNewEmail("");
      setNewPass("");
      setNewRole("user");

      setUserMsg("User added!");
      setTimeout(() => setUserMsg(""), 1500);

      await loadUsers();

    } catch (e: any) {
      setUserMsg(e?.message || "Could not add user.");
      setTimeout(() => setUserMsg(""), 2500);
    }
  }

  async function removeUser(id: string) {
    setUserMsg("");

    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Delete failed");

      await loadUsers();

    } catch (e: any) {
      setUserMsg(e?.message || "Could not delete user.");
      setTimeout(() => setUserMsg(""), 2500);
    }
  }

  /* ===================== LOADING SCREEN ===================== */

  if (!ready) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </main>
    );
  }

  /* ===================== MAIN ADMIN UI ===================== */

  return (
    <main className="
      min-h-screen 
      bg-gradient-to-b from-[#0f0f14] via-[#0b0c11] to-[#050507]
      text-white p-6 flex items-start justify-center
    ">
      <div className="
        w-full max-w-2xl 
        bg-white/10 
        border border-white/10 
        rounded-2xl 
        p-6 
        space-y-6 
        shadow-xl
      ">

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Admin Settings</h1>
            <p className="text-xs text-white/60">Signed in as: {email}</p>
          </div>

          <span className="
            text-[10px] px-2 py-1 
            rounded bg-red-600/80 
            font-bold shadow
          ">
            ADMIN
          </span>
        </div>

        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="
            w-full py-2 rounded-md 
            bg-white/10 hover:bg-white/15 
            border border-white/10 
            text-sm font-semibold
          "
        >
          ← Back to Dashboard
        </button>

        {/* STRATEGY FLAGS */}
        <section className="rounded-lg bg-black/30 border border-white/10 p-4">
          <p className="text-sm font-semibold mb-3">Enable strategies for USERS</p>

          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between">
              <span>MetroX (Matches/Differs)</span>
              <input
                type="checkbox"
                checked={flags.matches}
                onChange={(e) => setFlags(f => ({ ...f, matches: e.target.checked }))}
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Over / Under</span>
              <input
                type="checkbox"
                checked={flags.overunder}
                onChange={(e) => setFlags(f => ({ ...f, overunder: e.target.checked }))}
              />
            </label>
          </div>

          <button
            onClick={saveFlags}
            className="
              mt-4 w-full py-2 rounded-md 
              bg-emerald-600 hover:bg-emerald-700 
              text-sm font-semibold
            "
          >
            Save Changes
          </button>

          {savedMsg && <p className="mt-3 text-xs text-emerald-300">{savedMsg}</p>}
        </section>

        {/* USER MANAGEMENT */}
        <section className="rounded-lg bg-black/30 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Users</p>

            <button
              onClick={loadUsers}
              className="
                text-xs px-3 py-1 rounded 
                bg-white/10 border border-white/10 
                hover:bg-white/15
              "
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email"
              className="md:col-span-2 p-2 rounded bg-black/40 border border-white/10 text-sm"
            />

            <input
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="password"
              type="password"
              className="p-2 rounded bg-black/40 border border-white/10 text-sm"
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
              className="p-2 rounded bg-black/40 border border-white/10 text-sm"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <button
            onClick={addUser}
            className="
              mt-2 w-full py-2 rounded-md 
              bg-sky-600 hover:bg-sky-700 
              text-sm font-semibold
            "
          >
            Add User
          </button>

          {userMsg && <p className="mt-2 text-xs text-white/70">{userMsg}</p>}

          <div className="mt-4 space-y-2">
            {users.length === 0 ? (
              <p className="text-xs text-white/60">No users found.</p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="
                    flex items-center justify-between 
                    rounded-md border border-white/10 
                    bg-black/20 p-2 text-sm
                  "
                >
                  <div>
                    <div className="font-semibold">{u.email}</div>
                    <div className="text-xs text-white/60">
                      role: {u.role}
                      {u.created_at ? ` • ${new Date(u.created_at).toLocaleString()}` : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => removeUser(u.id)}
                    className="
                      text-xs px-3 py-1 rounded 
                      bg-red-600/25 border border-red-500/40 
                      text-red-200 hover:bg-red-600/35
                    "
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* LOGOUT */}
        <button
          onClick={logout}
          className="
            w-full py-2 rounded-md 
            bg-red-600 hover:bg-red-700 
            text-sm font-semibold
          "
        >
          Logout
        </button>
      </div>
    </main>
  );
}