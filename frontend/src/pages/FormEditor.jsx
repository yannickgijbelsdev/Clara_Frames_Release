import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, ArrowLeft, Loader2, Plus, Trash2, ArrowUp, ArrowDown, Copy, Eye, EyeOff, Link2, Music } from "lucide-react";
import SongPicker from "@/components/SongPicker";

const FIELD_TYPES = ["text", "email", "number", "tel", "textarea", "select", "checkbox", "song_pick"];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";

function UrlBox({ label, url, testid }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{label}</Label>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 min-w-0 truncate text-[11px] font-mono bg-slate-900 text-slate-100 rounded-lg px-2.5 py-2">{url}</code>
        <button data-testid={testid} onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export default function FormEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({});

  useEffect(() => {
    api.get(`/forms/${id}`).then(({ data }) => setForm(data)).catch(() => { toast.error("Form not found"); nav("/forms"); });
  }, [id]);

  const fields = form?.fields || [];
  const setFields = (next) => setForm((f) => ({ ...f, fields: next }));
  const addField = () => setFields([...fields, { id: uid(), label: "New field", key: `field_${fields.length + 1}`, type: "text", required: false, options: [], showInList: true }]);
  const updateField = (i, patch) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeField = (i) => setFields(fields.filter((_, idx) => idx !== i));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= fields.length) return; const n = [...fields]; [n[i], n[j]] = [n[j], n[i]]; setFields(n); };

  const onLabelChange = (i, label) => {
    const f = fields[i];
    const autoKey = !f.key || f.key === slug(f.label) || /^field_\d+$/.test(f.key);
    updateField(i, autoKey ? { label, key: slug(label) } : { label });
  };

  const save = async (silent) => {
    // ensure unique keys
    const seen = {};
    const clean = fields.map((f) => {
      let k = slug(f.key || f.label);
      while (seen[k]) k = k + "_2";
      seen[k] = true;
      return { ...f, key: k };
    });
    setSaving(true);
    try {
      const { data } = await api.put(`/forms/${id}`, { name: form.name, description: form.description || "", fields: clean });
      setForm(data);
      if (!silent) toast.success("Form saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!form) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const schemaUrl = `${BACKEND}/api/public/form/${form.public_token}`;
  const submitUrl = `${BACKEND}/api/public/form/${form.public_token}/submit`;

  return (
    <AppLayout title={form.name} subtitle="Build your form fields. Choose which fields appear directly in Messages."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/forms")}>Back</SecondaryButton>
        <PrimaryButton icon={Save} data-testid="save-form-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </>}>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        {/* builder */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl clara-soft p-5 space-y-3">
            <div className="space-y-1.5"><Label>Form name</Label>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" data-testid="form-name-field" /></div>
            <div className="space-y-1.5"><Label>Description (optional)</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl text-sm" placeholder="Shown to visitors on your website" data-testid="form-desc-field" /></div>
          </div>

          <div className="bg-white rounded-3xl clara-soft p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Fields ({fields.length})</div>
              <button onClick={addField} data-testid="add-field-btn" className="text-sm text-brand-600 font-medium inline-flex items-center gap-1"><Plus className="h-4 w-4" />Add field</button>
            </div>
            {fields.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No fields yet. Click “Add field” to start building.</p>
            ) : (
              <div className="space-y-3">
                {fields.map((f, i) => (
                  <div key={f.id} data-testid={`field-row-${i}`} className="rounded-2xl border border-slate-200 p-3.5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Label</Label>
                          <Input value={f.label || ""} onChange={(e) => onLabelChange(i, e.target.value)} className="rounded-lg text-sm" data-testid={`field-label-${i}`} /></div>
                        <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Key (API)</Label>
                          <Input value={f.key || ""} onChange={(e) => updateField(i, { key: slug(e.target.value) })} className="rounded-lg text-sm font-mono" data-testid={`field-key-${i}`} /></div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 self-end pb-0.5">
                        <button data-testid={`field-up-${i}`} onClick={() => move(i, -1)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArrowUp className="h-4 w-4" /></button>
                        <button data-testid={`field-down-${i}`} onClick={() => move(i, 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArrowDown className="h-4 w-4" /></button>
                        <button data-testid={`field-remove-${i}`} onClick={() => removeField(i)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Type</Label>
                        <Select value={f.type || "text"} onValueChange={(v) => updateField(i, { type: v })}>
                          <SelectTrigger className="rounded-lg" data-testid={`field-type-${i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select></div>
                      {f.type === "select" && (
                        <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Options (comma separated)</Label>
                          <Input value={(f.options || []).join(", ")} onChange={(e) => updateField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="rounded-lg text-sm" data-testid={`field-options-${i}`} placeholder="Option A, Option B" /></div>
                      )}
                      {f.type === "song_pick" && (
                        <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">How many songs</Label>
                          <Select value={f.mode === "top5" ? "top5" : "single"} onValueChange={(v) => updateField(i, { mode: v, max: v === "top5" ? 5 : 1 })}>
                            <SelectTrigger className="rounded-lg" data-testid={`field-songmode-${i}`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="single">1 song</SelectItem><SelectItem value="top5">Top 5 (ranked)</SelectItem></SelectContent>
                          </Select></div>
                      )}
                    </div>
                    {f.type === "song_pick" && (
                      <div className="rounded-xl bg-brand-50/40 border border-brand-100 p-2.5">
                        <div className="text-[10px] uppercase tracking-widest text-brand-600 font-bold mb-1.5 flex items-center gap-1"><Music className="h-3 w-3" />Try the picker (preview)</div>
                        <SongPicker max={f.mode === "top5" ? 5 : 1} value={preview[f.id] || []} onChange={(v) => setPreview((p) => ({ ...p, [f.id]: v }))} testid={`field-songpreview-${i}`} />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Switch checked={!!f.required} onCheckedChange={(v) => updateField(i, { required: v })} data-testid={`field-required-${i}`} />
                        <span className="text-sm text-slate-600">Required</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Switch checked={f.showInList !== false} onCheckedChange={(v) => updateField(i, { showInList: v })} data-testid={`field-showinlist-${i}`} />
                        <span className="text-sm text-slate-600 flex items-center gap-1">{f.showInList !== false ? <Eye className="h-3.5 w-3.5 text-brand-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}Show in Messages list</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* integration */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl clara-soft p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-900"><Link2 className="h-4 w-4 text-brand-600" /><span className="font-display font-semibold">Website integration</span></div>
            <p className="text-xs text-slate-500 leading-relaxed">Give this <b>one</b> API URL to any website or Emergent project. A GET request returns everything: which fields to show, where to submit, and (for song fields) the live search URL. Save the form first so changes are live.</p>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-widest text-brand-600 font-bold">Your API URL (GET)</Label>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 min-w-0 truncate text-[12px] font-mono bg-slate-900 text-slate-100 rounded-lg px-2.5 py-2.5">{schemaUrl}</code>
                <button data-testid="copy-schema-url" onClick={() => { navigator.clipboard.writeText(schemaUrl); toast.success("API URL copied"); }} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">The response includes</div>
              <ul className="text-[11px] text-slate-600 space-y-0.5 list-disc pl-4">
                <li><code className="font-mono">fields</code> — the fields to render (key, label, type, required, options; for songs: max + mode)</li>
                <li><code className="font-mono">submit_url</code> — POST the answers here as JSON</li>
                <li><code className="font-mono">song_search_url</code> — GET <code className="font-mono">?term=</code> for live song search (cover + preview)</li>
                <li><code className="font-mono">honeypot_field</code> — add this hidden input for spam protection</li>
              </ul>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 font-medium">Show example POST body <code className="font-mono text-[10px]">{submitUrl.replace(schemaUrl.split("/api")[0], "")}</code></summary>
              <pre className="mt-2 text-[11px] font-mono text-slate-600 whitespace-pre-wrap break-all bg-slate-50 border border-slate-100 rounded-lg p-2">{JSON.stringify(Object.fromEntries((fields.length ? fields : [{ key: "name" }]).map((f) => [f.key, f.type === "song_pick" ? [{ id: "…", title: "…", artist: "…", artwork: "…", preview: "…" }] : ""])), null, 2)}</pre>
            </details>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <div className="text-[10px] uppercase tracking-widest text-amber-600 font-bold mb-1.5">Spam protection</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">Add a hidden input named <code className="font-mono bg-white px-1 rounded">_gotcha</code> to your form and keep it empty. Bots that fill it are silently ignored. Submissions are also rate-limited per visitor.</p>
            </div>
            <p className="text-[11px] text-slate-400">Answers arrive in the <b>Messages</b> page. CORS is open so any site can submit.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
