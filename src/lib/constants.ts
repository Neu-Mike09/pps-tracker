// Constants for dropdowns and reference lists
// Mirrors the existing Excel logbook's "Reference Lists" sheet

export const SECTION_CODE = "PPS"; // Planning and Programming Section
export const OFFICE_NAME = "Department of Agriculture - Regional Field Office No. 5";
export const DIVISION_NAME = "Planning, Monitoring and Evaluation Division";
export const SECTION_NAME = "Planning and Programming Section";

export const DOCUMENT_TYPES = [
  "Letter",
  "Memorandum",
  "Email",
  "Indorsement",
  "Invitation",
  "Order",
  "Resolution",
  "Report",
  "Others",
] as const;

export const STATUSES = [
  "Pending",
  "In Progress",
  "For Compliance",
  "Accomplished",
  "Attended",
  "Forwarded",
  "Cancelled",
  "Deferred",
  "For Filing",
] as const;

export const ACTIVITY_CATEGORIES = [
  "Coordination",
  "Reporting",
  "Planning",
  "Monitoring",
  "Evaluation",
  "Training/Seminar",
  "Meeting",
  "Field Activity",
  "Others",
] as const;

export const PRIORITIES = [
  "Urgent",
  "High",
  "Normal",
  "Low",
] as const;

// Staff names from the existing Excel logbook (Reference Lists sheet)
export const STAFF_NAMES = [
  "MJ",
  "Alnee",
  "Jing",
  "MRC",
] as const;

// Common sender offices from the existing Excel logbook
export const COMMON_SENDERS = [
  "DA Central Office",
  "RDC 5 Secretariat",
  "RLUC Secretariat",
  "DILG Region 5",
  "DEPDev Region 5",
  "NEDA Region 5",
  "DPWH Region 5",
  "DA RFO 5 - OED",
  "DA RFO 5 - PMED",
] as const;

// Color coding for statuses (Tailwind classes for badges)
export const STATUS_COLORS: Record<string, string> = {
  "Pending": "bg-red-100 text-red-800 border-red-200",
  "In Progress": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "For Compliance": "bg-orange-100 text-orange-800 border-orange-200",
  "Accomplished": "bg-green-100 text-green-800 border-green-200",
  "Attended": "bg-green-100 text-green-800 border-green-200",
  "Forwarded": "bg-blue-100 text-blue-800 border-blue-200",
  "Cancelled": "bg-gray-100 text-gray-800 border-gray-200",
  "Deferred": "bg-purple-100 text-purple-800 border-purple-200",
  "For Filing": "bg-slate-100 text-slate-800 border-slate-200",
};

export const PRIORITY_COLORS: Record<string, string> = {
  "Urgent": "bg-red-500 text-white",
  "High": "bg-orange-500 text-white",
  "Normal": "bg-emerald-500 text-white",
  "Low": "bg-gray-400 text-white",
};

// Color coding for activity categories, based on the Google Calendar color palette.
// Each category gets:
// - a Tailwind badge class (for display in the app UI)
// - a Google Calendar colorId (for syncing to Google Calendar)
//
// Google Calendar color IDs:
//   1=Lavender(#7986cb) 2=Sage(#33b679) 3=Grape(#8e24aa) 4=Flamingo(#e67c73)
//   5=Banana(#f6bf26)   6=Tangerine(#f4511e) 7=Peacock(#039be5) 8=Graphite(#616161)
//   9=Blueberry(#3f51b5) 10=Basil(#0b8043) 11=Tomato(#d50000)
export const ACTIVITY_CATEGORY_COLORS: Record<string, string> = {
  "Coordination":     "bg-blue-100 text-blue-800 border-blue-200",       // Blueberry
  "Reporting":        "bg-indigo-100 text-indigo-800 border-indigo-200", // Lavender
  "Planning":         "bg-purple-100 text-purple-800 border-purple-200", // Grape
  "Monitoring":       "bg-cyan-100 text-cyan-800 border-cyan-200",       // Peacock
  "Evaluation":       "bg-orange-100 text-orange-800 border-orange-200", // Tangerine
  "Training/Seminar": "bg-green-100 text-green-800 border-green-200",    // Basil
  "Meeting":          "bg-yellow-100 text-yellow-800 border-yellow-200", // Banana
  "Field Activity":   "bg-red-100 text-red-800 border-red-200",          // Tomato
  "Others":           "bg-gray-100 text-gray-800 border-gray-200",       // Graphite
};

// Google Calendar color IDs for each activity category (used by calendar sync)
export const ACTIVITY_CATEGORY_GC_COLOR_ID: Record<string, string> = {
  "Coordination":     "9",  // Blueberry (blue)
  "Reporting":        "1",  // Lavender (light purple)
  "Planning":         "3",  // Grape (purple)
  "Monitoring":       "7",  // Peacock (cyan)
  "Evaluation":       "6",  // Tangerine (orange)
  "Training/Seminar": "10", // Basil (dark green)
  "Meeting":          "5",  // Banana (yellow)
  "Field Activity":   "11", // Tomato (red)
  "Others":           "8",  // Graphite (gray)
};

// Terminal statuses (don't trigger overdue alerts)
export const TERMINAL_STATUSES = ["Accomplished", "Attended", "For Filing", "Cancelled"];

export type DocumentType = typeof DOCUMENT_TYPES[number];
export type Status = typeof STATUSES[number];
export type ActivityCategory = typeof ACTIVITY_CATEGORIES[number];
export type Priority = typeof PRIORITIES[number];
