import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api, { apiErr } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "user" });

  const load = () => api.get("/users").then(({ data }) => setUsers(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    try { await api.post("/users", form); toast.success("User created"); setOpen(false); setForm({ email: "", password: "", name: "", role: "user" }); load(); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const changeRole = async (id, role) => { await api.put(`/users/${id}`, { role }); toast.success("Role updated"); load(); };
  const remove = async (id) => {
    try { await api.delete(`/users/${id}`); toast.success("User deleted"); load(); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <AppLayout title="Users" subtitle={`${users.length} user(s) — manage who can access Clara Frames`}
      actions={<PrimaryButton icon={UserPlus} data-testid="new-user-btn" onClick={() => setOpen(true)}>Add user</PrimaryButton>}>

      <div className="bg-white rounded-3xl clara-soft divide-y divide-slate-100">
        {users.map((u, i) => (
          <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            data-testid={`user-row-${u.id}`} className="flex items-center gap-4 p-4">
            <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#8f99c5] to-[#545f8f] text-white flex items-center justify-center font-bold shrink-0">{(u.name || u.email).slice(0, 1).toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 truncate">{u.name || "—"}</span>
                {u.id === user?.id && <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">You</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${u.mfa_enabled ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                  {u.mfa_enabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}{u.mfa_enabled ? "2FA on" : "2FA pending"}
                </span>
              </div>
              <div className="text-sm text-slate-500 truncate">{u.email}</div>
            </div>
            <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
              <SelectTrigger data-testid={`role-${u.id}`} className="rounded-xl w-32 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
            </Select>
            <button data-testid={`del-user-${u.id}`} disabled={u.id === user?.id} onClick={() => remove(u.id)}
              className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"><Trash2 className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">Add user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input data-testid="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input data-testid="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Temporary password</Label><Input data-testid="user-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role" className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
              </Select></div>
            <p className="text-xs text-slate-400">The user sets up their authenticator app (2FA) on first login.</p>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-user-confirm" onClick={create}>Create user</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
