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

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitForm = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      setInfo(data); setStep("setup");
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
          <div className="h-5 w-px bg-slate-200/70" />
          <span className="font-display font-semibold text-slate-900 text-lg">Clara Frames</span>
        </div>

        {step === "form" && (
          <form onSubmit={submitForm} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Create account</h1>
              <p className="text-sm text-slate-500 mt-1">Secured with authenticator-app 2FA.</p>
            </div>
            <div className="space-y-1.5"><Label>Name</Label>
              <Input data-testid="reg-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input data-testid="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.tv" className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Password</Label>
              <Input data-testid="reg-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 characters" className="rounded-xl" /></div>
            {error && <p data-testid="reg-error" className="text-sm text-red-600">{error}</p>}
            <PrimaryButton data-testid="reg-submit" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </PrimaryButton>
            <p className="text-sm text-slate-500 text-center">Have an account? <Link to="/login" className="text-brand-600 font-medium">Sign in</Link></p>
          </form>
        )}

        {step === "setup" && info && (
          <form onSubmit={submitSetup} className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="h-5 w-5 text-brand-600" /><h1 className="font-display text-2xl font-bold">Scan QR code</h1></div>
            <p className="text-sm text-slate-500">Add this to Google Authenticator / Authy, then enter the code.</p>
            <img src={info.qr} alt="QR" className="mx-auto h-44 w-44 rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-400 text-center font-mono break-all">{info.secret}</p>
            <Input data-testid="mfa-code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="rounded-xl text-center tracking-[0.5em] text-lg font-mono" />
            {error && <p data-testid="reg-error" className="text-sm text-red-600">{error}</p>}
            <PrimaryButton data-testid="mfa-submit" type="submit" disabled={loading} className="w-full justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable & finish"}
            </PrimaryButton>
          </form>
        )}
      </motion.div>
    </div>
  );
}
