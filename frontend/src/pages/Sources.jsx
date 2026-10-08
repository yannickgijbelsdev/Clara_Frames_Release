import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Radio, Cloud, Clock, Globe, FlaskConical, Pencil, Music } from "lucide-react";
import { ImageUpload } from "@/components/ImageUpload";

const TYPE_META = {
  custom: { label: "Custom API", icon: Globe },
  builtin_nowplaying: { label: "Now Playing (radio)", icon: Music },
  builtin_weather: { label: "Weather (Open-Meteo)", icon: Cloud },
  builtin_time: { label: "World Clock", icon: Clock },
  builtin_live: { label: "Nu Speelt (live)", icon: Radio },
};

const empty = { name: "", type: "custom", format: "json", url: "", method: "GET", refresh_interval: 30, image_path: "", fields: [{ key: "", label: "", path: "" }], latitude: 50.85, longitude: 4.35, timezone: "Europe/Brussels", song_path: "", separator: " - ", artwork: true, fallback_artwork: "", reverse: false };

const deriveFormat = (s) => {
  if (s.format) return s.format;
  const fields = s.fields || [];
  if (fields.length && fields.some((f) => f.path && f.path !== "_text")) return "json";
  if (fields.length) return "text";
  return "json";
};

export default function Sources() {
  const { current } = useWorkspace();
  const [sources, setSources] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [testOut, setTestOut] = useState(null);

  const load = async () => {
    if (!current) return;
    try { await api.get(`/sources/live?workspace_id=${current}`); } catch (e) {}
    api.get(`/sources?workspace_id=${current}`).then(({ data }) => setSources(data)).catch(() => {});
  };
  useEffect(() => { load(); }, [current]);

  const openNew = () => { setForm(empty); setEditId(null); setTestOut(null); setOpen(true); };
  const openEdit = (s) => {
    setForm({ ...empty, ...s, format: deriveFormat(s), fields: s.fields?.length ? s.fields : empty.fields });
    setEditId(s.id); setTestOut(null); setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const payload = { ...form, workspace_id: current, fields: form.fields.filter((f) => f.key && (form.type !== "custom" || f.path)) };
    try {
      if (editId) await api.put(`/sources/${editId}`, payload);
      else await api.post("/sources", payload);
      toast.success("Source saved");
      setOpen(false); load();
    } catch (e) { toast.error("Save failed"); }
  };

  const remove = async (id) => { await api.delete(`/sources/${id}`); toast.success("Deleted"); load(); };

  const test = async () => {
    if (!editId) { toast.message("Save the source first, then test."); return; }
    try {
      const { data } = await api.post(`/sources/${editId}/test`);
      setTestOut(data);
      if (data.error) toast.error("Fetch error"); else toast.success("Fetched");
    } catch (e) { toast.error("Test failed"); }
  };

  const setField = (i, k, v) => setForm((f) => ({ ...f, fields: f.fields.map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const addField = () => setForm((f) => ({ ...f, fields: [...f.fields, { key: "", label: "", path: "" }] }));
  const delField = (i) => setForm((f) => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }));

  return (
    <AppLayout title="API Sources" subtitle={`${sources.length} source(s) — feed live data into your overlays`}
      actions={<PrimaryButton icon={Plus} data-testid="new-source-btn" onClick={openNew}>New source</PrimaryButton>}>

      {sources.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <Radio className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No sources yet. Add weather, a world clock, or your own API.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((s, i) => {
            const Meta = TYPE_META[s.type] || TYPE_META.custom;
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                data-testid={`source-card-${s.id}`}
                className="bg-white rounded-3xl clara-soft clara-hover clara-trans p-5 flex items-start gap-4">
                <span className="h-11 w-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Meta.icon className="h-5 w-5" /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">{s.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{Meta.label}</span>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{s.url || s.timezone}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(s.fields || []).map((f) => <span key={f.key} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{f.key}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.type !== "builtin_live" && (
                    <button data-testid={`edit-source-${s.id}`} onClick={() => openEdit(s)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                  )}
                  <button data-testid={`del-source-${s.id}`} onClick={() => remove(s.id)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editId ? "Edit source" : "New source"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label>
              <Input data-testid="source-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="source-type" className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.type === "builtin_weather" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="0.01" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) })} className="rounded-xl" /></div>
                <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="0.01" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) })} className="rounded-xl" /></div>
              </div>
            )}
            {form.type === "builtin_time" && (
              <div className="space-y-1.5"><Label>Timezone (IANA)</Label><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Europe/Brussels" className="rounded-xl" /></div>
            )}
            {form.type === "builtin_nowplaying" && (
              <>
                <div className="space-y-1.5"><Label>Now-playing URL</Label>
                  <Input data-testid="np-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…/now-playing (JSON) or …/now-playing.txt" className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>Separator</Label>
                    <Input data-testid="np-sep" value={form.separator} onChange={(e) => setForm({ ...form, separator: e.target.value })} placeholder=" - " className="rounded-xl font-mono" /></div>
                  <div className="space-y-1.5"><Label>Refresh (sec)</Label>
                    <Input type="number" min="5" value={form.refresh_interval} onChange={(e) => setForm({ ...form, refresh_interval: parseInt(e.target.value) || 15 })} className="rounded-xl" /></div>
                </div>
                <div className="space-y-1.5"><Label>JSON song field (optional)</Label>
                  <Input data-testid="np-songpath" value={form.song_path} onChange={(e) => setForm({ ...form, song_path: e.target.value })} placeholder="song_title (auto-detected if empty)" className="rounded-xl font-mono text-sm" /></div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer" data-testid="np-reverse">
                  <input type="checkbox" checked={!!form.reverse} onChange={(e) => setForm({ ...form, reverse: e.target.checked })} className="h-4 w-4 rounded accent-brand-600" />
                  Order is "Title - Artist" (reverse)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer" data-testid="np-artwork">
                  <input type="checkbox" checked={form.artwork !== false} onChange={(e) => setForm({ ...form, artwork: e.target.checked })} className="h-4 w-4 rounded accent-brand-600" />
                  Fetch album cover automatically (iTunes)
                </label>
                <div className="space-y-1.5">
                  <Label>Fallback image (when iTunes finds no cover)</Label>
                  <ImageUpload value={form.fallback_artwork} onChange={(v) => setForm({ ...form, fallback_artwork: v })} testid="np-fallback" accept="image/*" />
                  <p className="text-[11px] text-slate-400">Automatically used in the <code className="font-mono">artwork</code> field whenever iTunes finds no album cover, so your overlay is never empty.</p>
                </div>
                <p className="text-[11px] text-slate-400">Exposes separate fields: <code className="font-mono">artist</code>, <code className="font-mono">title</code>, <code className="font-mono">song</code> and <code className="font-mono">artwork</code>. Place each as its own element to style independently; bind an image to <code className="font-mono">artwork</code> for the album cover.</p>
              </>
            )}
            {form.type === "custom" && (
              <>
                <div className="space-y-1.5"><Label>API URL</Label>
                  <Input data-testid="source-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://api.example.com/data" className="rounded-xl" /></div>

                <div className="space-y-1.5"><Label>Response type</Label>
                  <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
                    <SelectTrigger data-testid="source-format" className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text API — plain text as one field</SelectItem>
                      <SelectItem value="json">JSON API — map fields via JSON paths</SelectItem>
                      <SelectItem value="image">Image API — response is an image URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5"><Label>Refresh interval (seconds)</Label>
                  <Input type="number" min="5" value={form.refresh_interval} onChange={(e) => setForm({ ...form, refresh_interval: parseInt(e.target.value) || 30 })} className="rounded-xl" /></div>

                {form.format === "text" && (
                  <p className="text-[11px] text-slate-400">The entire response is exposed as a single <code className="font-mono">text</code> field. Perfect for a now-playing <code className="font-mono">.txt</code> endpoint.</p>
                )}

                {form.format === "image" && (
                  <>
                    <div className="space-y-1.5"><Label>Image path in JSON (optional)</Label>
                      <Input data-testid="source-image-path" value={form.image_path} onChange={(e) => setForm({ ...form, image_path: e.target.value })} placeholder="e.g. data.cover_url — leave empty if the response is the URL itself" className="rounded-xl text-sm font-mono" /></div>
                    <p className="text-[11px] text-slate-400">Exposes an <code className="font-mono">image</code> field. Bind it to an Image element to show the live picture. Leave the path empty when the response body is already the image URL (plain text); fill it in when the URL sits inside a JSON field.</p>
                  </>
                )}

                {form.format === "json" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5"><Label>Field mappings</Label>
                    <button onClick={addField} className="text-xs text-brand-600 font-medium inline-flex items-center gap-1"><Plus className="h-3 w-3" />Add</button></div>
                  <div className="space-y-2">
                    {form.fields.map((f, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input placeholder="key" value={f.key} onChange={(e) => setField(i, "key", e.target.value)} className="rounded-xl text-sm" data-testid={`field-key-${i}`} />
                        <Input placeholder="json.path" value={f.path} onChange={(e) => setField(i, "path", e.target.value)} className="rounded-xl text-sm font-mono" data-testid={`field-path-${i}`} />
                        <button onClick={() => delField(i)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Path uses dot / index notation, e.g. <code className="font-mono">current.temperature_2m</code> or <code className="font-mono">results.0.name</code>.</p>
                </div>
                )}
              </>
            )}

            {testOut && (
              <div className="bg-slate-900 text-slate-100 rounded-xl p-3 text-xs font-mono overflow-x-auto">
                {testOut.error ? <span className="text-rose-400">{testOut.error}</span> :
                  Object.entries(testOut.values).map(([k, v]) => <div key={k}><span className="text-brand-300">{k}</span>: {String(v)}</div>)}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <SecondaryButton icon={FlaskConical} data-testid="test-source-btn" onClick={test}>Test</SecondaryButton>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
                <PrimaryButton data-testid="save-source-btn" onClick={save}>Save</PrimaryButton>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
