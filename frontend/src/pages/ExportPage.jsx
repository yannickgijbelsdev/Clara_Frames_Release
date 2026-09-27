import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import SceneCanvas from "@/components/SceneCanvas";
import { toast } from "sonner";
import { Copy, Download, RefreshCw, ArrowLeft, Globe, FileJson, FileCode, MonitorPlay, Loader2 } from "lucide-react";

function UrlRow({ icon: Icon, title, desc, url, testid }) {
  const copy = () => { navigator.clipboard.writeText(url); toast.success("Copied to clipboard"); };
  return (
    <div className="bg-white rounded-2xl clara-soft p-4">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mb-2">{desc}</div>
          <div className="flex items-center gap-2">
            <code data-testid={testid} className="flex-1 min-w-0 truncate text-xs font-mono bg-slate-900 text-slate-100 rounded-lg px-3 py-2">{url}</code>
            <button onClick={copy} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-medium shrink-0">Open</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExportPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [scene, setScene] = useState(null);
  const [flowsData, setFlowsData] = useState({});

  const load = () => api.get(`/scenes/${id}`).then(({ data }) => {
    setScene(data);
    if (data.workspace_id) {
      Promise.all([
        api.get(`/flows?workspace_id=${data.workspace_id}`),
        api.get(`/pancartes?workspace_id=${data.workspace_id}`),
      ]).then(([f, p]) => {
        const panById = Object.fromEntries(p.data.map((x) => [x.id, x]));
        const map = {};
        f.data.forEach((fl) => { map[fl.id] = { flow: fl, pancartes: (fl.pancarte_ids || []).map((pid) => panById[pid]).filter(Boolean) }; });
        setFlowsData(map);
      }).catch(() => {});
    }
  }).catch(() => nav("/scenes"));
  useEffect(() => { load(); }, [id]);

  const regen = async () => {
    const { data } = await api.post(`/scenes/${id}/regenerate-token`);
    setScene((s) => ({ ...s, public_token: data.public_token }));
    toast.success("New link generated — old links stopped working");
  };

  if (!scene) return <AppLayout title="Loading…"><div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></AppLayout>;

  const t = scene.public_token;
  const overlay = `${BACKEND}/api/public/scene/${t}/overlay`;
  const dataJson = `${BACKEND}/api/public/scene/${t}/data.json`;
  const dataXml = `${BACKEND}/api/public/scene/${t}/data.xml`;
  const settings = `${BACKEND}/api/public/scene/${t}/settings`;

  return (
    <AppLayout title={`Export · ${scene.name}`} subtitle="Add this scene to vMix as one source."
      actions={<>
        <SecondaryButton icon={ArrowLeft} onClick={() => nav(`/scenes/${id}`)}>Editor</SecondaryButton>
        <SecondaryButton icon={RefreshCw} data-testid="regen-token-btn" onClick={regen}>New link</SecondaryButton>
        <a href={settings} download><PrimaryButton icon={Download} data-testid="download-settings-btn">Download settings file</PrimaryButton></a>
      </>}>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <UrlRow icon={MonitorPlay} title="vMix Web Browser input (recommended)" testid="overlay-url"
            desc="Add → Web Browser → paste this URL. Renders your full designed scene live (logo, clock, timed text, API data)."
            url={overlay} />
          <UrlRow icon={FileJson} title="vMix Data Source — JSON" testid="datajson-url"
            desc="Settings → Data Sources → Add → JSON. Bind Title fields to the column names you set."
            url={dataJson} />
          <UrlRow icon={FileCode} title="vMix Data Source — XML" testid="dataxml-url"
            desc="Settings → Data Sources → Add → XML for Title text/value binding."
            url={dataXml} />
          <UrlRow icon={Globe} title="Settings file (.json)" testid="settings-url"
            desc="Portable backup of the whole scene incl. all vMix URLs."
            url={settings} />
        </div>

        <div>
          <div className="bg-slate-100 rounded-3xl clara-soft p-4 sticky top-24">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">Live preview</div>
            <div className="rounded-2xl overflow-hidden ring-1 ring-slate-300">
              <SceneCanvas scene={scene} flowsData={flowsData} />
            </div>
            <div className="mt-4 text-sm text-slate-600 leading-relaxed">
              <b className="text-slate-900">In vMix:</b> click <b>Add Input → Web Browser</b>, paste the overlay URL, set size to 1920×1080 and enable transparency for a clean key.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 bg-white rounded-3xl clara-soft p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900 mb-1">Per-element vMix outputs</h2>
        <p className="text-sm text-slate-500 mb-4">Every element has its own live text endpoint — add each one manually in vMix as a Data Source or Title binding.</p>
        <div className="divide-y divide-slate-100">
          {(scene.elements || []).map((el) => {
            const url = `${BACKEND}/api/public/scene/${t}/element/${el.id}.txt`;
            return (
              <div key={el.id} data-testid={`el-out-${el.id}`} className="flex items-center gap-3 py-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{el.type.replace("_", " ")}</span>
                <span className="font-medium text-slate-800 text-sm shrink-0 min-w-[90px] truncate">{el.props?.name || el.id.slice(0, 6)}</span>
                <code className="flex-1 min-w-0 truncate text-xs font-mono bg-slate-900 text-slate-100 rounded-lg px-3 py-1.5">{url}</code>
                <button onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-medium shrink-0">Open</a>
              </div>
            );
          })}
          {(scene.elements || []).length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No elements in this scene yet.</p>}
        </div>
      </div>
    </AppLayout>
  );
}
