import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/context/AuthContext";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, KeyRound, ShieldCheck, Copy, RefreshCw } from "lucide-react";

function Card({ icon: Icon, title, desc, children }) {
  return (
    <div className="bg-white rounded-3xl clara-soft p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-10 w-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>
        <div><h2 className="font-display text-lg font-semibold text-slate-900">{title}</h2><p className="text-xs text-slate-500">{desc}</p></div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [cur, setCur] = useState("");
  const [npw, setNpw] = useState("");
  const [twofa, setTwofa] = useState(null); // {qr, secret}
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(null);

  const saveProfile = async () => {
    try {
      await api.put("/auth/profile", { name, avatar });
      const { data } = await api.get("/auth/me");
      setUser(data);
      toast.success("Profile updated");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const changePw = async () => {
    try { await api.post("/auth/change-password", { current_password: cur, new_password: npw }); setCur(""); setNpw(""); toast.success("Password changed"); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const start2fa = async () => {
    try { const { data } = await api.post("/auth/2fa/reset"); setTwofa(data); setBackup(null); setCode(""); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const confirm2fa = async () => {
    try { const { data } = await api.post("/auth/2fa/confirm", { code }); setBackup(data.backup_codes); setTwofa(null); setCode(""); toast.success("2FA reset — save your backup codes"); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const regenBackup = async () => {
    try { const { data } = await api.post("/auth/2fa/backup-codes"); setBackup(data.backup_codes); toast.success("New backup codes generated"); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const presets = ["#5f6da6", "#e11d48", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];

  return (
    <AppLayout title="Settings" subtitle="Manage your account, security and avatar.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        <Card icon={User} title="Profile" desc="Your name and avatar">
          <div className="flex items-center gap-4 mb-4">
            {avatar ? <img src={avatar} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-slate-200" />
              : <span className="h-16 w-16 rounded-2xl bg-brand-50 text-brand-600 font-bold text-2xl flex items-center justify-center">{(name || user?.email || "U").slice(0, 1).toUpperCase()}</span>}
            <div className="flex flex-wrap gap-2">
              {presets.map((c) => (
                <button key={c} onClick={() => setAvatar(`https://ui-avatars.com/api/?background=${c.slice(1)}&color=fff&name=${encodeURIComponent(name || "U")}&bold=true`)}
                  className="h-8 w-8 rounded-full ring-2 ring-white shadow" style={{ background: c }} title="Use color avatar" />
              ))}
              <button onClick={() => setAvatar("")} className="h-8 px-3 rounded-full text-xs border border-slate-200 text-slate-600 hover:bg-slate-50">Initials</button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input data-testid="settings-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Avatar image</Label>
              <ImageUpload value={avatar} onChange={setAvatar} testid="settings-avatar" /></div>
            <PrimaryButton data-testid="save-profile-btn" onClick={saveProfile}>Save profile</PrimaryButton>
          </div>
        </Card>

        <Card icon={KeyRound} title="Password" desc="Change your password">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Current password</Label><Input data-testid="cur-pw" type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>New password</Label><Input data-testid="new-pw" type="password" value={npw} onChange={(e) => setNpw(e.target.value)} className="rounded-xl" /></div>
            <PrimaryButton data-testid="change-pw-btn" onClick={changePw}>Change password</PrimaryButton>
          </div>
        </Card>

        <Card icon={ShieldCheck} title="Two-factor authentication" desc="Reset your authenticator (TOTP)">
          {!twofa && !backup && (
            <SecondaryButton icon={RefreshCw} data-testid="reset-2fa-btn" onClick={start2fa}>Reset 2FA</SecondaryButton>
          )}
          {twofa && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Scan the new QR, then confirm a code.</p>
              <img src={twofa.qr} alt="QR" className="h-40 w-40 rounded-xl border border-slate-200" />
              <p className="text-xs text-slate-400 font-mono break-all">{twofa.secret}</p>
              <Input data-testid="confirm-2fa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="rounded-xl text-center tracking-[0.4em] font-mono" />
              <PrimaryButton data-testid="confirm-2fa-btn" onClick={confirm2fa}>Confirm & enable</PrimaryButton>
            </div>
          )}
          {backup && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 font-medium">Backup codes (save these — shown once):</p>
              <div className="grid grid-cols-2 gap-2">
                {backup.map((c) => <code key={c} className="font-mono text-sm bg-slate-900 text-slate-100 rounded-lg px-3 py-1.5 text-center">{c}</code>)}
              </div>
              <SecondaryButton icon={Copy} onClick={() => { navigator.clipboard.writeText(backup.join("\n")); toast.success("Copied"); }}>Copy all</SecondaryButton>
            </div>
          )}
        </Card>

        <Card icon={KeyRound} title="Backup codes" desc="One-time codes if you lose your device">
          <p className="text-sm text-slate-500 mb-3">You have <b className="text-slate-900">{user?.backup_codes_count ?? 0}</b> unused backup code(s). Generating new ones invalidates the old set.</p>
          <SecondaryButton icon={RefreshCw} data-testid="regen-backup-btn" onClick={regenBackup}>Generate new backup codes</SecondaryButton>
          {backup && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {backup.map((c) => <code key={c} className="font-mono text-sm bg-slate-900 text-slate-100 rounded-lg px-3 py-1.5 text-center">{c}</code>)}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
