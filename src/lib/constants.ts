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

// Terminal statuses (don't trigger overdue alerts)
export const TERMINAL_STATUSES = ["Accomplished", "Attended", "For Filing", "Cancelled"];

export type DocumentType = typeof DOCUMENT_TYPES[number];
export type Status = typeof STATUSES[number];
export type ActivityCategory = typeof ACTIVITY_CATEGORIES[number];
export type Priority = typeof PRIORITIES[number];
