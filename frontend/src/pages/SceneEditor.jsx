import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import SceneCanvas from "@/components/SceneCanvas";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Type, Clock, Image as ImageIcon, CalendarClock, Radio, Save, Upload, Trash2, ArrowLeft, Loader2, Copy } from "lucide-react";

const FONTS = ["'Outfit', sans-serif", "'Plus Jakarta Sans', sans-serif", "'JetBrains Mono', monospace", "Arial", "Georgia", "Impact"];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

const templates = {
  text: () => ({ id: uid(), type: "text", x: 200, y: 200, w: 700, h: 120, rotation: 0, opacity: 1,
    props: { name: "text", text: "New text" }, style: { color: "#ffffff", fontSize: 64, fontWeight: 700, fontFamily: FONTS[0], textAlign: "left" } }),
  clock: () => ({ id: uid(), type: "clock", x: 1400, y: 60, w: 460, h: 120, rotation: 0, opacity: 1,
    props: { name: "clock", timezone: "Europe/Brussels", format: "HH:mm:ss" }, style: { color: "#ffffff", fontSize: 72, fontWeight: 700, fontFamily: FONTS[2], textAlign: "right" } }),
  image: () => ({ id: uid(), type: "image", x: 60, y: 60, w: 300, h: 120, rotation: 0, opacity: 1,
    props: { name: "logo", src: "" }, style: { objectFit: "contain" } }),
  timed_text: () => ({ id: uid(), type: "timed_text", x: 200, y: 800, w: 900, h: 200, rotation: 0, opacity: 1,
    props: { name: "promo", text: "Timed message", image: "", imagePosition: "left", start: "", end: "", timezone: "Europe/Brussels" },
    style: { color: "#ffffff", fontSize: 48, fontWeight: 600, fontFamily: FONTS[1], backgroundColor: "#5f6da6", borderRadius: 18, padding: 24, textAlign: "left" } }),
  api_field: () => ({ id: uid(), type: "api_field", x: 200, y: 400, w: 600, h: 100, rotation: 0, opacity: 1,
    props: { name: "api", sourceId: "", fieldKey: "", prefix: "", suffix: "" }, style: { color: "#ffffff", fontSize: 56, fontWeight: 700, fontFamily: FONTS[0], textAlign: "left" } }),
};

const TOOLS = [
  { type: "text", label: "Text", icon: Type },
  { type: "clock", label: "Clock", icon: Clock },
  { type: "image", label: "Image / Logo", icon: ImageIcon },
  { type: "timed_text", label: "Timed text + photo", icon: CalendarClock },
  { type: "api_field", label: "API field", icon: Radio },
];

