"use client";

import { useEffect, useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Edit3,
  ImageIcon,
  X,
  Save,
  CloudUpload,
  CloudOff,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  STATUSES,
  STATUS_COLORS,
  ACTIVITY_CATEGORIES,
  PRIORITY_COLORS,
  DOCUMENT_TYPES,
  PRIORITIES,
  STAFF_NAMES,
  COMMON_SENDERS,
  TERMINAL_STATUSES,
} from "@/lib/constants";

interface Record {
  id: string;
  controlNo: string;
  dateReceived: string;
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
  year: number;
  priority: string | null;
  activityDateTime: string | null;
  photoPath: string | null;
  syncStatus: string;
  syncError: string | null;
  sheetSyncedAt: string | null;
}

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtDate = (s: string | null): string => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export function RecordsView() {
  const { toast } = useToast();
  const setView = useAppStore((s) => s.setView);
  const editId = useAppStore((s) => s.editId);
  const setEditId = useAppStore((s) => s.setEditId);

  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Record | null>(null);
  const [showPhoto, setShowPhoto] = useState<Record | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (assignedFilter) params.set("assignedTo", assignedFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (overdueOnly) params.set("overdue", "1");
      const res = await fetch(`/api/communications?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (e) {
      toast({
        title: "Failed to load records",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadRecords, 300);
    return () => clearTimeout(t);
     
  }, [search, statusFilter, assignedFilter, categoryFilter, overdueOnly]);

  // Auto-open edit dialog if editId is set (from dashboard click)
  useEffect(() => {
    if (editId) {
      const r = records.find((x) => x.id === editId);
      if (r) {
        setEditingRecord(r);
        setEditId(null);
      } else if (!loading) {
        // Record not in current filtered set - try to fetch directly
        fetch(`/api/communications/${editId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.record) {
              setRecords((prev) => [data.record, ...prev]);
              setEditingRecord(data.record);
            }
            setEditId(null);
          })
          .catch(() => setEditId(null));
      }
    }
     
  }, [editId, records, loading]);

  const handleRetrySync = async (record: Record) => {
    try {
      const res = await fetch(`/api/communications/${record.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Synced successfully" });
        setRecords((prev) => prev.map((r) => (r.id === record.id ? data.record : r)));
        if (editingRecord?.id === record.id) setEditingRecord(data.record);
      } else {
        toast({
          title: "Sync failed",
          description: data.error,
          variant: "destructive",
        });
        if (data.record) {
          setRecords((prev) => prev.map((r) => (r.id === record.id ? data.record : r)));
          if (editingRecord?.id === record.id) setEditingRecord(data.record);
        }
      }
    } catch (e) {
      toast({
        title: "Sync failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleSaveEdit = async (updated: Record) => {
    try {
      const res = await fetch(`/api/communications/${updated.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateReceived: updated.dateReceived,
          dateOfDocument: updated.dateOfDocument,
          documentType: updated.documentType,
          fromOffice: updated.fromOffice,
          subject: updated.subject,
          referenceNo: updated.referenceNo,
          assignedTo: updated.assignedTo,
          targetDate: updated.targetDate,
          dateCompleted: updated.dateCompleted,
          status: updated.status,
          activityCategory: updated.activityCategory,
          remarks: updated.remarks,
          priority: updated.priority,
          activityDateTime: updated.activityDateTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? data.record : r)));
      setEditingRecord(null);
      toast({ title: "Record updated" });
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Records</h1>
          <p className="text-sm text-slate-500">
            {records.length} record{records.length !== 1 ? "s" : ""} shown
          </p>
        </div>
        <Button onClick={() => setView("new")} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> New Record
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search control no, subject, sender, ref no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Assigned To" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {STAFF_NAMES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {ACTIVITY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Button
              variant={overdueOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setOverdueOnly((v) => !v)}
              className={overdueOnly ? "bg-red-600 hover:bg-red-700" : ""}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              {overdueOnly ? "Showing overdue only" : "Show overdue only"}
            </Button>
            <Button variant="ghost" size="sm" onClick={loadRecords}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            {(search || statusFilter || assignedFilter || categoryFilter || overdueOnly) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setAssignedFilter("");
                  setCategoryFilter("");
                  setOverdueOnly(false);
                }}
              >
                <X className="w-3 h-3 mr-1" /> Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Records list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No records found. Try adjusting your filters or create a new record.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: table */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="p-3 font-medium">Control No.</th>
                      <th className="p-3 font-medium">Date Recv</th>
                      <th className="p-3 font-medium">From</th>
                      <th className="p-3 font-medium">Subject</th>
                      <th className="p-3 font-medium">Assigned</th>
                      <th className="p-3 font-medium">Target</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Sync</th>
                      <th className="p-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r) => {
                      const isOverdue = r.targetDate &&
                        new Date(r.targetDate) < today() &&
                        !TERMINAL_STATUSES.includes(r.status || "");
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => setEditingRecord(r)}
                        >
                          <td className="p-3 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              {r.controlNo}
                              {r.photoPath && <ImageIcon className="w-3 h-3 text-slate-400" />}
                            </div>
                            {r.priority && (
                              <Badge variant="outline" className={`mt-1 text-[10px] px-1 py-0 h-4 ${PRIORITY_COLORS[r.priority] || ""}`}>
                                {r.priority}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-xs">{fmtDate(r.dateReceived)}</td>
                          <td className="p-3 text-xs max-w-[180px] truncate" title={r.fromOffice || ""}>
                            {r.fromOffice || "-"}
                          </td>
                          <td className="p-3 text-xs max-w-[280px]">
                            <div className="truncate font-medium text-slate-900" title={r.subject || ""}>
                              {r.subject || "(no subject)"}
                            </div>
                            {r.referenceNo && (
                              <div className="text-[10px] text-slate-500 truncate">{r.referenceNo}</div>
                            )}
                          </td>
                          <td className="p-3 text-xs">{r.assignedTo || "-"}</td>
                          <td className={`p-3 text-xs ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                            {fmtDate(r.targetDate)}
                            {isOverdue && <div className="text-[10px] text-red-500">OVERDUE</div>}
                          </td>
                          <td className="p-3">
                            {r.status && (
                              <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>
                                {r.status}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <SyncBadge record={r} onRetry={() => handleRetrySync(r)} />
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingRecord(r);
                              }}
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {records.map((r) => {
              const isOverdue = r.targetDate &&
                new Date(r.targetDate) < today() &&
                !TERMINAL_STATUSES.includes(r.status || "");
              return (
                <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setEditingRecord(r)}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-700">{r.controlNo}</span>
                          {r.priority && (
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${PRIORITY_COLORS[r.priority] || ""}`}>
                              {r.priority}
                            </Badge>
                          )}
                          {r.photoPath && <ImageIcon className="w-3 h-3 text-slate-400" />}
                        </div>
                        <div className="text-sm font-medium text-slate-900 mt-1 line-clamp-2">{r.subject || "(no subject)"}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.fromOffice}</div>
                      </div>
                      {r.status && (
                        <Badge variant="outline" className={`flex-shrink-0 ${STATUS_COLORS[r.status] || ""}`}>
                          {r.status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <div>
                        Recv: {fmtDate(r.dateReceived)}
                        {r.assignedTo && <> • {r.assignedTo}</>}
                      </div>
                      <div className={isOverdue ? "text-red-600 font-semibold" : ""}>
                        Target: {fmtDate(r.targetDate) || "-"}
                        {isOverdue && " (OVERDUE)"}
                      </div>
                    </div>
                    {r.syncStatus === "failed" && (
                      <div className="flex items-center justify-between pt-1">
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                          <CloudOff className="w-2.5 h-2.5 mr-1" /> Sync failed
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetrySync(r);
                          }}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Edit dialog */}
      {editingRecord && (
        <EditRecordDialog
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={handleSaveEdit}
          onShowPhoto={(r) => {
            setShowPhoto(r);
          }}
        />
      )}

      {/* Photo viewer */}
      {showPhoto && (
        <Dialog open={true} onOpenChange={(o) => !o && setShowPhoto(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{showPhoto.controlNo}</DialogTitle>
            </DialogHeader>
            {showPhoto.photoPath ? (
               
              <img
                src={showPhoto.photoPath}
                alt={showPhoto.controlNo}
                className="w-full rounded-md"
              />
            ) : (
              <div className="text-center py-8 text-slate-500">No photo attached.</div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SyncBadge({ record, onRetry }: { record: Record; onRetry: () => void }) {
  if (record.syncStatus === "synced") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
        <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Synced
      </Badge>
    );
  }
  if (record.syncStatus === "failed") {
    return (
      <button onClick={(e) => { e.stopPropagation(); onRetry(); }} title={record.syncError || "Sync failed - click to retry"}>
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] cursor-pointer hover:bg-red-100">
          <CloudOff className="w-2.5 h-2.5 mr-1" /> Failed
        </Badge>
      </button>
    );
  }
  return (
    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">
      <CloudUpload className="w-2.5 h-2.5 mr-1" /> Pending
    </Badge>
  );
}

function EditRecordDialog({
  record,
  onClose,
  onSave,
  onShowPhoto,
}: {
  record: Record;
  onClose: () => void;
  onSave: (r: Record) => void;
  onShowPhoto: (r: Record) => void;
}) {
  const [form, setForm] = useState<Record>(record);
  const update = (k: keyof Record, v: string | null) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {record.controlNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {form.photoPath && (
            <div>
              <Button variant="outline" size="sm" onClick={() => onShowPhoto(form)}>
                <ImageIcon className="w-3 h-3 mr-1" /> View Document Photo
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date Received</Label>
              <Input type="date" value={form.dateReceived?.slice(0, 10) || ""} onChange={(e) => update("dateReceived", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date of Document</Label>
              <Input type="date" value={form.dateOfDocument?.slice(0, 10) || ""} onChange={(e) => update("dateOfDocument", e.target.value || null)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Document Type</Label>
              <Select value={form.documentType || ""} onValueChange={(v) => update("documentType", v)}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From (Office)</Label>
              <Input list="sender-list2" value={form.fromOffice || ""} onChange={(e) => update("fromOffice", e.target.value || null)} />
              <datalist id="sender-list2">
                {COMMON_SENDERS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject / Title</Label>
            <Input value={form.subject || ""} onChange={(e) => update("subject", e.target.value || null)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference No.</Label>
            <Input value={form.referenceNo || ""} onChange={(e) => update("referenceNo", e.target.value || null)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned To</Label>
              <Select value={form.assignedTo || ""} onValueChange={(v) => update("assignedTo", v)}>
                <SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger>
                <SelectContent>
                  {STAFF_NAMES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status || ""} onValueChange={(v) => update("status", v)}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority || ""} onValueChange={(v) => update("priority", v)}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Activity Category</Label>
              <Select value={form.activityCategory || ""} onValueChange={(v) => update("activityCategory", v)}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target Date</Label>
              <Input type="date" value={form.targetDate?.slice(0, 10) || ""} onChange={(e) => update("targetDate", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Activity Date & Time</Label>
              <Input
                type="datetime-local"
                value={form.activityDateTime ? toLocalDateTimeInput(form.activityDateTime) : ""}
                onChange={(e) => update("activityDateTime", e.target.value || null)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date Completed</Label>
              <Input type="date" value={form.dateCompleted?.slice(0, 10) || ""} onChange={(e) => update("dateCompleted", e.target.value || null)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Remarks / Action Taken</Label>
            <Input value={form.remarks || ""} onChange={(e) => update("remarks", e.target.value || null)} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(form)} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="w-4 h-4 mr-1" /> Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
