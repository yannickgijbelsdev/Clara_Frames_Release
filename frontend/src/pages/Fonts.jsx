import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";
import { injectFontFaces } from "@/lib/fonts";
import { Trash2, UploadCloud, Loader2, Type, Copy } from "lucide-react";

export default function Fonts() {
  const { current } = useWorkspace();
  const fileRef = useRef(null);
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    if (!current) return;
    setLoading(true);
    api.get(`/fonts?workspace_id=${current}`).then(({ data }) => { setFonts(data); injectFontFaces(data); }).catch(() => {}).finally(() => setLoading(false));
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
      const { data } = await api.post("/fonts/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const next = [data, ...fonts];
      setFonts(next); injectFontFaces(next);
      toast.success(`Font "${data.family}" uploaded`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  const remove = async (f) => {
    try { await api.delete(`/fonts/${f.id}`); const next = fonts.filter((x) => x.id !== f.id); setFonts(next); injectFontFaces(next); toast.success("Font deleted"); }
    catch (e) { toast.error("Delete failed"); }
  };
  const copy = (name) => { navigator.clipboard.writeText(name); toast.success("Font name copied"); };
  const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  return (
    <AppLayout title="Fonts" subtitle="Upload your own fonts (.ttf, .otf, .woff, .woff2) — then pick them on any text element"
      actions={
        <PrimaryButton icon={uploading ? Loader2 : UploadCloud} data-testid="upload-font-btn"
          onClick={() => !uploading && fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload font"}
        </PrimaryButton>
      }>
      <input ref={fileRef} type="file" className="hidden" data-testid="font-file-input"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        onChange={onFile} />

      {loading ? (
        <div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : fonts.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center" data-testid="fonts-empty">
          <Type className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No custom fonts yet. Upload a <b>.ttf</b>, <b>.otf</b>, <b>.woff</b> or <b>.woff2</b> and it appears in the font picker of every text element.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fonts.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
              data-testid={`font-${f.id}`} className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
              <div className="h-28 flex items-center justify-center px-4 bg-slate-50 border-b border-slate-100 overflow-hidden">
                <span style={{ fontFamily: `'${f.family}', sans-serif`, fontSize: 40, lineHeight: 1.1 }} className="text-slate-900 truncate">Aa Bb 123</span>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Type className="h-3.5 w-3.5 text-brand-600" />
                  <span className="text-sm font-medium text-slate-900 truncate flex-1" data-testid={`font-name-${f.id}`}>{f.family}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-400">{f.format}</span>
                </div>
                <div className="text-[11px] text-slate-400 mb-2">{fmtSize(f.size || 0)}</div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copy(f.family)} data-testid={`font-copy-${f.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs border border-slate-200 rounded-full py-1.5 hover:bg-slate-50 text-slate-700"><Copy className="h-3.5 w-3.5" />Copy name</button>
                  <button onClick={() => remove(f)} data-testid={`font-del-${f.id}`} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
