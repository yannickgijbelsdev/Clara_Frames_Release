import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import PancarteView from "@/components/PancarteView";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, ArrowLeft, Loader2, ArrowUp, ArrowDown, X, Plus, LayoutTemplate } from "lucide-react";

function LivePreview({ pancartes, interval, entranceKey }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (pancartes.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % pancartes.length), Math.max(1, interval || 5) * 1000);
    return () => clearInterval(t);
  }, [pancartes.length, interval]);
  const pan = pancartes.length ? pancartes[idx % pancartes.length] : null;
  return (
    <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-300 bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
      {pan ? <div key={`${idx}:${entranceKey}`} style={{ position: "absolute", inset: 0 }}><PancarteView pancarte={pan} /></div>
        : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Add pancartes to preview</div>}
    </div>
  );
}

export default function FlowEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [flow, setFlow] = useState(null);
  const [pancartes, setPancartes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/flows/${id}`).then(({ data }) => {
      setFlow(data);
      api.get(`/pancartes?workspace_id=${data.workspace_id || ""}`).then(({ data: pans }) => setPancartes(pans)).catch(() => {});
    }).catch(() => { toast.error("Flow not found"); nav("/flows"); });
  }, [id]);

  const panById = Object.fromEntries(pancartes.map((p) => [p.id, p]));
  const seq = flow?.pancarte_ids || [];

  const setSeq = (next) => setFlow((f) => ({ ...f, pancarte_ids: next }));
  const addPan = (pid) => setSeq([...seq, pid]);
  const removeAt = (i) => setSeq(seq.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= seq.length) return;
    const next = [...seq]; [next[i], next[j]] = [next[j], next[i]]; setSeq(next);
  };

  const save = async (silent) => {
    setSaving(true);
    try {
      await api.put(`/flows/${id}`, { name: flow.name, interval: flow.interval, entrance: flow.entrance, entranceDuration: flow.entranceDuration, pancarte_ids: flow.pancarte_ids });
      if (!silent) toast.success("Flow saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!flow) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const seqPancartes = seq.map((pid) => panById[pid]).filter(Boolean);

  return (
    <AppLayout title={flow.name} subtitle="Order pancartes and set the timing. Then place this flow inside a scene."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/flows")}>Back</SecondaryButton>
        <PrimaryButton icon={Save} data-testid="save-flow-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </>}>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-4">
        {/* settings + preview */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl clara-soft p-4 space-y-3">
            <div className="space-y-1.5"><Label>Flow name</Label>
              <Input value={flow.name || ""} onChange={(e) => setFlow({ ...flow, name: e.target.value })} className="rounded-xl text-sm" data-testid="flow-name-field" /></div>
            <div className="space-y-1.5"><Label>Seconds per pancarte</Label>
              <Input type="number" min="1" value={flow.interval || 5} onChange={(e) => setFlow({ ...flow, interval: parseInt(e.target.value) || 5 })} className="rounded-xl text-sm" data-testid="flow-interval-field" /></div>
            <div className="space-y-1.5"><Label>Entrance transition</Label>
              <Select value={flow.entrance || "none"} onValueChange={(v) => setFlow({ ...flow, entrance: v })}>
                <SelectTrigger className="rounded-xl" data-testid="flow-entrance-field"><SelectValue /></SelectTrigger>
                <SelectContent>{["none", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select></div>
            {flow.entrance && flow.entrance !== "none" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24 shrink-0">Duration {flow.entranceDuration || 0.6}s</span>
                <input type="range" min="0.2" max="3" step="0.1" value={flow.entranceDuration ?? 0.6} onChange={(e) => setFlow({ ...flow, entranceDuration: parseFloat(e.target.value) })} className="flex-1 accent-brand-600" />
              </div>
            )}
          </div>
          <div className="bg-white rounded-3xl clara-soft p-4">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Live preview</div>
            <LivePreview pancartes={seqPancartes} interval={flow.interval} entranceKey={flow.entrance} />
          </div>
        </div>

        {/* sequence + library */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl clara-soft p-4">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-3">Sequence ({seq.length})</div>
            {seq.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Click a pancarte from the library to add it here.</p>
            ) : (
              <div className="space-y-2" data-testid="flow-sequence">
                {seq.map((pid, i) => {
                  const p = panById[pid];
                  return (
                    <div key={`${pid}-${i}`} data-testid={`seq-item-${i}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 p-2">
                      <span className="text-[11px] font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                      <div className="relative w-24 rounded-lg overflow-hidden ring-1 ring-slate-200 shrink-0 bg-slate-900" style={{ aspectRatio: `${p?.width || 1920} / ${p?.height || 1080}` }}>
                        {p ? <PancarteView pancarte={p} /> : null}
                      </div>
                      <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{p?.name || "Deleted pancarte"}</div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button data-testid={`seq-up-${i}`} onClick={() => move(i, -1)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArrowUp className="h-4 w-4" /></button>
                        <button data-testid={`seq-down-${i}`} onClick={() => move(i, 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArrowDown className="h-4 w-4" /></button>
                        <button data-testid={`seq-remove-${i}`} onClick={() => removeAt(i)} className="h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl clara-soft p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Pancarte library</div>
              <button onClick={() => nav("/pancartes")} className="text-xs text-brand-600 font-medium inline-flex items-center gap-1"><LayoutTemplate className="h-3 w-3" />Manage</button>
            </div>
            {pancartes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No pancartes yet. Create some on the Pancartes page.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2" data-testid="flow-library">
                {pancartes.map((p) => (
                  <button key={p.id} data-testid={`lib-add-${p.id}`} onClick={() => addPan(p.id)}
                    className="group text-left rounded-2xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 overflow-hidden transition-colors">
                    <div className="relative w-full bg-slate-900" style={{ aspectRatio: `${p.width || 1920} / ${p.height || 1080}` }}>
                      <PancarteView pancarte={p} />
                      <div className="absolute inset-0 bg-brand-600/0 group-hover:bg-brand-600/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="h-8 w-8 rounded-full bg-white text-brand-600 flex items-center justify-center shadow"><Plus className="h-4 w-4" /></span>
                      </div>
                    </div>
                    <div className="px-2.5 py-2 text-xs font-medium text-slate-700 truncate">{p.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
