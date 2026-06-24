"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  FileText,
  Loader2,
  Save,
  X,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Edit3,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DOCUMENT_TYPES,
  STATUSES,
  ACTIVITY_CATEGORIES,
  PRIORITIES,
  STAFF_NAMES,
  COMMON_SENDERS,
} from "@/lib/constants";

interface ExtractedData {
  documentType: string | null;
  dateOfDocument: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  activityCategorySuggestion: string | null;
  activityDateTimeSuggestion: string | null;
  targetDateSuggestion: string | null;
  prioritySuggestion: string | null;
  rawText: string;
}

interface FormState {
  photoPath: string | null;
  photoPreview: string | null;
  dateReceived: string;
  timeReceived: string | null;
  dateOfDocument: string | null;
  documentType: string | null;
  fromOffice: string | null;
  subject: string | null;
  referenceNo: string | null;
  assignedTo: string | null;
  targetDate: string | null;
  dateCompleted: string | null;
  status: string | null;
  activityCategory: string | null;
  remarks: string | null;
  priority: string | null;
  activityDateTime: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const nowTimeStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function safeJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try { return JSON.parse(text); } catch {}
  }
  const preview = text.slice(0, 200).trim() || "(empty response)";
  return { error: `Server returned a non-JSON response (${res.status} ${res.statusText}). ${preview}` };
}

async function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Request timed out — the AI took too long to respond. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

const toLocalDateTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toLocalDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

