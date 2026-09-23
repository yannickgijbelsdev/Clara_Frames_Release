import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState("password"); // password | code | setup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [setupInfo, setSetupInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitPassword = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.mfa_required) { setTicket(data.mfa_ticket); setStep("code"); }
      else if (data.mfa_setup_required) { setSetupInfo(data); setStep("setup"); }
    } catch (e) { setError(apiErr(e.response?.data?.detail) || e.message); }
    setLoading(false);
  };

  const submitCode = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/mfa/verify", { mfa_ticket: ticket, code });
      setUser(data); nav("/dashboard");
    } catch (e) { setError(apiErr(e.response?.data?.detail) || e.message); }
    setLoading(false);
  };

  const submitSetup = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/mfa/setup-verify", { email, password, code });
      setUser(data); nav("/dashboard");
    } catch (e) { setError(apiErr(e.response?.data?.detail) || e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] grid-bg flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}
        className="w-full max-w-md bg-white rounded-3xl clara-soft p-8">
        <div className="flex items-center gap-2.5 mb-7">
          <Logo />
          <span className="font-display font-semibold text-slate-900 text-lg">Overlay Studio</span>
        </div>

        {step === "password" && (
          <form onSubmit={submitPassword} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Welcome back</h1>
              <p className="text-sm text-slate-500 mt-1">Sign in to build your vMix overlays.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.tv" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="rounded-xl" />
            </div>
            {error && <p data-testid="login-error" className="text-sm text-rose-600">{error}</p>}
            <PrimaryButton data-testid="login-submit" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </PrimaryButton>
            <p className="text-sm text-slate-500 text-center">No account? <Link to="/register" className="text-rose-600 font-medium">Create one</Link></p>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="h-5 w-5 text-rose-600" /><h1 className="font-display text-2xl font-bold">Two-factor code</h1></div>
            <p className="text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
            <Input data-testid="mfa-code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="rounded-xl text-center tracking-[0.5em] text-lg font-mono" />
            {error && <p data-testid="login-error" className="text-sm text-rose-600">{error}</p>}
            <PrimaryButton data-testid="mfa-submit" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & sign in"}
            </PrimaryButton>
          </form>
        )}

        {step === "setup" && setupInfo && (
          <form onSubmit={submitSetup} className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="h-5 w-5 text-rose-600" /><h1 className="font-display text-2xl font-bold">Set up 2FA</h1></div>
            <p className="text-sm text-slate-500">Scan this QR with Google Authenticator, then enter a code to finish.</p>
            <img src={setupInfo.qr} alt="QR" className="mx-auto h-44 w-44 rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-400 text-center font-mono break-all">{setupInfo.secret}</p>
            <Input data-testid="mfa-code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="rounded-xl text-center tracking-[0.5em] text-lg font-mono" />
            {error && <p data-testid="login-error" className="text-sm text-rose-600">{error}</p>}
            <PrimaryButton data-testid="mfa-submit" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable & sign in"}
            </PrimaryButton>
          </form>
        )}
      </motion.div>
    </div>
  );
}
