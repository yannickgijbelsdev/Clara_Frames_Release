import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { BACKEND } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { SecondaryButton } from "@/components/PrimaryButton";
import PancarteView from "@/components/PancarteView";
import LiveViewDialog from "@/components/LiveViewDialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Radio, Link2, Film, Layers, MonitorPlay } from "lucide-react";

function LinkRow({ url, testid }) {
  return (
    <div className="flex items-center gap-1.5">
      <code className="flex-1 min-w-0 truncate text-[10px] font-mono bg-slate-900 text-slate-100 rounded-lg px-2 py-1.5" data-testid={`${testid}-url`}>{url}</code>
      <button data-testid={`${testid}-copy`} onClick={() => { try { navigator.clipboard.writeText(url); toast.success("vMix link copied"); } catch (e) { toast.error("Could not copy"); } }}
        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Link2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function SceneOverview() {
  const { id } = useParams();
  const nav = useNavigate();
  const [scene, setScene] = useState(null);
  const [flows, setFlows] = useState([]);
  const [pancartes, setPancartes] = useState([]);
  const [live, setLive] = useState(null); // { token, name, kind }

  useEffect(() => {
    api.get(`/scenes/${id}`).then(({ data }) => {
      setScene(data);
      const ws = data.workspace_id || "";
      api.get(`/flows?workspace_id=${ws}`).then(({ data: f }) => setFlows(f)).catch(() => {});
      api.get(`/pancartes?workspace_id=${ws}`).then(({ data: p }) => setPancartes(p)).catch(() => {});
    }).catch(() => { toast.error("Scene not found"); nav("/scenes"); });
  }, [id]);

  const panById = useMemo(() => Object.fromEntries(pancartes.map((p) => [p.id, p])), [pancartes]);
  const flowById = useMemo(() => Object.fromEntries(flows.map((f) => [f.id, f])), [flows]);

  if (!scene) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const sceneUrl = `${BACKEND}/api/public/scene/${scene.public_token}/overlay`;
  const placements = (scene.flows || []).filter((pl) => pl.flow_id);

  return (
    <AppLayout title={`${scene.name} — Overview`} subtitle="The full scene plus every individual overlay, each with its own vMix link."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/scenes")}>Scenes</SecondaryButton>
        <SecondaryButton icon={Film} onClick={() => nav(`/scenes/${id}`)}>Edit scene</SecondaryButton>
      </>}>

      <div className="space-y-6">
        {/* Combined scene */}
        <div className="bg-white rounded-3xl clara-soft overflow-hidden" data-testid="overview-scene-card">
          <div className="p-4 flex items-center gap-2 border-b border-slate-100">
            <MonitorPlay className="h-5 w-5 text-brand-600" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-slate-900">Full scene</div>
              <div className="text-xs text-slate-400">Base layer + {placements.length} sequence(s) · combined vMix link</div>
            </div>
            <SecondaryButton icon={Radio} data-testid="overview-scene-live" onClick={() => setLive({ token: scene.public_token, name: scene.name, kind: "scene" })}>Live view</SecondaryButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 p-4">
            <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
              <iframe title="scene" src={sceneUrl} scrolling="no" style={{ width: "100%", height: "100%", border: 0, background: "#0b1020" }} />
            </div>
            <div className="space-y-2 self-center">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">vMix overlay link (full scene)</div>
              <LinkRow url={sceneUrl} testid="overview-scene-link" />
              <div className="text-xs text-slate-400">{(scene.elements || []).length} element(s) in the base layer.</div>
            </div>
          </div>
        </div>

        {/* Individual overlays per sequence */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Individual overlays in this scene</h2>
          </div>

          {placements.length === 0 ? (
            <div className="bg-white rounded-3xl clara-soft p-10 text-center">
              <p className="text-slate-500">No sequences in this scene yet. Add an "Overlay sequence" in the scene editor.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {placements.map((pl, pi) => {
                const flow = flowById[pl.flow_id];
                const ids = flow ? (flow.pancarte_ids || []) : [];
                const disabled = new Set(pl.disabledPancartes || []);
                return (
                  <div key={pl.id || pi} className="bg-white rounded-3xl clara-soft p-4" data-testid={`overview-reeks-${pl.id || pi}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Film className="h-4 w-4 text-brand-600" />
                      <div className="font-semibold text-slate-900">{flow ? flow.name : "Unknown sequence"}</div>
                      <span className="text-xs text-slate-400">· {ids.length} overlay(s){pl.enabled === false ? " · disabled" : ""}</span>
                    </div>
                    {ids.length === 0 ? (
                      <p className="text-sm text-slate-400">This sequence has no overlays yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {ids.map((pid, i) => {
                          const p = panById[pid];
                          if (!p) return null;
                          const url = `${BACKEND}/api/public/overlay/${p.public_token}/overlay`;
                          const off = disabled.has(pid);
                          return (
                            <motion.div key={`${pid}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2) }}
                              data-testid={`overview-overlay-${p.id}`}
                              className={`rounded-2xl border overflow-hidden ${off ? "border-slate-200 opacity-50" : "border-slate-200"}`}>
                              <div className="relative w-full bg-slate-900" style={{ aspectRatio: `${p.width || 1920} / ${p.height || 1080}` }}>
                                <PancarteView pancarte={p} />
                              </div>
                              <div className="p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{p.name}{off ? " (off)" : ""}</div>
                                  <button data-testid={`overview-overlay-live-${p.id}`} onClick={() => setLive({ token: p.public_token, name: p.name, kind: "overlay" })}
                                    title="Live view" className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-brand-50 hover:text-brand-600"><Radio className="h-4 w-4" /></button>
                                </div>
                                <LinkRow url={url} testid={`overview-overlay-link-${p.id}`} />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <LiveViewDialog open={!!live} onOpenChange={(o) => !o && setLive(null)}
        token={live?.token} name={live?.name} kind={live?.kind || "scene"} />
    </AppLayout>
  );
}