export default function SceneEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [scene, setScene] = useState(null);
  const [sources, setSources] = useState([]);
  const [selId, setSelId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/scenes/${id}`).then(({ data }) => setScene(data)).catch(() => { toast.error("Scene not found"); nav("/scenes"); });
    api.get("/sources").then(({ data }) => setSources(data)).catch(() => {});
  }, [id]);

  const sel = scene?.elements.find((e) => e.id === selId) || null;

  const updateEl = useCallback((elId, patch) => {
    setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === elId ? { ...e, ...patch } : e) }));
  }, []);
  const updateProps = (patch) => setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, props: { ...e.props, ...patch } } : e) }));
  const updateStyle = (patch) => setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, style: { ...e.style, ...patch } } : e) }));

  const addEl = (type) => {
    const el = templates[type]();
    setScene((s) => ({ ...s, elements: [...s.elements, el] }));
    setSelId(el.id);
  };
  const delEl = () => { setScene((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== selId) })); setSelId(null); };

  const save = async (silent) => {
    setSaving(true);
    try {
      await api.put(`/scenes/${id}`, { name: scene.name, width: scene.width, height: scene.height, background: scene.background, elements: scene.elements });
      if (!silent) toast.success("Scene saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  const goExport = async () => { await save(true); nav(`/scenes/${id}/export`); };

  if (!scene) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const srcFields = sources.find((s) => s.id === sel?.props?.sourceId)?.fields || [];

  return (
    <AppLayout title={scene.name} subtitle="Drag elements on the 16:9 canvas, then export to vMix."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/scenes")}>Back</SecondaryButton>
        <SecondaryButton icon={Save} data-testid="save-scene-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</SecondaryButton>
        <PrimaryButton icon={Upload} data-testid="export-scene-btn" onClick={goExport}>Export to vMix</PrimaryButton>
      </>}>

      <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr_300px] gap-4">
        {/* toolbar */}
        <div className="bg-white rounded-3xl clara-soft p-4 h-fit">
          <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Add element</div>
          <div className="space-y-1.5">
            {TOOLS.map((t) => (
              <button key={t.type} data-testid={`add-${t.type}`} onClick={() => addEl(t.type)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-100 transition-colors">
                <t.icon className="h-4 w-4 text-brand-600" />{t.label}
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Background</Label>
            <input type="color" data-testid="bg-color" value={scene.background?.color || "#0b1020"}
              onChange={(e) => setScene({ ...scene, background: { ...scene.background, color: e.target.value } })}
              className="w-full h-9 rounded-lg cursor-pointer border border-slate-200" />
            <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold pt-1 block">Image / video background</Label>
            <ImageUpload accept="image/*,video/*" maxMB={50} previewClass="h-20"
              value={scene.background?.type && scene.background?.type !== "color" ? scene.background?.src : ""}
              onChange={(url) => setScene({ ...scene, background: url
                ? { color: scene.background?.color || "#0b1020", type: /\.(mp4|webm|mov|ogg)$/i.test(url) ? "video" : "image", src: url }
                : { color: scene.background?.color || "#0b1020" } })}
              testid="bg-media" />
            <p className="text-[10px] text-slate-400">Upload an MP4/WebM or GIF for a moving background (max 50 MB).</p>
            {scene.background?.src && scene.background?.type !== "color" && (
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Fit</Label>
                  <Select value={scene.background?.fit || "cover"} onValueChange={(v) => setScene({ ...scene, background: { ...scene.background, fit: v } })}>
                    <SelectTrigger className="rounded-xl" data-testid="bg-fit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Fill (cover)</SelectItem>
                      <SelectItem value="contain">Fit (contain)</SelectItem>
                      <SelectItem value="repeat">Repeat (tile)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Dim overlay</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" data-testid="bg-overlay-color" value={scene.background?.overlayColor || "#000000"} onChange={(e) => setScene({ ...scene, background: { ...scene.background, overlayColor: e.target.value } })} className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer" />
                    <input type="range" min="0" max="1" step="0.05" value={scene.background?.overlayOpacity ?? 0} onChange={(e) => setScene({ ...scene, background: { ...scene.background, overlayOpacity: parseFloat(e.target.value) } })} className="flex-1 accent-brand-600" data-testid="bg-overlay-opacity" />
                    <span className="text-xs text-slate-500 w-9 text-right">{Math.round((scene.background?.overlayOpacity ?? 0) * 100)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* canvas */}
        <div className="bg-slate-100 rounded-3xl clara-soft p-4">
          <div className="rounded-2xl overflow-hidden ring-1 ring-slate-300 shadow-inner">
            <SceneCanvas scene={scene} editable selectedId={selId} onSelect={setSelId} onUpdate={updateEl} />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Canvas {scene.width}×{scene.height} · click an element to edit · drag the corner to resize</p>
        </div>

        {/* properties */}
        <div className="bg-white rounded-3xl clara-soft p-4 h-fit">
          {!sel ? (
            <p className="text-sm text-slate-400 text-center py-8">Select an element to edit its properties.</p>
          ) : (
            <div className="space-y-3" data-testid="properties-panel">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{sel.type.replace("_", " ")}</span>
                <button data-testid="delete-el-btn" onClick={delEl} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>

              <div className="space-y-1.5"><Label>Field name (vMix column)</Label>
                <Input value={sel.props.name || ""} onChange={(e) => updateProps({ name: e.target.value })} className="rounded-xl text-sm font-mono" data-testid="prop-name" /></div>

              {(sel.type === "text") && (
                <div className="space-y-1.5"><Label>Text</Label>
                  <Textarea value={sel.props.text || ""} onChange={(e) => updateProps({ text: e.target.value })} className="rounded-xl text-sm" data-testid="prop-text" /></div>
              )}

              {sel.type === "clock" && (
                <>
                  <div className="space-y-1.5"><Label>Timezone (IANA)</Label>
                    <Input value={sel.props.timezone || ""} onChange={(e) => updateProps({ timezone: e.target.value })} className="rounded-xl text-sm" placeholder="Europe/Brussels" /></div>
                  <div className="space-y-1.5"><Label>Format</Label>
                    <Input value={sel.props.format || ""} onChange={(e) => updateProps({ format: e.target.value })} className="rounded-xl text-sm font-mono" placeholder="HH:mm:ss" /></div>
                  <p className="text-[11px] text-slate-400">Tokens: HH mm ss DD MM YYYY MMMM dddd</p>
                </>
              )}

              {sel.type === "image" && (
                <div className="space-y-1.5"><Label>Image / logo</Label>
                  <ImageUpload value={sel.props.src} onChange={(url) => updateProps({ src: url })} testid="prop-src" /></div>
              )}

              {sel.type === "timed_text" && (
                <>
                  <div className="space-y-1.5"><Label>Text</Label>
                    <Textarea value={sel.props.text || ""} onChange={(e) => updateProps({ text: e.target.value })} className="rounded-xl text-sm" data-testid="prop-text" /></div>
                  <div className="space-y-1.5"><Label>Photo</Label>
                    <ImageUpload value={sel.props.image} onChange={(url) => updateProps({ image: url })} testid="prop-photo" /></div>
                  <div className="space-y-1.5"><Label>Photo position</Label>
                    <Select value={sel.props.imagePosition || "left"} onValueChange={(v) => updateProps({ imagePosition: v })}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="top">Top</SelectItem></SelectContent>
                    </Select></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Show from</Label><Input type="time" value={sel.props.start || ""} onChange={(e) => updateProps({ start: e.target.value })} className="rounded-xl text-sm" data-testid="prop-start" /></div>
                    <div className="space-y-1.5"><Label>until</Label><Input type="time" value={sel.props.end || ""} onChange={(e) => updateProps({ end: e.target.value })} className="rounded-xl text-sm" data-testid="prop-end" /></div>
                  </div>
                  <p className="text-[11px] text-slate-400">Leave times empty to always show.</p>
                </>
              )}

              {sel.type === "api_field" && (
                <>
                  <div className="space-y-1.5"><Label>Source</Label>
                    <Select value={sel.props.sourceId || ""} onValueChange={(v) => updateProps({ sourceId: v, fieldKey: "" })}>
                      <SelectTrigger className="rounded-xl" data-testid="prop-source"><SelectValue placeholder="Choose source" /></SelectTrigger>
                      <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="space-y-1.5"><Label>Field</Label>
                    <Select value={sel.props.fieldKey || ""} onValueChange={(v) => updateProps({ fieldKey: v })}>
                      <SelectTrigger className="rounded-xl" data-testid="prop-field"><SelectValue placeholder="Choose field" /></SelectTrigger>
                      <SelectContent>{srcFields.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Prefix</Label><Input value={sel.props.prefix || ""} onChange={(e) => updateProps({ prefix: e.target.value })} className="rounded-xl text-sm" /></div>
                    <div className="space-y-1.5"><Label>Suffix</Label><Input value={sel.props.suffix || ""} onChange={(e) => updateProps({ suffix: e.target.value })} className="rounded-xl text-sm" /></div>
                  </div>
                </>
              )}

              {sel.type !== "image" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Font size</Label><Input type="number" value={sel.style.fontSize || 40} onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value) || 40 })} className="rounded-xl text-sm" /></div>
                    <div className="space-y-1.5"><Label>Color</Label><input type="color" value={sel.style.color || "#ffffff"} onChange={(e) => updateStyle({ color: e.target.value })} className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer" data-testid="prop-color" /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Font</Label>
                    <Select value={sel.style.fontFamily || FONTS[0]} onValueChange={(v) => updateStyle({ fontFamily: v })}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f.split(",")[0].replace(/'/g, "")}</span></SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Weight</Label>
                      <Select value={String(sel.style.fontWeight || 600)} onValueChange={(v) => updateStyle({ fontWeight: parseInt(v) })}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>{[300, 400, 500, 600, 700, 800].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div className="space-y-1.5"><Label>Align</Label>
                      <Select value={sel.style.textAlign || "left"} onValueChange={(v) => updateStyle({ textAlign: v })}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>{["left", "center", "right"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select></div>
                  </div>
                  <div className="space-y-1.5"><Label>Background</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={sel.style.backgroundColor || "#000000"} onChange={(e) => updateStyle({ backgroundColor: e.target.value })} className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer" />
                      <SecondaryButton onClick={() => updateStyle({ backgroundColor: undefined })} className="text-xs py-1.5">Clear</SecondaryButton>
                    </div></div>
                </>
              )}

              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
                {["x", "y", "w", "h"].map((k) => (
                  <div key={k} className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">{k}</Label>
                    <Input type="number" value={sel[k]} onChange={(e) => updateEl(sel.id, { [k]: parseInt(e.target.value) || 0 })} className="rounded-lg text-xs px-2" /></div>
                ))}
              </div>
              <div className="space-y-1.5"><Label>Opacity: {Math.round((sel.opacity ?? 1) * 100)}%</Label>
                <input type="range" min="0" max="1" step="0.05" value={sel.opacity ?? 1} onChange={(e) => updateEl(sel.id, { opacity: parseFloat(e.target.value) })} className="w-full accent-brand-600" /></div>

              <div className="space-y-1.5 pt-3 border-t border-slate-100">
                <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Animation</Label>
                <Select value={sel.props.animation || "none"} onValueChange={(v) => updateProps({ animation: v })}>
                  <SelectTrigger className="rounded-xl" data-testid="prop-animation"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["none", "pulse", "fade", "spin", "bounce", "float", "blink", "slide"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                {sel.props.animation && sel.props.animation !== "none" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-20 shrink-0">Speed {sel.props.animationDuration || 2}s</span>
                    <input type="range" min="0.3" max="6" step="0.1" value={sel.props.animationDuration ?? 2} onChange={(e) => updateProps({ animationDuration: parseFloat(e.target.value) })} className="flex-1 accent-brand-600" data-testid="prop-anim-speed" />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">vMix output URL</Label>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <code data-testid="el-output-url" className="flex-1 min-w-0 truncate text-[10px] font-mono bg-slate-900 text-slate-100 rounded-lg px-2 py-1.5">{`${BACKEND}/api/public/scene/${scene.public_token}/element/${sel.id}.txt`}</code>
                  <button data-testid="copy-el-output" onClick={() => { navigator.clipboard.writeText(`${BACKEND}/api/public/scene/${scene.public_token}/element/${sel.id}.txt`); toast.success("vMix output URL copied"); }} className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Live text output for this element — add it in vMix as a Data Source. Save the scene first.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
