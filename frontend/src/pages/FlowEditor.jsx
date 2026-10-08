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
import { Save, ArrowLeft, Loader2, ArrowUp, ArrowDown, X, Plus, LayoutTemplate, PlayCircle } from "lucide-react";

const DEFAULT_SEC = 5;

function LivePreview({ pancartes, durations, defaultSec, repeat, entranceKey }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (pancartes.length <= 1) return;
    let i = 0, t;
    const step = () => {
      const next = i + 1;
      if (repeat === "once" && next >= pancartes.length) return;
      i = next % pancartes.length; setIdx(i);
      const sec = Math.max(0.2, (durations?.[i] ?? defaultSec ?? DEFAULT_SEC));
      t = setTimeout(step, sec * 1000);
    };
    const first = Math.max(0.2, (durations?.[0] ?? defaultSec ?? DEFAULT_SEC));
    t = setTimeout(step, first * 1000);
    return () => clearTimeout(t);
  }, [pancartes.length, JSON.stringify(durations), defaultSec, repeat]);
  const pan = pancartes.length ? pancartes[idx % pancartes.length] : null;
  return (
    <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-300 bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
      {pan ? <div key={`${idx}:${entranceKey}`} style={{ position: "absolute", inset: 0 }}><PancarteView pancarte={pan} /></div>
        : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Add overlays to preview</div>}
    </div>
  );
}

// Per-item duration input with a seconds/minutes unit toggle (value stored in seconds).
function DurationField({ seconds, disabled, onChange, testid }) {
  const isMin = seconds >= 60 && seconds % 60 === 0;
  const unit = isMin ? "min" : "sec";
  const shown = isMin ? seconds / 60 : seconds;
  return (
    <div className="flex items-center gap-1">
      <Input type="number" min="0.2" step={unit === "min" ? "1" : "0.1"} disabled={disabled} value={shown}
        onChange={(e) => { const v = parseFloat(e.target.value) || 0; onChange(unit === "min" ? v * 60 : v); }}
        className="w-16 rounded-lg text-xs px-2 h-8 disabled:opacity-40" data-testid={`${testid}-val`} />
      <Select value={unit} disabled={disabled} onValueChange={(u) => { onChange(u === "min" ? shown * 60 : (isMin ? seconds / 60 : seconds)); }}>
        <SelectTrigger className="h-8 w-[62px] rounded-lg text-xs px-2" data-testid={`${testid}-unit`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="sec">sec</SelectItem><SelectItem value="min">min</SelectItem></SelectContent>
      </Select>
    </div>
  );
}

// Intro / transition / outro HTML (asset) picker + seconds.
function PartPicker({ label, hint, value, assets, onChange, testid }) {
  const setAsset = (idval) => {
    if (idval === "none") return onChange(null);
    const o = assets.find((x) => x.id === idval);
    onChange({ overlayId: idval, url: o?.url || "", kind: o?.kind || "", name: o?.name || "", fit: o?.kind === "html" ? undefined : "contain", seconds: value?.seconds ?? 3 });
  };
  return (
    <div className="space-y-1.5 pt-2 border-t border-slate-100">
      <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</Label>
      <Select value={value?.overlayId || "none"} onValueChange={setAsset}>
        <SelectTrigger className="rounded-xl" data-testid={testid}><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent><SelectItem value="none">None</SelectItem>{assets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.kind}</SelectItem>)}</SelectContent>
      </Select>
      {value?.url && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">Show for</span>
          <Input type="number" min="0.2" step="0.1" value={value.seconds ?? 3} onChange={(e) => onChange({ ...value, seconds: parseFloat(e.target.value) || 1 })} className="w-20 rounded-lg text-xs h-8" data-testid={`${testid}-sec`} />
          <span className="text-xs text-slate-400">sec</span>
        </div>
      )}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      {assets.length === 0 && <p className="text-[11px] text-slate-400">Upload HTML assets on the Assets page to use them here.</p>}
    </div>
  );
}

