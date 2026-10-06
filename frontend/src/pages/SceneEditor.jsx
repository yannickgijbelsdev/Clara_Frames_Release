import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import SceneCanvas from "@/components/SceneCanvas";
import ElementInspector from "@/components/ElementInspector";
import LayersPanel from "@/components/LayersPanel";
import { ImageUpload } from "@/components/ImageUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Upload, Trash2, ArrowLeft, Loader2, Copy, Film, Layers } from "lucide-react";
import { templates, TOOLS, uid } from "@/lib/elementDefs";

export default function SceneEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [scene, setScene] = useState(null);
  const [sources, setSources] = useState([]);
  const [overlays, setOverlays] = useState([]);
  const [sourceValues, setSourceValues] = useState({});
  const [formsList, setFormsList] = useState([]);
  const [flows, setFlows] = useState([]);
  const [pancartes, setPancartes] = useState([]);
  const [selId, setSelId] = useState(null);
  const [selFlowId, setSelFlowId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/scenes/${id}`).then(({ data }) => setScene(data)).catch(() => { toast.error("Scene not found"); nav("/scenes"); });
    api.get("/sources").then(({ data }) => setSources(data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!scene?.workspace_id) return;
    api.get(`/flows?workspace_id=${scene.workspace_id}`).then(({ data }) => setFlows(data)).catch(() => {});
    api.get(`/pancartes?workspace_id=${scene.workspace_id}`).then(({ data }) => setPancartes(data)).catch(() => {});
    api.get(`/overlays?workspace_id=${scene.workspace_id}`).then(({ data }) => setOverlays(data)).catch(() => {});
    api.get(`/forms?workspace_id=${scene.workspace_id}`).then(({ data }) => setFormsList(data)).catch(() => {});
    const fetchVals = () => api.get(`/sources/values?workspace_id=${scene.workspace_id}`).then(({ data }) => setSourceValues(data)).catch(() => {});
    fetchVals();
    const t = setInterval(fetchVals, 15000);
    return () => clearInterval(t);
  }, [scene?.workspace_id]);

  const pancartesById = useMemo(() => Object.fromEntries(pancartes.map((p) => [p.id, p])), [pancartes]);
  const flowsData = useMemo(() => {
    const map = {};
    flows.forEach((f) => { map[f.id] = { flow: f, pancartes: (f.pancarte_ids || []).map((pid) => pancartesById[pid]).filter(Boolean) }; });
    return map;
  }, [flows, pancartesById]);

  const sel = scene?.elements.find((e) => e.id === selId) || null;
  const selFlow = scene?.flows?.find((f) => f.id === selFlowId) || null;

  const addFlow = () => {
    const f = { id: uid(), flow_id: "", x: 480, y: 720, w: 960, h: 540, schedule: { mode: "always", everyMinutes: 5, showSeconds: 15 } };
    setScene((s) => ({ ...s, flows: [...(s.flows || []), f] }));
    setSelId(null); setSelFlowId(f.id);
  };
  const updateFlow = (fid, patch) => setScene((s) => ({ ...s, flows: s.flows.map((f) => f.id === fid ? { ...f, ...patch } : f) }));
  const updateSchedule = (patch) => setScene((s) => ({ ...s, flows: s.flows.map((f) => f.id === selFlowId ? { ...f, schedule: { ...f.schedule, ...patch } } : f) }));
  const delFlow = () => { setScene((s) => ({ ...s, flows: s.flows.filter((f) => f.id !== selFlowId) })); setSelFlowId(null); };

  const updateEl = useCallback((elId, patch) => {
    setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === elId ? { ...e, ...patch } : e) }));
  }, []);
  const updateProps = (patch) => setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, props: { ...e.props, ...patch } } : e) }));
  const updateStyle = (patch) => setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === selId ? { ...e, style: { ...e.style, ...patch } } : e) }));

  const addEl = (type) => {
    const el = templates[type]();
    setScene((s) => ({ ...s, elements: [...s.elements, el] }));
    setSelId(el.id); setSelFlowId(null);
  };
  const delEl = () => { setScene((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== selId) })); setSelId(null); };
  const reorderEls = (arr) => setScene((s) => ({ ...s, elements: arr }));
  const toggleVisible = (elId) => setScene((s) => ({ ...s, elements: s.elements.map((e) => e.id === elId ? { ...e, hidden: !e.hidden } : e) }));
  const deleteEl = (elId) => { setScene((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== elId) })); setSelId((cur) => cur === elId ? null : cur); };

  const save = async (silent) => {
    setSaving(true);
    try {
      await api.put(`/scenes/${id}`, { name: scene.name, width: scene.width, height: scene.height, background: scene.background, elements: scene.elements, flows: scene.flows || [] });
      if (!silent) toast.success("Scene saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };
  const goExport = async () => { await save(true); nav(`/scenes/${id}/export`); };

  if (!scene) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const selFlowDef = selFlow ? flowsData[selFlow.flow_id]?.flow : null;

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
            <button data-testid="add-flow" onClick={addFlow}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 border border-brand-200 bg-brand-50/40 transition-colors">
              <Film className="h-4 w-4 text-brand-600" />Pancarte flow
            </button>
          </div>
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Layers <span className="text-slate-300 normal-case tracking-normal">· top = front</span></div>
            <LayersPanel elements={scene.elements} selectedId={selId}
              onSelect={(sid) => { setSelId(sid); setSelFlowId(null); }}
              onReorder={reorderEls} onToggleVisible={toggleVisible} onDelete={deleteEl} />
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
            <SceneCanvas scene={scene} editable selectedId={selId} onSelect={(sid) => { setSelId(sid); if (sid) setSelFlowId(null); }} onUpdate={updateEl}
              selectedFlowId={selFlowId} onSelectFlow={(fid) => { setSelFlowId(fid); if (fid) setSelId(null); }} onUpdateFlow={updateFlow} flowsData={flowsData} sourceValues={sourceValues} />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Canvas {scene.width}×{scene.height} · click an element to edit · drag the corner to resize</p>
        </div>

        {/* properties */}
        <div className="bg-white rounded-3xl clara-soft p-4 h-fit">
          {selFlow ? (
            <div className="space-y-3" data-testid="flow-panel">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Pancarte flow</span>
                <button data-testid="delete-flow-btn" onClick={delFlow} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5"><Label>Which flow</Label>
                <Select value={selFlow.flow_id || ""} onValueChange={(v) => updateFlow(selFlow.id, { flow_id: v })}>
                  <SelectTrigger className="rounded-xl" data-testid="flow-select"><SelectValue placeholder="Choose a flow" /></SelectTrigger>
                  <SelectContent>{flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({(f.pancarte_ids || []).length})</SelectItem>)}</SelectContent>
                </Select>
                <button onClick={() => nav("/flows")} className="text-xs text-brand-600 font-medium inline-flex items-center gap-1 mt-1"><Layers className="h-3 w-3" />Create / edit flows</button>
              </div>
              {selFlowDef && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-xs text-slate-500">
                  {(selFlowDef.pancarte_ids || []).length} pancarte(s) · {selFlowDef.interval || 5}s each · entrance: {selFlowDef.entrance || "none"}
                </div>
              )}
              <div className="space-y-1.5"><Label>When to show</Label>
                <Select value={selFlow.schedule?.mode || "always"} onValueChange={(v) => updateSchedule({ mode: v })}>
                  <SelectTrigger className="rounded-xl" data-testid="flow-schedule"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="always">Always on (cycle pancartes)</SelectItem><SelectItem value="everyX">Timed (appear every X min, then close)</SelectItem></SelectContent>
                </Select></div>
              {selFlow.schedule?.mode === "everyX" && (() => {
                const sch = selFlow.schedule || {};
                const count = (selFlowDef?.pancarte_ids || []).length;
                const per = selFlowDef?.interval || 5;
                const lead = sch.intro?.url ? (sch.intro.leadSeconds ?? 10) : 0;
                const outro = sch.outro?.url ? (sch.outro.seconds ?? 5) : 0;
                const total = lead + count * per + outro;
                const setOverlay = (slot, id) => {
                  const o = overlays.find((x) => x.id === id);
                  const extra = slot === "intro" ? { leadSeconds: sch.intro?.leadSeconds ?? 10 } : { seconds: sch.outro?.seconds ?? 5 };
                  updateSchedule({ [slot]: id === "none" ? null : { overlayId: id, url: o?.url || "", kind: o?.kind || "", name: o?.name || "", fit: o?.kind === "html" ? undefined : "contain", ...extra } });
                };
                return (
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label>Appear every (min)</Label>
                      <Input type="number" min="1" value={sch.everyMinutes || 10} onChange={(e) => updateSchedule({ everyMinutes: parseInt(e.target.value) || 10 })} className="rounded-xl text-sm" data-testid="flow-every" /></div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Intro overlay (before pancartes)</Label>
                      <Select value={sch.intro?.overlayId || "none"} onValueChange={(v) => setOverlay("intro", v)}>
                        <SelectTrigger className="rounded-xl" data-testid="flow-intro-overlay"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{overlays.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
                      </Select>
                      {sch.intro?.url && (
                        <div className="space-y-1.5"><Label>Starts … sec before</Label>
                          <Input type="number" min="0" value={sch.intro?.leadSeconds ?? 10} onChange={(e) => updateSchedule({ intro: { ...sch.intro, leadSeconds: parseInt(e.target.value) || 0 } })} className="rounded-xl text-sm" data-testid="flow-intro-lead" /></div>
                      )}
                      {overlays.length === 0 && <p className="text-[11px] text-slate-400">Upload overlays on the Overlays page to use them here.</p>}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">End overlay (after pancartes)</Label>
                      <Select value={sch.outro?.overlayId || "none"} onValueChange={(v) => setOverlay("outro", v)}>
                        <SelectTrigger className="rounded-xl" data-testid="flow-outro-overlay"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{overlays.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
                      </Select>
                      {sch.outro?.url && (
                        <div className="space-y-1.5"><Label>Show for … sec</Label>
                          <Input type="number" min="1" value={sch.outro?.seconds ?? 5} onChange={(e) => updateSchedule({ outro: { ...sch.outro, seconds: parseInt(e.target.value) || 1 } })} className="rounded-xl text-sm" data-testid="flow-outro-seconds" /></div>
                      )}
                    </div>

                    <div className="rounded-xl bg-brand-50/60 border border-brand-100 p-2.5 text-xs text-slate-600" data-testid="flow-timeline-summary">
                      Every {sch.everyMinutes || 10} min: {lead > 0 ? `${lead}s intro → ` : ""}{count} pancarte{count === 1 ? "" : "s"} × {per}s{outro > 0 ? ` → ${outro}s end` : ""} → closes automatically ({total}s total).
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
                {["x", "y", "w", "h"].map((k) => (
                  <div key={k} className="space-y-1"><Label className="text-[10px] uppercase text-slate-400">{k}</Label>
                    <Input type="number" value={selFlow[k]} onChange={(e) => updateFlow(selFlow.id, { [k]: parseInt(e.target.value) || 0 })} className="rounded-lg text-xs px-2" /></div>
                ))}
              </div>
            </div>
          ) : !sel ? (
            <p className="text-sm text-slate-400 text-center py-8">Select an element or flow to edit its properties.</p>
          ) : (
            <ElementInspector sel={sel} sources={sources} overlays={overlays} forms={formsList} updateProps={updateProps} updateStyle={updateStyle} updateEl={updateEl} delEl={delEl}
              footer={
                <div className="pt-3 border-t border-slate-100">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">vMix output URL</Label>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <code data-testid="el-output-url" className="flex-1 min-w-0 truncate text-[10px] font-mono bg-slate-900 text-slate-100 rounded-lg px-2 py-1.5">{`${BACKEND}/api/public/scene/${scene.public_token}/element/${sel.id}.txt`}</code>
                    <button data-testid="copy-el-output" onClick={() => { navigator.clipboard.writeText(`${BACKEND}/api/public/scene/${scene.public_token}/element/${sel.id}.txt`); toast.success("vMix output URL copied"); }} className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Live text output for this element — add it in vMix as a Data Source. Save the scene first.</p>
                </div>
              } />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
