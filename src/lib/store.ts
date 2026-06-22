"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "new"
  | "records"
  | "calendar"
  | "settings";

export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  role: string;
};

interface AppState {
  // Auth
  user: CurrentUser | null;
  authLoading: boolean;
  setUser: (u: CurrentUser | null) => void;
  setAuthLoading: (b: boolean) => void;

  // Navigation
  view: ViewKey;
  setView: (v: ViewKey) => void;

  // Sidebar (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;

  // Edit target (for records view - when editing a specific record)
  editId: string | null;
  setEditId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  authLoading: true,
  setUser: (u) => set({ user: u }),
  setAuthLoading: (b) => set({ authLoading: b }),

  view: "dashboard",
  setView: (v) => set({ view: v, sidebarOpen: false }),

  sidebarOpen: false,
  setSidebarOpen: (b) => set({ sidebarOpen: b }),

  editId: null,
  setEditId: (id) => set({ editId: id }),
}));