export default function FlowEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [flow, setFlow] = useState(null);
  const [pancartes, setPancartes] = useState([]);
  const [assets, setAssets] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/flows/${id}`).then(({ data }) => {
      setFlow(data);
      api.get(`/pancartes?workspace_id=${data.workspace_id || ""}`).then(({ data: pans }) => setPancartes(pans)).catch(() => {});
    }).catch(() => { toast.error("Sequence not found"); nav("/sequences"); });
    api.get("/overlays").then(({ data }) => setAssets((data || []).filter((o) => o.kind === "html"))).catch(() => {});
  }, [id]);

  const panById = Object.fromEntries(pancartes.map((p) => [p.id, p]));
  const seq = flow?.pancarte_ids || [];
  const durs = flow?.durations || [];
  const plays = flow?.playouts || [];
  const baseDur = flow?.interval || DEFAULT_SEC;

  const commit = (nextSeq, nextDurs, nextPlays) => setFlow((f) => ({ ...f, pancarte_ids: nextSeq, durations: nextDurs, playouts: nextPlays }));
  const norm = (arr, def) => seq.map((_, idx) => arr[idx] ?? def);
  const addPan = (pid) => commit([...seq, pid], [...norm(durs, baseDur), baseDur], [...norm(plays, false), false]);
  const removeAt = (i) => commit(seq.filter((_, idx) => idx !== i), norm(durs, baseDur).filter((_, idx) => idx !== i), norm(plays, false).filter((_, idx) => idx !== i));
  const setDur = (i, val) => commit(seq, norm(durs, baseDur).map((d, idx) => idx === i ? val : d), norm(plays, false));
  const setPlay = (i, val) => commit(seq, norm(durs, baseDur), norm(plays, false).map((p, idx) => idx === i ? val : p));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= seq.length) return;
    const ns = [...seq], nd = norm(durs, baseDur), np = norm(plays, false);
    [ns[i], ns[j]] = [ns[j], ns[i]]; [nd[i], nd[j]] = [nd[j], nd[i]]; [np[i], np[j]] = [np[j], np[i]];
    commit(ns, nd, np);
  };

  const save = async (silent) => {
    setSaving(true);
    try {
      await api.put(`/flows/${id}`, {
        name: flow.name, interval: flow.interval, entrance: flow.entrance, entranceDuration: flow.entranceDuration,
        pancarte_ids: flow.pancarte_ids, durations: norm(durs, baseDur), playouts: norm(plays, false),
        repeat: flow.repeat || "loop", repeatEvery: flow.repeatEvery ?? 5,
        intro: flow.intro || null, transition: flow.transition || null, outro: flow.outro || null,
      });
      if (!silent) toast.success("Sequence saved");
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!flow) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const repeat = flow.repeat || "loop";
  const seqPancartes = seq.map((pid) => panById[pid]).filter(Boolean);

  return (
    <AppLayout title={flow.name} subtitle="Order overlays and set the timing. Then place this sequence inside a scene."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav("/sequences")}>Back</SecondaryButton>
        <PrimaryButton icon={Save} data-testid="save-flow-btn" onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </>}>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-4">
        {/* settings + preview */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl clara-soft p-4 space-y-3">
            <div className="space-y-1.5"><Label>Sequence name</Label>
              <Input value={flow.name || ""} onChange={(e) => setFlow({ ...flow, name: e.target.value })} className="rounded-xl text-sm" data-testid="flow-name-field" /></div>
            <div className="space-y-1.5"><Label>Default seconds per overlay</Label>
              <Input type="number" min="1" value={flow.interval || 5} onChange={(e) => setFlow({ ...flow, interval: parseInt(e.target.value) || 5 })} className="rounded-xl text-sm" data-testid="flow-interval-field" />
              <p className="text-[11px] text-slate-400">Used for overlays without their own time. Set a per-overlay duration on the right.</p></div>
            <div className="space-y-1.5"><Label>After the last overlay</Label>
              <Select value={repeat} onValueChange={(v) => setFlow({ ...flow, repeat: v })}>
                <SelectTrigger className="rounded-xl" data-testid="flow-repeat-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loop">Loop immediately</SelectItem>
                  <SelectItem value="once">Play once, then stop</SelectItem>
                  <SelectItem value="interval">Play all, wait, then repeat</SelectItem>
                </SelectContent>
              </Select></div>
            {repeat === "interval" && (
              <div className="flex items-center gap-2" data-testid="flow-repeatevery-row">
                <span className="text-xs text-slate-500 shrink-0">Wait</span>
                <Input type="number" min="0.1" step="0.5" value={flow.repeatEvery ?? 5} onChange={(e) => setFlow({ ...flow, repeatEvery: parseFloat(e.target.value) || 1 })} className="w-20 rounded-lg text-xs h-8" data-testid="flow-repeatevery" />
                <span className="text-xs text-slate-400">min before replaying</span>
              </div>
            )}
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
            <PartPicker label="Intro overlay (HTML)" hint="Plays once before the sequence starts." value={flow.intro} assets={assets} onChange={(v) => setFlow({ ...flow, intro: v })} testid="flow-intro" />
            <PartPicker label="Transition overlay (HTML)" hint="Plays between each overlay in the sequence." value={flow.transition} assets={assets} onChange={(v) => setFlow({ ...flow, transition: v })} testid="flow-transition" />
            <PartPicker label="Outro overlay (HTML)" hint="Plays once after the last overlay." value={flow.outro} assets={assets} onChange={(v) => setFlow({ ...flow, outro: v })} testid="flow-outro" />
          </div>
          <div className="bg-white rounded-3xl clara-soft p-4">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Live preview</div>
            <LivePreview pancartes={seqPancartes} durations={norm(durs, baseDur)} defaultSec={flow.interval} repeat={repeat} entranceKey={flow.entrance} />
          </div>
        </div>

        {/* sequence + library */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl clara-soft p-4">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-3">Sequence ({seq.length})</div>
            {seq.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Click an overlay from the library to add it here.</p>
            ) : (
              <div className="space-y-2" data-testid="flow-sequence">
                {seq.map((pid, i) => {
                  const p = panById[pid];
                  return (
                    <div key={`${pid}-${i}`} data-testid={`seq-item-${i}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 p-2">
                      <span className="text-[11px] font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                      <div className="relative w-20 rounded-lg overflow-hidden ring-1 ring-slate-200 shrink-0 bg-slate-900" style={{ aspectRatio: `${p?.width || 1920} / ${p?.height || 1080}` }}>
                        {p ? <PancarteView pancarte={p} /> : null}
                      </div>
                      <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{p?.name || "Deleted overlay"}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button data-testid={`seq-playout-${i}`} onClick={() => setPlay(i, !(plays[i] === true))} title={plays[i] ? "Play out (until media ends)" : "Fixed duration"}
                          className={`h-8 px-2 inline-flex items-center gap-1 rounded-lg text-[10px] font-semibold transition-colors ${plays[i] ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                          <PlayCircle className="h-3.5 w-3.5" />{plays[i] ? "Play out" : "Timed"}
                        </button>
                        <DurationField seconds={durs[i] ?? baseDur} disabled={plays[i] === true} onChange={(v) => setDur(i, v)} testid={`seq-dur-${i}`} />
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
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Overlay library</div>
              <button onClick={() => nav("/overlays")} className="text-xs text-brand-600 font-medium inline-flex items-center gap-1"><LayoutTemplate className="h-3 w-3" />Manage</button>
            </div>
            {pancartes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No overlays yet. Create some on the Overlays page.</p>
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
