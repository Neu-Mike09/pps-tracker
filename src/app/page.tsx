"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { LoginScreen } from "@/components/app/login-screen";
import { AppShell } from "@/components/app/app-shell";

const LOGOUT_FLAG = "pps_logged_out";

export default function Home() {
  const user = useAppStore((s) => s.user);
  const authLoading = useAppStore((s) => s.authLoading);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoading = useAppStore((s) => s.setAuthLoading);

  useEffect(() => {
    let mounted = true;

    // If the user explicitly logged out (flag set), skip the server check
    // and go straight to the login screen. The flag is cleared when the
    // user successfully logs in again (see login-screen.tsx).
    if (localStorage.getItem(LOGOUT_FLAG) === "1") {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (mounted) {
          setUser(data.user || null);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [setUser, setAuthLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppShell />;
}
