import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND } from "@/lib/api";
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
import { Save, Upload, Trash2, ArrowLeft, Loader2, Copy, Film, Layers, Radio, Power } from "lucide-react";
import { templates, TOOLS, uid } from "@/lib/elementDefs";
import { Switch } from "@/components/ui/switch";
import LiveViewDialog from "@/components/LiveViewDialog";

export default function SceneEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [scene, setScene] = useState(null);
  const [sources, setSources] = useState([]);
  const [overlays, setOverlays] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const [sourceValues, setSourceValues] = useState({});
  const [formsList, setFormsList] = useState([]);
  const [flows, setFlows] = useState([]);
  const [pancartes, setPancartes] = useState([]);
  const [selId, setSelId] = useState(null);
  const [selFlowId, setSelFlowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  useEffect(() => {
    api.get(`/scenes/${id}`).then(({ data }) => setScene(data)).catch(() => { toast.error("Scene not found"); nav("/scenes"); });
    api.get("/sources").then(({ data }) => setSources(data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!scene?.workspace_id) return;
    api.get(`/flows?workspace_id=${scene.workspace_id}`).then(({ data }) => setFlows(data)).catch(() => {});
    api.get(`/pancartes?workspace_id=${scene.workspace_id}`).then(({ data }) => setPancartes(data)).catch(() => {});
    api.get(`/overlays?workspace_id=${scene.workspace_id}`).then(({ data }) => setOverlays(data)).catch(() => {});
    api.get(`/fonts?workspace_id=${scene.workspace_id}`).then(({ data }) => { setCustomFonts(data); injectFontFaces(data); }).catch(() => {});
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
    const f = { id: uid(), flow_id: "", x: 480, y: 720, w: 960, h: 540, enabled: true, disabledPancartes: [], schedule: { mode: "always", everyMinutes: 5, showSeconds: 20 } };
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
        <SecondaryButton icon={Layers} data-testid="scene-overview-btn" onClick={async () => { await save(true); nav(`/scenes/${id}/overview`); }}>Overview</SecondaryButton>
        <SecondaryButton icon={Save} data-testid="save-scene-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</SecondaryButton>
        <SecondaryButton icon={Radio} data-testid="live-view-btn" onClick={async () => { await save(true); setLiveOpen(true); }}>Live view</SecondaryButton>
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
              <Film className="h-4 w-4 text-brand-600" />Overlay sequence
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
            {(() => {
              const bg = scene.background || {};
              const bgMode = bg.mode || (bg.type === "stream" ? "stream" : (bg.src && bg.type !== "color" ? "media" : (bg.type === "color" ? "color" : "transparent")));
              const setBgMode = (mode) => {
                if (mode === "transparent") setScene({ ...scene, background: { mode: "transparent" } });
                else if (mode === "color") setScene({ ...scene, background: { mode: "color", color: bg.color || "#0b1020" } });
                else if (mode === "media") setScene({ ...scene, background: { mode: "media", type: bg.type === "video" ? "video" : "image", src: bg.type && bg.type !== "stream" && bg.type !== "color" ? (bg.src || "") : "", fit: bg.fit || "cover", overlayColor: bg.overlayColor, overlayOpacity: bg.overlayOpacity } });
                else if (mode === "stream") setScene({ ...scene, background: { mode: "stream", type: "stream", stream: bg.stream || "vimeo", src: bg.type === "stream" ? (bg.src || "") : "", fit: bg.fit || "cover" } });
              };
              return (
                <>
                  <Select value={bgMode} onValueChange={setBgMode}>
                    <SelectTrigger className="rounded-xl" data-testid="bg-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transparent">Transparent (vMix overlay)</SelectItem>
                      <SelectItem value="color">Solid color</SelectItem>
                      <SelectItem value="media">Image / video</SelectItem>
                      <SelectItem value="stream">Stream (Vimeo / HLS)</SelectItem>
                    </SelectContent>
                  </Select>

                  {bgMode === "transparent" && (
                    <p className="text-[11px] text-slate-400">Transparant — vMix ziet enkel je elementen bovenop je andere inputs. Aanrader voor overlays.</p>
                  )}

                  {bgMode === "color" && (
                    <input type="color" data-testid="bg-color" value={bg.color || "#0b1020"}
                      onChange={(e) => setScene({ ...scene, background: { mode: "color", color: e.target.value } })}
                      className="w-full h-9 rounded-lg cursor-pointer border border-slate-200" />
                  )}

                  {bgMode === "media" && (
                    <>
                      <ImageUpload accept="image/*,video/*" maxMB={50} previewClass="h-20"
                        value={bg.src || ""}
                        onChange={(url) => setScene({ ...scene, background: { ...bg, mode: "media", type: /\.(mp4|webm|mov|ogg)$/i.test(url || "") ? "video" : "image", src: url || "", fit: bg.fit || "cover" } })}
                        testid="bg-media" />
                      {bg.src && (
                        <div className="space-y-2 pt-1">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Fit</Label>
                            <Select value={bg.fit || "cover"} onValueChange={(v) => setScene({ ...scene, background: { ...bg, fit: v } })}>
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
                              <input type="color" data-testid="bg-overlay-color" value={bg.overlayColor || "#000000"} onChange={(e) => setScene({ ...scene, background: { ...bg, overlayColor: e.target.value } })} className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer" />
                              <input type="range" min="0" max="1" step="0.05" value={bg.overlayOpacity ?? 0} onChange={(e) => setScene({ ...scene, background: { ...bg, overlayOpacity: parseFloat(e.target.value) } })} className="flex-1 accent-brand-600" data-testid="bg-overlay-opacity" />
                              <span className="text-xs text-slate-500 w-9 text-right">{Math.round((bg.overlayOpacity ?? 0) * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {bgMode === "stream" && (
                    <>
                      <Input data-testid="bg-stream" placeholder="https://vimeo.com/123… of https://…/stream.m3u8"
                        value={bg.src || ""}
                        onChange={(e) => {
                          const url = e.target.value.trim();
                          const stream = /vimeo\.com/i.test(url) ? "vimeo" : "hls";
                          setScene({ ...scene, background: { mode: "stream", type: "stream", stream, src: url, fit: bg.fit || "cover" } });
                        }}
                        className="rounded-xl text-sm" />
                      <p className="text-[11px] text-slate-400">{/vimeo/i.test(bg.src || "") ? "Vimeo" : "HLS"}-stream op de volledige achtergrond. Speelt automatisch, gedempt en in loop.</p>
                    </>
                  )}
                </>
              );
            })()}
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
                <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Overlay sequence</span>
                <button data-testid="delete-flow-btn" onClick={delFlow} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5"><Label>Which sequence</Label>
                <Select value={selFlow.flow_id || ""} onValueChange={(v) => updateFlow(selFlow.id, { flow_id: v })}>
                  <SelectTrigger className="rounded-xl" data-testid="flow-select"><SelectValue placeholder="Choose a sequence" /></SelectTrigger>
                  <SelectContent>{flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({(f.pancarte_ids || []).length})</SelectItem>)}</SelectContent>
                </Select>
                <button onClick={() => nav("/sequences")} className="text-xs text-brand-600 font-medium inline-flex items-center gap-1 mt-1"><Layers className="h-3 w-3" />Create / edit sequences</button>
              </div>
              {selFlowDef && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-xs text-slate-500">
                  {(selFlowDef.pancarte_ids || []).length} pancarte(s) · {selFlowDef.interval || 5}s each · entrance: {selFlowDef.entrance || "none"}
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-2"><Power className="h-4 w-4 text-brand-600" />Sequence enabled in this scene</span>
                <Switch data-testid="flow-enabled-toggle" checked={selFlow.enabled !== false} onCheckedChange={(v) => updateFlow(selFlow.id, { enabled: v })} />
              </div>

              {selFlowDef && (selFlowDef.pancarte_ids || []).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Overlays in this scene</Label>
                  <div className="space-y-1" data-testid="flow-pancarte-toggles">
                    {(selFlowDef.pancarte_ids || []).map((pid) => {
                      const p = pancartesById[pid];
                      if (!p) return null;
                      const off = (selFlow.disabledPancartes || []).includes(pid);
                      return (
                        <label key={pid} data-testid={`flow-pancarte-toggle-${pid}`}
                          className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={!off} onChange={(e) => {
                            const cur = new Set(selFlow.disabledPancartes || []);
                            if (e.target.checked) cur.delete(pid); else cur.add(pid);
                            updateFlow(selFlow.id, { disabledPancartes: [...cur] });
                          }} className="h-4 w-4 rounded accent-brand-600" />
                          <span className={`text-sm truncate ${off ? "text-slate-400 line-through" : "text-slate-700"}`}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400">Disabled overlays are skipped — only in this scene.</p>
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
                const show = sch.showSeconds ?? 20;
                const every = sch.everyMinutes || 5;
                const lead = sch.intro?.url ? (sch.intro.leadSeconds ?? 5) : 0;
                const outro = sch.outro?.url ? (sch.outro.seconds ?? 5) : 0;
                const total = show;
                const overflow = total >= every * 60;
                const setOverlay = (slot, id) => {
                  const o = overlays.find((x) => x.id === id);
                  const extra = slot === "intro" ? { leadSeconds: sch.intro?.leadSeconds ?? 5 } : { seconds: sch.outro?.seconds ?? 5 };
                  updateSchedule({ [slot]: id === "none" ? null : { overlayId: id, url: o?.url || "", kind: o?.kind || "", name: o?.name || "", fit: o?.kind === "html" ? undefined : "contain", ...extra } });
                };
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label>Appear every (min)</Label>
                        <Input type="number" min="1" value={sch.everyMinutes || 5} onChange={(e) => updateSchedule({ everyMinutes: parseInt(e.target.value) || 1 })} className="rounded-xl text-sm" data-testid="flow-every" /></div>
                      <div className="space-y-1.5"><Label>Show for (sec)</Label>
                        <Input type="number" min="1" value={sch.showSeconds ?? 20} onChange={(e) => updateSchedule({ showSeconds: parseInt(e.target.value) || 1 })} className="rounded-xl text-sm" data-testid="flow-show-seconds" /></div>
                    </div>
                    <p className="text-[11px] text-slate-400">Aligns to the clock from midnight (e.g. every 5 min → 12:00, 12:05, 12:10 …). Pancartes cycle within the show window every {per}s.</p>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Intro overlay (overlaps start)</Label>
                      <Select value={sch.intro?.overlayId || "none"} onValueChange={(v) => setOverlay("intro", v)}>
                        <SelectTrigger className="rounded-xl" data-testid="flow-intro-overlay"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{overlays.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
                      </Select>
                      {sch.intro?.url && (
                        <div className="space-y-1.5"><Label>Overlaps first … sec</Label>
                          <Input type="number" min="0" value={sch.intro?.leadSeconds ?? 5} onChange={(e) => updateSchedule({ intro: { ...sch.intro, leadSeconds: parseInt(e.target.value) || 0 } })} className="rounded-xl text-sm" data-testid="flow-intro-lead" /></div>
                      )}
                      {overlays.length === 0 && <p className="text-[11px] text-slate-400">Upload assets on the Assets page to use them here.</p>}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">End overlay (overlaps end)</Label>
                      <Select value={sch.outro?.overlayId || "none"} onValueChange={(v) => setOverlay("outro", v)}>
                        <SelectTrigger className="rounded-xl" data-testid="flow-outro-overlay"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{overlays.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
                      </Select>
                      {sch.outro?.url && (
                        <div className="space-y-1.5"><Label>Overlaps last … sec</Label>
                          <Input type="number" min="1" value={sch.outro?.seconds ?? 5} onChange={(e) => updateSchedule({ outro: { ...sch.outro, seconds: parseInt(e.target.value) || 1 } })} className="rounded-xl text-sm" data-testid="flow-outro-seconds" /></div>
                      )}
                    </div>

                    <div className="rounded-xl bg-brand-50/60 border border-brand-100 p-2.5 text-xs text-slate-600" data-testid="flow-timeline-summary">
                      Every {every} min: shows {show}s ({count} pancarte{count === 1 ? "" : "s"} × {per}s){lead > 0 ? `, intro overlaps first ${lead}s` : ""}{outro > 0 ? `, end overlaps last ${outro}s` : ""} → closes automatically.
                    </div>
                    {overflow && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-700" data-testid="flow-overflow-warning">
                        ⚠ The show time ({total}s) is ≥ the {every} min cycle, so it never closes. Lower "Show for" or raise "Appear every".
                      </div>
                    )}
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
            <ElementInspector sel={sel} sources={sources} overlays={overlays} forms={formsList} customFonts={customFonts} updateProps={updateProps} updateStyle={updateStyle} updateEl={updateEl} delEl={delEl} allowTiming
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

      <LiveViewDialog open={liveOpen} onOpenChange={setLiveOpen} token={scene.public_token} name={scene.name} />
    </AppLayout>
  );
}
