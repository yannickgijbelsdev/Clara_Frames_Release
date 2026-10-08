import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { useWorkspace } from "@/context/WorkspaceContext";
import { nextStartMs, nextStarts, fmtCountdown, fmtClock, sequenceDuration } from "@/lib/schedule";
import { toast } from "sonner";
import SceneCanvas from "@/components/SceneCanvas";
import PancarteView from "@/components/PancarteView";
import { injectFontFaces } from "@/lib/fonts";
import { Clock, Film, Radio, Repeat, CalendarClock, Layers, Database, ChevronDown, ChevronRight, Zap, Play, Square, RotateCcw, Tv } from "lucide-react";

const unitMult = (u) => (u === "hour" ? 3600 : u === "min" ? 60 : 1);

// Next clock-aligned appearance for an element with interval timing.
function elementIntervalNext(timing, nowMs) {
  const show = Math.max(1, timing.showSeconds || 10);
  const gap = Math.max(0, (parseFloat(timing.gap) || 0) * unitMult(timing.gapUnit || "min"));
  const cyc = show + gap;
  const d = new Date(nowMs);
  const sod = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const phase = sod % cyc;
  const onNow = phase < show;
  const untilNext = onNow ? 0 : cyc - phase;
  return { onNow, untilNext, show, cyc };
}

