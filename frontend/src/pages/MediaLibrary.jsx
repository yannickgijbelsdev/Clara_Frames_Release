import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { toast } from "sonner";
import { Copy, Trash2, Film, Image as ImageIcon, UploadCloud } from "lucide-react";

export default function MediaLibrary() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/media").then(({ data }) => setMedia(data)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const remove = async (m) => {
    try { await api.delete(`/media/${m.id}`); setMedia((l) => l.filter((x) => x.id !== m.id)); toast.success("Deleted from storage"); }
    catch (e) { toast.error("Delete failed"); }
  };
  const copy = (url) => { navigator.clipboard.writeText(url); toast.success("URL copied"); };
  const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  return (
    <AppLayout title="Media Library" subtitle={`${media.length} upload(s) on your storage — reuse or delete`}>
      {loading ? (
        <div className="h-40" />
      ) : media.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <UploadCloud className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No uploads yet. Add logos, photos or background videos from the scene editor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              data-testid={`media-${m.id}`} className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
              <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                {m.is_video
                  ? <video src={m.url} muted loop autoPlay playsInline className="w-full h-full object-cover" />
                  : <img src={m.url} alt={m.name} className="w-full h-full object-cover" />}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-slate-400">{m.is_video ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}</span>
                  <span className="text-sm font-medium text-slate-900 truncate flex-1">{m.name}</span>
                </div>
                <div className="text-[11px] text-slate-400 mb-2">{fmtSize(m.size || 0)}</div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copy(m.url)} data-testid={`media-copy-${m.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs border border-slate-200 rounded-full py-1.5 hover:bg-slate-50 text-slate-700"><Copy className="h-3.5 w-3.5" />Copy URL</button>
                  <button onClick={() => remove(m)} data-testid={`media-del-${m.id}`} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
