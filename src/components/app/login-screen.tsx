"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User as UserIcon, Leaf, Drone, Sprout } from "lucide-react";

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
      {/* Animated agricultural background */}
      <div className="absolute inset-0 z-0">
        {/* Base gradient — deep green to sky blue */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900 via-emerald-700 to-sky-800" />

        {/* Floating particles (seeds/pollen) */}
        <div className="absolute inset-0">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-emerald-200/20"
              style={{
                width: `${4 + Math.random() * 8}px`,
                height: `${4 + Math.random() * 8}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${8 + Math.random() * 12}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          ))}
        </div>

        {/* Animated drone SVG — flying across the sky */}
        <div
          className="absolute top-[10%] opacity-20"
          style={{ animation: "droneFly 25s linear infinite" }}
        >
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="white" strokeWidth="1.5">
            {/* Drone body */}
            <rect x="22" y="25" width="16" height="8" rx="3" fill="white" fillOpacity="0.3" />
            {/* Arms */}
            <line x1="14" y1="20" x2="22" y2="27" />
            <line x1="38" y1="27" x2="46" y2="20" />
            <line x1="14" y1="38" x2="22" y2="31" />
            <line x1="38" y1="31" x2="46" y2="38" />
            {/* Rotors (animated) */}
            <ellipse cx="14" cy="18" rx="8" ry="1.5" fill="white" fillOpacity="0.2" style={{ animation: "spin 0.1s linear infinite", transformOrigin: "14px 18px" }} />
            <ellipse cx="46" cy="18" rx="8" ry="1.5" fill="white" fillOpacity="0.2" style={{ animation: "spin 0.1s linear infinite", transformOrigin: "46px 18px" }} />
            <ellipse cx="14" cy="40" rx="8" ry="1.5" fill="white" fillOpacity="0.2" style={{ animation: "spin 0.1s linear infinite", transformOrigin: "14px 40px" }} />
            <ellipse cx="46" cy="40" rx="8" ry="1.5" fill="white" fillOpacity="0.2" style={{ animation: "spin 0.1s linear infinite", transformOrigin: "46px 40px" }} />
            {/* Camera/sensor */}
            <circle cx="30" cy="33" r="2" fill="white" fillOpacity="0.5" />
            {/* Scan lines */}
            <line x1="10" y1="45" x2="50" y2="45" stroke="white" strokeOpacity="0.15" strokeDasharray="2 4" style={{ animation: "scan 3s ease-in-out infinite" }} />
          </svg>
        </div>

        {/* Rolling hills (SVG, layered for depth) */}
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: "40%" }}>
          {/* Back hill */}
          <path d="M0,160 C320,120 480,200 720,170 C960,140 1120,210 1440,180 L1440,320 L0,320 Z" fill="rgba(6,78,59,0.4)" />
          {/* Mid hill */}
          <path d="M0,220 C240,180 400,250 640,220 C880,190 1040,260 1440,230 L1440,320 L0,320 Z" fill="rgba(4,120,87,0.4)" />
          {/* Front hill with crops */}
          <path d="M0,280 C200,250 360,300 600,270 C840,240 1080,290 1440,270 L1440,320 L0,320 Z" fill="rgba(4,150,100,0.5)" />
          {/* Crop rows on front hill */}
          {[0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380].map((x) => (
            <line key={x} x1={x} y1="280" x2={x + 30} y2="320" stroke="rgba(167,243,208,0.15)" strokeWidth="1" />
          ))}
        </svg>

        {/* Grid overlay — precision agriculture / tech feel */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: "50px 50px",
          }}
        />

        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Glassmorphism login card */}
      <div className="relative z-10 w-full max-w-md">
        <div
          className="rounded-2xl border border-white/20 shadow-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
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

      {/* Animations */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          50% { transform: translateY(-30px) translateX(15px); opacity: 0.6; }
        }
        @keyframes droneFly {
          0% { transform: translateX(-100px) translateY(0); }
          25% { transform: translateX(25vw) translateY(-20px); }
          50% { transform: translateX(50vw) translateY(10px); }
          75% { transform: translateX(75vw) translateY(-15px); }
          100% { transform: translateX(calc(100vw + 100px)) translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.08); opacity: 0; }
        }
        @keyframes scan {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(20px); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
