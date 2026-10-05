import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";
import { Copy, Trash2, Film, Code2, Image as ImageIcon, UploadCloud, Loader2, MonitorPlay } from "lucide-react";

const KIND_META = {
  html: { label: "HTML", icon: Code2 },
  video: { label: "Video", icon: Film },
  image: { label: "Image", icon: ImageIcon },
};

function Preview({ o }) {
  if (o.kind === "html") {
    return (
      <div className="relative w-full h-full">
        <iframe title={o.name} src={o.url} scrolling="no"
          style={{ width: "100%", height: "100%", border: 0, background: "transparent", pointerEvents: "none" }} />
      </div>
    );
  }
  if (o.kind === "video") return <video src={o.url} muted loop autoPlay playsInline className="w-full h-full object-contain" />;
  return <img src={o.url} alt={o.name} className="w-full h-full object-contain" />;
}

export default function Overlays() {
  const { current } = useWorkspace();
  const fileRef = useRef(null);
  const [overlays, setOverlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    if (!current) return;
    setLoading(true);
    api.get(`/overlays?workspace_id=${current}`).then(({ data }) => setOverlays(data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [current]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("workspace_id", current);
      const { data } = await api.post("/overlays/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOverlays((l) => [data, ...l]);
      toast.success("Overlay uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  const remove = async (o) => {
    try { await api.delete(`/overlays/${o.id}`); setOverlays((l) => l.filter((x) => x.id !== o.id)); toast.success("Overlay deleted"); }
    catch (e) { toast.error("Delete failed"); }
  };
  const copy = (url) => { navigator.clipboard.writeText(url); toast.success("URL copied"); };
  const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  return (
    <AppLayout title="Overlays" subtitle="Upload HTML, video or image overlays — drop them into any scene or pancarte"
      actions={
        <PrimaryButton icon={uploading ? Loader2 : UploadCloud} data-testid="upload-overlay-btn"
          onClick={() => !uploading && fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload overlay"}
        </PrimaryButton>
      }>
      <input ref={fileRef} type="file" className="hidden" data-testid="overlay-file-input"
        accept=".html,.htm,text/html,video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/gif"
        onChange={onFile} />

      {loading ? (
        <div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : overlays.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center" data-testid="overlays-empty">
          <MonitorPlay className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No overlays yet. Upload an <b>.html</b>, <b>.mp4</b> or image to reuse it as an overlay element.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {overlays.map((o, i) => {
            const Meta = KIND_META[o.kind] || KIND_META.image;
            return (
              <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                data-testid={`overlay-${o.id}`} className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
                <div className="aspect-video bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:20px_20px] flex items-center justify-center overflow-hidden">
                  <Preview o={o} />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-brand-600"><Meta.icon className="h-3.5 w-3.5" /></span>
                    <span className="text-sm font-medium text-slate-900 truncate flex-1">{o.name}</span>
                    <span className="text-[10px] font-bold uppercase text-slate-400">{Meta.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mb-2">{fmtSize(o.size || 0)}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => copy(o.url)} data-testid={`overlay-copy-${o.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs border border-slate-200 rounded-full py-1.5 hover:bg-slate-50 text-slate-700"><Copy className="h-3.5 w-3.5" />Copy URL</button>
                    <button onClick={() => remove(o)} data-testid={`overlay-del-${o.id}`} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
