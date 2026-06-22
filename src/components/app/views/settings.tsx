"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  Users,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Edit3,
  Trash2,
  Shield,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";

interface Settings {
  configured: boolean;
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
  sheetName: string;
}

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export function SettingsView() {
  const { toast } = useToast();
  const currentUser = useAppStore((s) => s.user);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401) {
        setSettings({
          configured: false,
          spreadsheetId: "",
          clientEmail: "",
          privateKey: "",
          sheetName: "Incoming Communications",
        });
        return;
      }
      const data = await res.json();
      // Defensive: ensure required fields exist
      setSettings({
        configured: Boolean(data.configured),
        spreadsheetId: data.spreadsheetId || "",
        clientEmail: data.clientEmail || "",
        privateKey: data.privateKey || "",
        sheetName: data.sheetName || "Incoming Communications",
      });
    } catch {
      setSettings({
        configured: false,
        spreadsheetId: "",
        clientEmail: "",
        privateKey: "",
        sheetName: "Incoming Communications",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.status === 401) {
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: settings.spreadsheetId,
          clientEmail: settings.clientEmail,
          privateKey: settings.privateKey,
          sheetName: settings.sheetName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast({ title: "Settings saved" });
      setTestResult(null);
      loadSettings();
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

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        toast({ title: "Connection OK", description: data.message });
      } else {
        toast({
          title: "Connection failed",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveUser = async (user: {
    id?: string;
    username: string;
    name: string;
    password: string;
    role: string;
    active: boolean;
  }) => {
    try {
      if (user.id) {
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        toast({ title: "User updated" });
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        toast({ title: "User created" });
      }
      setShowUserDialog(false);
      setEditingUser(null);
      loadUsers();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      toast({ title: "User deleted" });
      loadUsers();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <div>Admin access required.</div>
        </CardContent>
      </Card>
    );
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Configure Google Sheets sync and manage user accounts.
        </p>
      </div>

      {/* Google Sheets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sheet className="w-4 h-4 text-emerald-600" />
            Google Sheets Sync
          </CardTitle>
          <CardDescription>
            Records are automatically appended to your Google Sheet on save. Uses a Google Service Account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.configured ? (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              Google Sheets is configured. New records will sync automatically.
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <XCircle className="w-4 h-4" />
              Not configured. Records will save locally only.
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Spreadsheet ID</Label>
            <Input
              value={settings.spreadsheetId}
              onChange={(e) => setSettings({ ...settings, spreadsheetId: e.target.value })}
              placeholder="e.g. 1ABC...xyz (from the Sheet URL)"
            />
            <p className="text-[11px] text-slate-500">
              Found in your Sheet URL: docs.google.com/spreadsheets/d/<strong>&lt;this-part&gt;</strong>/edit
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Service Account Email</Label>
            <Input
              value={settings.clientEmail}
              onChange={(e) => setSettings({ ...settings, clientEmail: e.target.value })}
              placeholder="e.g. pps-tracker@your-project.iam.gserviceaccount.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Service Account Private Key</Label>
            <Textarea
              value={settings.privateKey === "***configured***" ? "" : settings.privateKey}
              onChange={(e) => setSettings({ ...settings, privateKey: e.target.value })}
              placeholder={settings.configured ? "(already set - paste new key to replace)" : "Paste the full private_key from your JSON, including BEGIN/END lines"}
              rows={5}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500">
              From the JSON key file downloaded from Google Cloud Console. Keep the BEGIN/END PRIVATE KEY lines.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Sheet Name (tab name)</Label>
            <Input
              value={settings.sheetName}
              onChange={(e) => setSettings({ ...settings, sheetName: e.target.value })}
              placeholder="Incoming Communications"
            />
          </div>

          {testResult && (
            <div className={`p-3 rounded-md text-sm ${testResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <XCircle className="w-4 h-4 inline mr-2" />}
              {testResult.message}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveSettings} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !settings.configured && !settings.spreadsheetId}>
              {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sheet className="w-4 h-4 mr-1" />}
              Test Connection
            </Button>
          </div>

          {/* Setup instructions */}
          <details className="text-sm">
            <summary className="cursor-pointer text-emerald-700 hover:underline font-medium">
              How do I get these credentials?
            </summary>
            <ol className="list-decimal ml-5 mt-2 space-y-1 text-xs text-slate-600">
              <li>
                Go to{" "}
                <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-emerald-700 underline inline-flex items-center gap-0.5">
                  Google Cloud Console <ExternalLink className="w-3 h-3" />
                </a>{" "}
                and create or select a project.
              </li>
              <li>Enable the <strong>Google Sheets API</strong> (APIs & Services → Library → search "Google Sheets API" → Enable).</li>
              <li>Go to <strong>IAM & Admin → Service Accounts → Create Service Account</strong>. Give it any name (e.g. "pps-tracker").</li>
              <li>After creating, click <strong>Keys → Add Key → Create New Key → JSON</strong>. A JSON file will download.</li>
              <li>Open the JSON file. Copy the <code>client_email</code> and <code>private_key</code> values into the fields above.</li>
              <li>
                Open your Google Sheet and <strong>share</strong> it (Share button, top right) with the service account email,
                giving it <strong>Editor</strong> access.
              </li>
              <li>Copy the Spreadsheet ID from the Sheet URL and paste above.</li>
              <li>Click <strong>Save</strong> then <strong>Test Connection</strong>.</li>
            </ol>
          </details>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              User Accounts
            </CardTitle>
            <CardDescription>Manage staff who can log in and create records.</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingUser(null);
              setShowUserDialog(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Add User
          </Button>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No users yet.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded border border-slate-200">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    {u.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {u.name}
                      {u.role === "admin" && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          <ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Admin
                        </Badge>
                      )}
                      {!u.active && (
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">@{u.username}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingUser(u);
                        setShowUserDialog(true);
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    {u.id !== currentUser?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(u.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User dialog */}
      {showUserDialog && (
        <UserDialog
          user={editingUser}
          onClose={() => {
            setShowUserDialog(false);
            setEditingUser(null);
          }}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
}

function UserDialog({
  user,
  onClose,
  onSave,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSave: (u: { id?: string; username: string; name: string; password: string; role: string; active: boolean }) => void;
}) {
  const [username, setUsername] = useState(user?.username || "");
  const [name, setName] = useState(user?.name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role || "staff");
  const [active, setActive] = useState(user?.active ?? true);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add User"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Santos" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. msantos" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Password {user && <span className="text-slate-400">(leave blank to keep current)</span>}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={user ? "••••••" : "At least 6 characters"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={active ? "active" : "inactive"} onValueChange={(v) => setActive(v === "active")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onSave({
                id: user?.id,
                username,
                name,
                password,
                role,
                active,
              })}
              disabled={!username || !name || (!user && !password)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
