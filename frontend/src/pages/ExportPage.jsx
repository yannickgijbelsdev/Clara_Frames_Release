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
        <span className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mb-2">{desc}</div>
          <div className="flex items-center gap-2">
            <code data-testid={testid} className="flex-1 min-w-0 truncate text-xs font-mono bg-slate-900 text-slate-100 rounded-lg px-3 py-2">{url}</code>
            <button onClick={copy} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-rose-600 font-medium shrink-0">Open</a>
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

  const load = () => api.get(`/scenes/${id}`).then(({ data }) => setScene(data)).catch(() => nav("/scenes"));
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
              <SceneCanvas scene={scene} />
            </div>
            <div className="mt-4 text-sm text-slate-600 leading-relaxed">
              <b className="text-slate-900">In vMix:</b> click <b>Add Input → Web Browser</b>, paste the overlay URL, set size to 1920×1080 and enable transparency for a clean key.
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