export function NewRecordView() {
  const { toast } = useToast();
  const setView = useAppStore((s) => s.setView);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const [isImageFile, setIsImageFile] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "manual">("upload");

  const [form, setForm] = useState<FormState>({
    photoPath: null,
    photoPreview: null,
    dateReceived: todayStr(),
    timeReceived: null,
    dateOfDocument: null,
    documentType: null,
    fromOffice: null,
    subject: null,
    referenceNo: null,
    assignedTo: null,
    targetDate: null,
    dateCompleted: null,
    status: "Pending",
    activityCategory: null,
    remarks: null,
    priority: "Normal",
    activityDateTime: null,
  });

  const update = (k: keyof FormState, v: string | null) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleFile = async (file: File) => {
    setExtracting(true);
    setExtracted(null);
    setExtractError(null);
    lastFileRef.current = file;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
    const isImg = imageExts.includes(ext) || file.type.startsWith("image/");
    setIsImageFile(isImg);
    setUploadedFileName(file.name);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadFormData });
      const uploadData = await safeJsonResponse(uploadRes);
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");

      const photoPath = uploadData.path as string;
      const previewUrl = isImg ? URL.createObjectURL(file) : null;
      setForm((f) => ({ ...f, photoPath, photoPreview: previewUrl }));

      const extractFormData = new FormData();
      extractFormData.append("file", file);
      const extractRes = await fetchWithTimeout("/api/extract", { method: "POST", body: extractFormData }, 90000);
      const extractData = await safeJsonResponse(extractRes);
      if (!extractRes.ok) throw new Error(extractData.error || "Extraction failed");

      const ext2: ExtractedData = extractData.extracted as ExtractedData;
      setExtracted(ext2);

      setForm((f) => ({
        ...f,
        photoPath,
        photoPreview: previewUrl,
        timeReceived: nowTimeStr(),
        dateOfDocument: toLocalDate(ext2.dateOfDocument),
        documentType: ext2.documentType,
        fromOffice: ext2.fromOffice,
        subject: ext2.subject,
        referenceNo: ext2.referenceNo,
        activityCategory: ext2.activityCategorySuggestion,
        activityDateTime: toLocalDateTime(ext2.activityDateTimeSuggestion),
        targetDate: toLocalDate(ext2.targetDateSuggestion),
        priority: ext2.prioritySuggestion || "Normal",
      }));

      toast({ title: "Extraction complete", description: "Please review the extracted fields before saving." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExtractError(msg);
      toast({
        title: "Extraction failed",
        description: msg.includes("timed out")
          ? "The AI took too long to respond. Click 'Retry extraction' to try again."
          : msg,
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleRetryExtraction = async () => {
    if (!lastFileRef.current) return;
    await handleFile(lastFileRef.current);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      toast({
        title: "Record saved",
        description: data.warning
          ? `Control No. ${data.record.controlNo} • ${data.warning}`
          : `Control No. ${data.record.controlNo} saved & synced.`,
      });

      setForm({
        photoPath: null, photoPreview: null, dateReceived: todayStr(),
        timeReceived: null,
        dateOfDocument: null, documentType: null, fromOffice: null,
        subject: null, referenceNo: null, assignedTo: null,
        targetDate: null, dateCompleted: null, status: "Pending",
        activityCategory: null, remarks: null, priority: "Normal",
        activityDateTime: null,
      });
      setExtracted(null);
      setExtractError(null);
      setMode("upload");
      setIsImageFile(true);
      setUploadedFileName(null);
      setView("records");
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({
      photoPath: null, photoPreview: null, dateReceived: todayStr(),
      timeReceived: null,
      dateOfDocument: null, documentType: null, fromOffice: null,
      subject: null, referenceNo: null, assignedTo: null,
      targetDate: null, dateCompleted: null, status: "Pending",
      activityCategory: null, remarks: null, priority: "Normal",
      activityDateTime: null,
    });
    setExtracted(null);
    setExtractError(null);
    setMode("upload");
    setIsImageFile(true);
    setUploadedFileName(null);
  };

  const canSave = form.dateReceived && (form.photoPath || form.subject);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Record</h1>
          <p className="text-sm text-slate-500">
            Upload a photo (AI extracts fields automatically) or enter the details manually.
          </p>
        </div>
        <Button variant="outline" onClick={() => setView("dashboard")}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
      </div>

      {/* Mode toggle */}
      {!form.photoPath && !extracting && (
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            onClick={() => setMode("upload")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "upload" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Camera className="w-4 h-4" />
            Upload Photo
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Edit3 className="w-4 h-4" />
            Manual Entry
          </button>
        </div>
      )}

      {/* Upload zone */}
      {!form.photoPath && mode === "upload" && (
        <Card className="border-2 border-dashed border-emerald-300 bg-emerald-50/30">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center py-8">
              {extracting ? (
                <>
                  <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-3" />
                  <div className="text-lg font-medium text-slate-900">Extracting data with AI…</div>
                  <div className="text-sm text-slate-500 mt-1">
                    Reading the document and pulling out fields. This takes ~5-15 seconds.
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                    <FileText className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div className="text-lg font-medium text-slate-900 mb-1">Upload document</div>
                  <div className="text-sm text-slate-500 mb-4 max-w-md">
                    Take a clear photo of the incoming communication, or upload a document file.
                    The AI will extract document type, date, sender, subject, and reference no.
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" onClick={() => cameraInputRef.current?.click()} className="bg-emerald-600 hover:bg-emerald-700">
                      <Camera className="w-4 h-4 mr-1" /> Take Photo
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1" /> Upload File
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400 mt-4">
                    Images (JPG, PNG, WebP, GIF, BMP), PDF, Word (DOC, DOCX), Excel (XLS, XLSX),
                    PowerPoint (PPT, PPTX), TXT, CSV, RTF, EML. Max 25MB.
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,text/csv,.rtf,.eml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form section */}
      {(form.photoPath || mode === "manual") && (
        <div className={form.photoPath ? "grid grid-cols-1 lg:grid-cols-5 gap-6" : ""}>
          {/* Photo preview */}
          {form.photoPath && (
            <div className="lg:col-span-2 space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Document</span>
                    <Button variant="ghost" size="sm" onClick={() => cameraInputRef.current?.click()}>
                      <RotateCcw className="w-3 h-3 mr-1" /> Retake
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    {isImageFile ? (
                      <img src={form.photoPreview || form.photoPath} alt="Document" className="w-full rounded-md border border-slate-200" />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 rounded-md border border-slate-200 bg-slate-50 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                          <FileText className="w-8 h-8 text-emerald-600" />
                        </div>
                        <div className="text-sm font-medium text-slate-900 break-all">{uploadedFileName || "Document"}</div>
                        <div className="text-xs text-slate-500 mt-1">{form.photoPath?.split(".").pop()?.toUpperCase()} file</div>
                        <a href={form.photoPath} target="_blank" rel="noreferrer" className="mt-3 text-xs text-emerald-700 hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Open file
                        </a>
                      </div>
                    )}
                    {extracting && (
                      <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                        <div className="text-white text-center">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                          <div className="text-sm">Extracting…</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {extracted && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setShowRawText((v) => !v)}>
                        <Sparkles className="w-3 h-3 mr-1" />
                        {showRawText ? "Hide" : "Show"} extracted text
                      </Button>
                      {showRawText && (
                        <div className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                          {extracted.rawText}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              {extracted && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                    <div className="text-xs text-emerald-800">
                      <div className="font-medium">AI extraction complete</div>
                      <div className="mt-1 opacity-90">
                        Fields above are auto-filled. Please review and fill in the remaining fields (Assigned To, Target Date, Status, Priority).
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {extractError && !extracting && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-800 flex-1 min-w-0">
                      <div className="font-medium">AI extraction failed</div>
                      <div className="mt-1 opacity-90 break-words">{extractError}</div>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100" onClick={handleRetryExtraction}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Retry extraction
                        </Button>
                      </div>
                      <div className="mt-1.5 opacity-75">You can still fill in the fields manually below and save.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className={form.photoPath ? "lg:col-span-3" : ""}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {form.photoPath ? "Record Details" : "Enter Record Details Manually"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date Received" required>
                    <Input type="date" value={form.dateReceived} onChange={(e) => update("dateReceived", e.target.value)} />
                  </Field>
                  <Field label="Time Received">
                    <Input type="time" value={form.timeReceived || ""} onChange={(e) => update("timeReceived", e.target.value || null)} />
                  </Field>
                </div>
                <Field label="Document Type">
                  <Select value={form.documentType || ""} onValueChange={(v) => update("documentType", v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date of Document">
                  <Input type="date" value={form.dateOfDocument || ""} onChange={(e) => update("dateOfDocument", e.target.value || null)} />
                </Field>
                <Field label="From (Office / Person)">
                  <Input list="sender-list" value={form.fromOffice || ""} onChange={(e) => update("fromOffice", e.target.value || null)} placeholder="e.g. DA Central Office - PMS" />
                  <datalist id="sender-list">
                    {COMMON_SENDERS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </Field>
                <Field label="Subject / Title">
                  <Textarea value={form.subject || ""} onChange={(e) => update("subject", e.target.value || null)} placeholder="Subject line or title of the communication" rows={2} />
                </Field>
                <Field label="Reference No.">
                  <Input value={form.referenceNo || ""} onChange={(e) => update("referenceNo", e.target.value || null)} placeholder="e.g. RDC 5 Resolution No. 1-14, s. 2026" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Assigned To">
                    <Select value={form.assignedTo || ""} onValueChange={(v) => update("assignedTo", v)}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {STAFF_NAMES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Status">
                    <Select value={form.status || ""} onValueChange={(v) => update("status", v)}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority">
                    <Select value={form.priority || ""} onValueChange={(v) => update("priority", v)}>
                      <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Activity Category">
                    <Select value={form.activityCategory || ""} onValueChange={(v) => update("activityCategory", v)}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Target Date (Deadline)">
                    <Input type="date" value={form.targetDate || ""} onChange={(e) => update("targetDate", e.target.value || null)} />
                  </Field>
                  <Field label="Activity Date & Time">
                    <Input type="datetime-local" value={form.activityDateTime || ""} onChange={(e) => update("activityDateTime", e.target.value || null)} />
                  </Field>
                </div>
                <Field label="Date Completed (if done)">
                  <Input type="date" value={form.dateCompleted || ""} onChange={(e) => update("dateCompleted", e.target.value || null)} />
                </Field>
                <Field label="Remarks / Action Taken">
                  <Textarea value={form.remarks || ""} onChange={(e) => update("remarks", e.target.value || null)} placeholder="Notes, action taken, or disposition" rows={2} />
                </Field>
                <div className="flex flex-wrap gap-2 pt-3 border-t">
                  <Button onClick={handleSave} disabled={!canSave || saving} className="bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1" /> Save Record</>}
                  </Button>
                  <Button variant="outline" onClick={handleReset} disabled={saving}>Reset</Button>
                  {!canSave && (
                    <div className="text-xs text-amber-700 flex items-center gap-1 ml-2">
                      <AlertCircle className="w-3 h-3" />
                      {mode === "manual" ? "Enter at least a subject to save." : "Add a photo or at least a subject to save."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
