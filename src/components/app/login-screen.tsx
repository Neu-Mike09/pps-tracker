"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User as UserIcon, Leaf, Sprout } from "lucide-react";

export function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        try { localStorage.removeItem("pps_logged_out"); } catch {}
        setUser(data.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4">
      {/* Real-world agriculture video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%231a3c2e'/%3E%3C/svg%3E"
      >
        <source src="/agri-bg.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />

      {/* Subtle grid overlay — precision agriculture tech feel */}
      <div
        className="absolute inset-0 z-1 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glassmorphism login card */}
      <div className="relative z-10 w-full max-w-md">
        <div
          className="rounded-2xl border border-white/20 shadow-2xl p-8"
          style={{
            background: "rgba(26,60,46,0.45)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Logo + title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-emerald-500/30 border border-emerald-300/30 flex items-center justify-center shadow-lg">
                  <Sprout className="w-10 h-10 text-emerald-100" />
                </div>
                {/* Pulsing ring around logo */}
                <div className="absolute inset-0 rounded-2xl border-2 border-emerald-300/40" style={{ animation: "pulse 2s ease-in-out infinite" }} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">DA RFO 5 — PPS</h1>
            <p className="text-sm text-emerald-100/80 mt-1">Incoming Communications Tracker</p>
            <p className="text-xs text-emerald-200/60 mt-0.5">Planning, Monitoring & Evaluation Division</p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-medium text-emerald-100/90">Username</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-200/50" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 bg-white/10 border-emerald-300/20 text-white placeholder:text-emerald-200/40 focus:border-emerald-300/50 focus:bg-white/15"
                  placeholder="Enter username"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-emerald-100/90">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-200/50" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 bg-white/10 border-emerald-300/20 text-white placeholder:text-emerald-200/40 focus:border-emerald-300/50 focus:bg-white/15"
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-200 bg-red-500/20 border border-red-300/20 rounded-lg p-2.5 backdrop-blur-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-500/80 hover:bg-emerald-500 text-white border border-emerald-300/30 shadow-lg transition-all"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <Leaf className="w-4 h-4 mr-2" /> Sign In
                </>
              )}
            </Button>
          </form>

          {/* Bottom tech tagline */}
          <div className="mt-6 text-center">
            <p className="text-[10px] text-emerald-200/40 tracking-wider uppercase">
              Digital Agriculture • Precision Farming • Smart Tracking
            </p>
          </div>
        </div>
      </div>

      {/* Pulse animation */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.08); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
