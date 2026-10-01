import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BACKEND } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SongPicker from "@/components/SongPicker";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function PublicForm() {
  const { token } = useParams();
  const [schema, setSchema] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState({});
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${BACKEND}/api/public/form/${token}`)
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d) => {
        setSchema(d);
        const init = {};
        (d.fields || []).forEach((f) => { init[f.key] = f.type === "song_pick" ? [] : f.type === "checkbox" ? false : ""; });
        setValues(init);
      })
      .catch(() => setNotFound(true));
  }, [token]);

  const setVal = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const body = { ...values, [schema.honeypot_field || "_gotcha"]: hp };
      const r = await fetch(schema.submit_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setDone(true); }
      else { const d = await r.json().catch(() => ({})); setError(d.detail || "Submission failed. Please check the fields and try again."); }
    } catch (err) { setError("Network error. Please try again."); }
    setSubmitting(false);
  };

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8] p-6">
      <div className="text-center"><AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">This form does not exist.</p></div>
    </div>
  );
  if (!schema) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  );

  return (
    <div className="min-h-screen bg-[#F5F6F8] py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6 justify-center"><Logo /><span className="font-display font-semibold text-slate-900">Clara Frames</span></div>
        <div className="bg-white rounded-3xl clara-soft p-6 sm:p-8" data-testid="public-form">
          {done ? (
            <div className="text-center py-10" data-testid="public-form-success">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="font-display text-2xl font-bold text-slate-900">Thank you!</h2>
              <p className="text-slate-500 mt-2">Your response has been submitted.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <h1 className="font-display text-3xl font-bold text-slate-900">{schema.name}</h1>
                {schema.description ? <p className="text-slate-500 mt-1.5">{schema.description}</p> : null}
              </div>
              {(schema.fields || []).map((f) => (
                <div key={f.key} className="space-y-1.5">
                  {f.type !== "checkbox" && <Label>{f.label}{f.required && <span className="text-rose-500"> *</span>}</Label>}
                  {["text", "email", "number", "tel"].includes(f.type) && (
                    <Input type={f.type === "tel" ? "tel" : f.type} value={values[f.key] || ""} onChange={(e) => setVal(f.key, e.target.value)} className="rounded-xl" data-testid={`pf-${f.key}`} />
                  )}
                  {f.type === "textarea" && (
                    <Textarea value={values[f.key] || ""} onChange={(e) => setVal(f.key, e.target.value)} className="rounded-xl" data-testid={`pf-${f.key}`} />
                  )}
                  {f.type === "select" && (
                    <Select value={values[f.key] || ""} onValueChange={(v) => setVal(f.key, v)}>
                      <SelectTrigger className="rounded-xl" data-testid={`pf-${f.key}`}><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>{(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {f.type === "checkbox" && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <Checkbox id={`pf-${f.key}`} checked={!!values[f.key]} onCheckedChange={(v) => setVal(f.key, !!v)} className="h-5 w-5" data-testid={`pf-${f.key}`} />
                      <label htmlFor={`pf-${f.key}`} className="text-sm text-slate-700 cursor-pointer select-none">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>
                    </div>
                  )}
                  {f.type === "song_pick" && (
                    <SongPicker max={f.max || 1} value={values[f.key] || []} onChange={(v) => setVal(f.key, v)} testid={`pf-${f.key}`} />
                  )}
                </div>
              ))}
              {/* honeypot */}
              <input type="text" tabIndex="-1" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true" name={schema.honeypot_field || "_gotcha"} />
              {error && <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2" data-testid="public-form-error"><AlertCircle className="h-4 w-4" />{error}</div>}
              <PrimaryButton type="submit" disabled={submitting} className="w-full justify-center" data-testid="public-form-submit">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </PrimaryButton>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by Clara Frames</p>
      </div>
    </div>
  );
}
