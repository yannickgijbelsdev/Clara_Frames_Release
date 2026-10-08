import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import SceneCanvas from "@/components/SceneCanvas";
import ElementInspector from "@/components/ElementInspector";
import { injectFontFaces } from "@/lib/fonts";
import LayersPanel from "@/components/LayersPanel";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, ArrowLeft, Loader2, Link2, Radio } from "lucide-react";
import { templates, TOOLS, uid } from "@/lib/elementDefs";
import { BACKEND } from "@/lib/api";
import LiveViewDialog from "@/components/LiveViewDialog";

export default function PancarteEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [pan, setPan] = useState(null);
  const [sources, setSources] = useState([]);
  const [overlays, setOverlays] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const [sourceValues, setSourceValues] = useState({});
  const [formsList, setFormsList] = useState([]);
  const [selId, setSelId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  useEffect(() => {
    api.get(`/pancartes/${id}`).then(({ data }) => setPan(data)).catch(() => { toast.error("Overlay not found"); nav("/overlays"); });
    api.get("/sources").then(({ data }) => setSources(data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!pan?.workspace_id) return;
    api.get(`/overlays?workspace_id=${pan.workspace_id}`).then(({ data }) => setOverlays(data)).catch(() => {});
    api.get(`/fonts?workspace_id=${pan.workspace_id}`).then(({ data }) => { setCustomFonts(data); injectFontFaces(data); }).catch(() => {});
    api.get(`/forms?workspace_id=${pan.workspace_id}`).then(({ data }) => setFormsList(data)).catch(() => {});
    const fetchVals = () => api.get(`/sources/values?workspace_id=${pan.workspace_id}`).then(({ data }) => setSourceValues(data)).catch(() => {});
    fetchVals();
    const t = setInterval(fetchVals, 15000);
    return () => clearInterval(t);
  }, [pan?.workspace_id]);

  const sel = pan?.elements.find((e) => e.id === selId) || null;

  const updateEl = useCallback((elId, patch) => {
    setPan((s) => ({ ...s, elements: s.elements.map((e) => e.id === elId ? { ...e, ...patch } : e) }));
  }, []);
  const updateProps = (patch) => setPan((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, props: { ...e.props, ...patch } } : e) }));
  const updateStyle = (patch) => setPan((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, style: { ...e.style, ...patch } } : e) }));
  const addEl = (type) => { const el = templates[type](); setPan((s) => ({ ...s, elements: [...s.elements, el] })); setSelId(el.id); };
  const delEl = () => { setPan((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== selId) })); setSelId(null); };
  const reorderEls = (arr) => setPan((s) => ({ ...s, elements: arr }));
  const toggleVisible = (elId) => setPan((s) => ({ ...s, elements: s.elements.map((e) => e.id === elId ? { ...e, hidden: !e.hidden } : e) }));
  const deleteEl = (elId) => { setPan((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== elId) })); setSelId((cur) => cur === elId ? null : cur); };

  const save = async (silent) => {
    setSaving(true);
    try {
      await api.put(`/pancartes/${id}`, { name: pan.name, width: pan.width, height: pan.height, background: pan.background, elements: pan.elements });
      if (!silent) toast.success("Overlay saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!pan) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  return (
    <AppLayout title={pan.name} subtitle="Ontwerp deze overlay — eigen achtergrond en vrij plaatsbare elementen."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/overlays")}>Back</SecondaryButton>
        <SecondaryButton icon={Link2} data-testid="copy-overlay-link" onClick={() => { navigator.clipboard.writeText(`${BACKEND}/api/public/overlay/${pan.public_token}/overlay`); toast.success("vMix overlay-link gekopieerd"); }}>vMix-link</SecondaryButton>
        <SecondaryButton icon={Radio} data-testid="live-overlay-btn" onClick={async () => { await save(true); setLiveOpen(true); }}>Live view</SecondaryButton>
        <PrimaryButton icon={Save} data-testid="save-pancarte-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</PrimaryButton>
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
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Layers <span className="text-slate-300 normal-case tracking-normal">· top = front</span></div>
            <LayersPanel elements={pan.elements} selectedId={selId}
              onSelect={setSelId} onReorder={reorderEls} onToggleVisible={toggleVisible} onDelete={deleteEl} />
          </div>
          <div className="mt-5 space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Background</Label>
            <input type="color" data-testid="bg-color" value={pan.background?.color || "#0b1020"}
              onChange={(e) => setPan({ ...pan, background: { ...pan.background, color: e.target.value } })}
              className="w-full h-9 rounded-lg cursor-pointer border border-slate-200" />
            <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold pt-1 block">Image / video background</Label>
            <ImageUpload accept="image/*,video/*" maxMB={50} previewClass="h-20"
              value={pan.background?.type && pan.background?.type !== "color" ? pan.background?.src : ""}
              onChange={(url) => setPan({ ...pan, background: url
                ? { color: pan.background?.color || "#0b1020", type: /\.(mp4|webm|mov|ogg)$/i.test(url) ? "video" : "image", src: url }
                : { color: pan.background?.color || "#0b1020" } })}
              testid="bg-media" />
            {pan.background?.src && pan.background?.type !== "color" && (
              <div className="space-y-1 pt-1">
                <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Fit</Label>
                <Select value={pan.background?.fit || "cover"} onValueChange={(v) => setPan({ ...pan, background: { ...pan.background, fit: v } })}>
                  <SelectTrigger className="rounded-xl" data-testid="bg-fit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Fill (cover)</SelectItem>
                    <SelectItem value="contain">Fit (contain)</SelectItem>
                    <SelectItem value="repeat">Repeat (tile)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Label className="text-[11px] uppercase tracking-widest text-slate-400 font-bold pt-3 block">Canvas size</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Width</Label>
                <Input type="number" data-testid="pan-width" value={pan.width} onChange={(e) => setPan({ ...pan, width: parseInt(e.target.value) || 1920 })} className="rounded-lg text-xs px-2" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">Height</Label>
                <Input type="number" data-testid="pan-height" value={pan.height} onChange={(e) => setPan({ ...pan, height: parseInt(e.target.value) || 1080 })} className="rounded-lg text-xs px-2" /></div>
            </div>
          </div>
        </div>

        {/* canvas */}
        <div className="bg-slate-100 rounded-3xl clara-soft p-4">
          <div className="rounded-2xl overflow-hidden ring-1 ring-slate-300 shadow-inner">
            <SceneCanvas scene={pan} editable selectedId={selId} onSelect={setSelId} onUpdate={updateEl} sourceValues={sourceValues} />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Overlay {pan.width}×{pan.height} · click an element to edit · drag the corner to resize</p>
        </div>

        {/* properties */}
        <div className="bg-white rounded-3xl clara-soft p-4 h-fit">
          {!sel ? (
            <p className="text-sm text-slate-400 text-center py-8">Select an element to edit its properties.</p>
          ) : (
            <ElementInspector sel={sel} sources={sources} overlays={overlays} forms={formsList} customFonts={customFonts} updateProps={updateProps} updateStyle={updateStyle} updateEl={updateEl} delEl={delEl} />
          )}
        </div>
      </div>

      <LiveViewDialog open={liveOpen} onOpenChange={setLiveOpen} token={pan.public_token} name={pan.name} kind="overlay" />
    </AppLayout>
  );
}