function MiniTimeline({ marks, windowMs = 3600000 }) {
  // marks: array of ms offsets from now within window
  return (
    <div className="relative h-8 rounded-lg bg-slate-100 overflow-hidden" data-testid="mini-timeline">
      {[0, 15, 30, 45, 60].map((m) => (
        <div key={m} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${(m / 60) * 100}%` }}>
          <span className="absolute -top-0.5 left-1 text-[9px] text-slate-400">{m === 0 ? "now" : `+${m}m`}</span>
        </div>
      ))}
      {marks.filter((o) => o >= 0 && o <= windowMs).map((o, i) => (
        <div key={i} className="absolute top-2 bottom-2 w-1 rounded-full bg-brand-500" style={{ left: `${(o / windowMs) * 100}%` }} title={`+${Math.round(o / 60000)}m`} />
      ))}
    </div>
  );
}

function SeqThumb({ pancarte, sourceValues }) {
  return (
    <div className="relative rounded-lg overflow-hidden ring-1 ring-slate-200 bg-slate-900 shrink-0" style={{ width: 104, aspectRatio: "16 / 9" }} data-testid="seq-thumb">
      {pancarte ? <PancarteView pancarte={pancarte} sourceValues={sourceValues} />
        : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">no overlay</div>}
    </div>
  );
}

export default function Timeline() {
  const nav = useNavigate();
  const { current } = useWorkspace();
  const [scenes, setScenes] = useState([]);
  const [flows, setFlows] = useState([]);
  const [sources, setSources] = useState([]);
  const [pancartes, setPancartes] = useState([]);
  const [sourceValues, setSourceValues] = useState({});
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!current) return;
    api.get(`/scenes?workspace_id=${current}`).then(({ data }) => setScenes(data)).catch(() => {});
    api.get(`/flows?workspace_id=${current}`).then(({ data }) => setFlows(data)).catch(() => {});
    api.get(`/sources?workspace_id=${current}`).then(({ data }) => setSources(data)).catch(() => {});
    api.get(`/pancartes?workspace_id=${current}`).then(({ data }) => setPancartes(data)).catch(() => {});
    api.get(`/fonts?workspace_id=${current}`).then(({ data }) => injectFontFaces(data)).catch(() => {});
    const fetchVals = () => api.get(`/sources/values?workspace_id=${current}`).then(({ data }) => setSourceValues(data)).catch(() => {});
    fetchVals();
    const t = setInterval(fetchVals, 15000);
    return () => clearInterval(t);
  }, [current]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const flowById = useMemo(() => Object.fromEntries(flows.map((f) => [f.id, f])), [flows]);
  const srcById = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);
  const pancartesById = useMemo(() => Object.fromEntries(pancartes.map((p) => [p.id, p])), [pancartes]);
  const flowsData = useMemo(() => {
    const map = {};
    flows.forEach((f) => { map[f.id] = { flow: f, pancartes: (f.pancarte_ids || []).map((pid) => pancartesById[pid]).filter(Boolean) }; });
    return map;
  }, [flows, pancartesById]);

  // Build per-scene programmed items
  const sceneData = useMemo(() => scenes.map((scene) => {
    const seqs = [], timedEls = [], srcIds = new Set();
    const collectEl = (el, where) => {
      const p = el.props || {};
      if (p.sourceId) srcIds.add(p.sourceId);
      const tm = el.timing || {};
      if (tm.triggerSource) srcIds.add(tm.triggerSource);
      if (tm.mode && tm.mode !== "always") {
        timedEls.push({ id: el.id, name: p.name || el.type, type: el.type, timing: tm, where,
          source: tm.triggerSource ? srcById[tm.triggerSource] : (p.sourceId ? srcById[p.sourceId] : null), field: tm.triggerField || p.fieldKey });
      }
    };
    (scene.elements || []).forEach((el) => collectEl(el, "scene"));
    (scene.flows || []).filter((pl) => pl.flow_id).forEach((pl) => {
      const flow = flowById[pl.flow_id];
      if (!flow) return;
      seqs.push({ placement: pl, flow });
      (flow.pancarte_ids || []).forEach(() => {}); // overlays' elements may bind sources too (resolved live)
    });
    return { scene, seqs, timedEls, srcIds: [...srcIds] };
  }), [scenes, flowById, srcById]);

  // Global "next up": scheduled sequences across all scenes sorted by next start
  const nextUp = useMemo(() => {
    const rows = [];
    sceneData.forEach(({ scene, seqs }) => {
      seqs.forEach(({ flow }) => {
        if ((flow.repeat || "loop") === "schedule") {
          rows.push({ scene, flow, next: nextStartMs(flow, now) });
        }
      });
    });
    return rows.sort((a, b) => a.next - b.next);
  }, [sceneData, now]);

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const reloadFlows = () => { if (current) api.get(`/flows?workspace_id=${current}`).then(({ data }) => setFlows(data)).catch(() => {}); };

  const triggerNow = async (flow) => {
    try {
      await api.post(`/flows/${flow.id}/trigger`);
      toast.success(`"${flow.name}" triggered — live overlays start now`);
      reloadFlows();
    } catch (e) {
      toast.error("Trigger failed");
    }
  };

  const stopSeq = async (flow) => {
    try {
      await api.post(`/flows/${flow.id}/stop`);
      toast.success(`"${flow.name}" interrupted — countdown stopped, playing the outro`);
      reloadFlows();
    } catch (e) {
      toast.error("Stop failed");
    }
  };

  const resumeSeq = async (flow) => {
    try {
      await api.post(`/flows/${flow.id}/resume`);
      toast.success(`"${flow.name}" resumed`);
      reloadFlows();
    } catch (e) {
      toast.error("Resume failed");
    }
  };

  const repeatLabel = (flow) => {
    const r = flow.repeat || "loop";
    if (r === "schedule") return flow.scheduleMode === "times" ? `at ${(flow.scheduleTimes || []).join(", ") || "—"}` : `every ${flow.scheduleEveryMin ?? 15} min`;
    if (r === "interval") return `play, wait ${flow.repeatEvery ?? 5} min, repeat`;
    if (r === "once") return "play once, then stop";
    return "continuous loop";
  };

  return (
    <AppLayout title="Timeline" subtitle="What is programmed and when it comes on screen — live countdowns across all scenes.">
      <div className="space-y-6">
        {/* Live now — on-screen previews */}
        <div className="bg-white rounded-3xl clara-soft p-5" data-testid="timeline-livenow">
          <div className="flex items-center gap-2 mb-4">
            <Tv className="h-5 w-5 text-brand-600" />
            <h2 className="font-display font-semibold text-slate-900">Live now — on-screen preview</h2>
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />LIVE
            </span>
          </div>
          {sceneData.filter((s) => s.seqs.length || (s.scene.elements || []).length).length === 0 ? (
            <p className="text-sm text-slate-400">No scenes to preview yet. Build a scene with elements or sequences.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sceneData.filter((s) => s.seqs.length || (s.scene.elements || []).length).map(({ scene, seqs }) => (
                <div key={scene.id} data-testid={`live-scene-${scene.id}`} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="relative bg-slate-900">
                    <SceneCanvas scene={scene} sourceValues={sourceValues} flowsData={flowsData} />
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-rose-600/90 rounded-full px-2 py-0.5 pointer-events-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />LIVE
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-brand-600 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">{scene.name}</span>
                      <button onClick={() => nav(`/scenes/${scene.id}`)} className="ml-auto text-xs text-brand-600 font-medium shrink-0">Edit →</button>
                    </div>
                    {seqs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {seqs.map(({ flow, placement }) => {
                          const r = flow.repeat || "loop";
                          const sched = r === "schedule";
                          const next = sched ? nextStartMs(flow, now) : null;
                          const [txt, cls] = flow.paused ? ["Paused", "bg-amber-50 text-amber-700"]
                            : sched ? [`next ${fmtCountdown(next - now)}`, "bg-blue-50 text-blue-700"]
                            : r === "loop" ? ["On air", "bg-emerald-50 text-emerald-700"]
                            : r === "once" ? ["one-shot", "bg-slate-100 text-slate-600"]
                            : ["cyclic", "bg-slate-100 text-slate-600"];
                          return (
                            <span key={placement.id} data-testid={`live-seq-${flow.id}`} className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${cls}`}>
                              <Film className="h-2.5 w-2.5" />{flow.name}: {txt}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global next up */}
        <div className="bg-white rounded-3xl clara-soft p-5" data-testid="timeline-nextup">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <h2 className="font-display font-semibold text-slate-900">Next up — scheduled sequences</h2>
            <span className="ml-auto text-sm text-slate-400 tabular-nums">{fmtClock(now)}</span>
          </div>
          {nextUp.length === 0 ? (
            <p className="text-sm text-slate-400">No scheduled sequences yet. Open a sequence and set "Play on a schedule".</p>
          ) : (
            <div className="space-y-3">
              {nextUp.map(({ scene, flow, next }) => {
                const marks = nextStarts(flow, 8, now).map((t) => t - now);
                return (
                  <div key={`${scene.id}-${flow.id}`} className="rounded-2xl border border-slate-200 p-3" data-testid={`nextup-${flow.id}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <SeqThumb pancarte={flowsData[flow.id]?.pancartes?.[0]} sourceValues={sourceValues} />
                      <Film className="h-4 w-4 text-brand-600 shrink-0" />
                      <button onClick={() => nav(`/sequences/${flow.id}`)} className="font-semibold text-slate-900 hover:text-brand-600 truncate">{flow.name}</button>
                      <span className="text-xs text-slate-400 truncate">in {scene.name} · {repeatLabel(flow)}</span>
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400">next {fmtClock(next)}</span>
                        {flow.paused ? (
                          <>
                            <span className="text-sm font-bold text-amber-600 bg-amber-50 rounded-lg px-2 py-0.5" data-testid={`nextup-paused-${flow.id}`}>Paused</span>
                            <button data-testid={`nextup-resume-${flow.id}`} onClick={() => resumeSeq(flow)} title="Resume this sequence"
                              className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                              <RotateCcw className="h-3 w-3" />Resume
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-bold tabular-nums text-brand-700 bg-brand-50 rounded-lg px-2 py-0.5" data-testid={`nextup-cd-${flow.id}`}>{fmtCountdown(next - now)}</span>
                            <button data-testid={`nextup-trigger-${flow.id}`} onClick={() => triggerNow(flow)} title="Start this sequence now"
                              className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-brand-600 text-white hover:bg-brand-700 transition-colors">
                              <Play className="h-3 w-3" />Now
                            </button>
                            <button data-testid={`nextup-stop-${flow.id}`} onClick={() => stopSeq(flow)} title="Interrupt: stop countdown and play the outro"
                              className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">
                              <Square className="h-3 w-3" />Stop
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <MiniTimeline marks={marks} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-scene */}
        {sceneData.map(({ scene, seqs, timedEls, srcIds }) => {
          const open = expanded[scene.id] ?? true;
          return (
            <div key={scene.id} className="bg-white rounded-3xl clara-soft overflow-hidden" data-testid={`timeline-scene-${scene.id}`}>
              <div role="button" tabIndex={0} onClick={() => toggle(scene.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(scene.id); }} className="w-full flex items-center gap-2 p-4 border-b border-slate-100 text-left cursor-pointer select-none">
                {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <Layers className="h-5 w-5 text-brand-600" />
                <span className="font-display font-semibold text-slate-900">{scene.name}</span>
                <span className="text-xs text-slate-400">{seqs.length} sequence(s) · {timedEls.length} timed element(s) · {srcIds.length} source(s)</span>
                <button onClick={(e) => { e.stopPropagation(); nav(`/scenes/${scene.id}/overview`); }} className="ml-auto text-xs text-brand-600 font-medium">Overview →</button>
              </div>
              {open && (
                <div className="p-4 space-y-4">
                  {/* Sequences */}
                  {seqs.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2 flex items-center gap-1.5"><Film className="h-3 w-3" />Sequences</div>
                      <div className="space-y-2">
                        {seqs.map(({ flow, placement }) => {
                          const r = flow.repeat || "loop";
                          const sched = r === "schedule";
                          const next = sched ? nextStartMs(flow, now) : null;
                          return (
                            <div key={placement.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2" data-testid={`tl-seq-${flow.id}`}>
                              <button onClick={() => nav(`/sequences/${flow.id}`)} className="font-medium text-slate-800 hover:text-brand-600 truncate">{flow.name}</button>
                              <span className="text-xs text-slate-400 flex items-center gap-1 truncate"><Repeat className="h-3 w-3" />{repeatLabel(flow)} · ~{sequenceDuration(flow)}s / run{placement.enabled === false ? " · disabled" : ""}</span>
                              {flow.paused ? (
                                <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-50 rounded-lg px-2 py-0.5 shrink-0" data-testid={`tl-seq-paused-${flow.id}`}>Paused</span>
                              ) : sched ? (
                                <span className="ml-auto text-sm font-bold tabular-nums text-brand-700 bg-brand-50 rounded-lg px-2 py-0.5 shrink-0">{fmtCountdown(next - now)}</span>
                              ) : (
                                <span className="ml-auto text-xs text-slate-400 shrink-0">{r === "loop" ? "always on" : r === "once" ? "one-shot" : "cyclic"}</span>
                              )}
                              {flow.paused ? (
                                <button data-testid={`tl-seq-resume-${flow.id}`} onClick={() => resumeSeq(flow)} title="Resume this sequence"
                                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0">
                                  <RotateCcw className="h-3 w-3" />Resume
                                </button>
                              ) : (
                                <>
                                  <button data-testid={`tl-seq-trigger-${flow.id}`} onClick={() => triggerNow(flow)} title="Start this sequence now on live overlays"
                                    className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-brand-600 text-white hover:bg-brand-700 transition-colors shrink-0">
                                    <Play className="h-3 w-3" />Now
                                  </button>
                                  <button data-testid={`tl-seq-stop-${flow.id}`} onClick={() => stopSeq(flow)} title="Interrupt: stop countdown and play the outro"
                                    className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors shrink-0">
                                    <Square className="h-3 w-3" />Stop
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Timed elements */}
                  {timedEls.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2 flex items-center gap-1.5"><Zap className="h-3 w-3" />Timed elements</div>
                      <div className="space-y-2">
                        {timedEls.map((el) => {
                          const tm = el.timing;
                          const iv = tm.mode === "interval" || tm.alsoInterval;
                          const info = iv ? elementIntervalNext(tm, now) : null;
                          return (
                            <div key={el.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2" data-testid={`tl-el-${el.id}`}>
                              <span className="font-medium text-slate-800 truncate">{el.name}</span>
                              <span className="text-xs text-slate-400 truncate">
                                {tm.mode === "onchange" ? `on change${el.source ? ` · ${el.source.name}:${el.field || ""}` : ""}${tm.alsoInterval ? ` + every ${tm.gap ?? 5}${(tm.gapUnit || "min").slice(0, 3)}` : ""}` : `every ${tm.gap ?? 5} ${tm.gapUnit || "min"} · stays ${tm.showSeconds ?? 10}s`}
                                {el.where === "scene" ? "" : " · in overlay"}
                              </span>
                              {info ? (
                                <span className="ml-auto text-sm font-bold tabular-nums shrink-0 rounded-lg px-2 py-0.5" style={{ background: info.onNow ? "#dcfce7" : "#eff6ff", color: info.onNow ? "#15803d" : "#1d4ed8" }}>
                                  {info.onNow ? "ON NOW" : fmtCountdown(info.untilNext * 1000)}
                                </span>
                              ) : (
                                <span className="ml-auto text-xs text-slate-400 shrink-0">on data change</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Linked sources */}
                  {srcIds.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2 flex items-center gap-1.5"><Database className="h-3 w-3" />Linked API sources</div>
                      <div className="flex flex-wrap gap-2">
                        {srcIds.map((sid) => {
                          const s = srcById[sid];
                          return (
                            <button key={sid} onClick={() => nav("/sources")} className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center gap-1.5" data-testid={`tl-src-${sid}`}>
                              <Radio className="h-3 w-3" />{s ? s.name : "Unknown source"}{s?.refresh_interval ? ` · ${s.refresh_interval}s` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {seqs.length === 0 && timedEls.length === 0 && srcIds.length === 0 && (
                    <p className="text-sm text-slate-400">Nothing programmed in this scene yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {scenes.length === 0 && (
          <div className="bg-white rounded-3xl clara-soft p-12 text-center">
            <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No scenes yet. Create a scene and add scheduled sequences to see the timeline.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
