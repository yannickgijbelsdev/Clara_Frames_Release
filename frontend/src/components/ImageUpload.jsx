import { useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Upload, Loader2, X, Images, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ImageUpload({ value, onChange, testid = "image-upload", previewClass = "h-16", accept = "image/*", maxMB = 10 }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [media, setMedia] = useState([]);
  const isVideo = /\.(mp4|webm|mov|ogg)$/i.test(value || "");
  const allowVideo = /video/.test(accept);

  const openLib = async () => {
    setLibOpen(true);
    try { const { data } = await api.get("/media"); setMedia(data); } catch (e) {}
  };
  const delLib = async (m) => {
    try { await api.delete(`/media/${m.id}`); setMedia((l) => l.filter((x) => x.id !== m.id)); toast.success("Deleted"); }
    catch (e) { toast.error("Delete failed"); }
  };
  const libItems = allowVideo ? media : media.filter((m) => !m.is_video);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > maxMB * 1024 * 1024) { toast.error(`File too large (max ${maxMB} MB)`); e.target.value = ""; return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.url);
      toast.success("Uploaded to storage");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setLoading(false);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Paste URL or upload" className="rounded-xl text-sm" data-testid={testid} />
        <button type="button" onClick={() => ref.current?.click()} disabled={loading}
          data-testid={`${testid}-btn`}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload
        </button>
        <button type="button" onClick={openLib} data-testid={`${testid}-lib`}
          className="shrink-0 inline-flex items-center justify-center px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50" title="Media library">
          <Images className="h-4 w-4" />
        </button>
      </div>
      {value && (
        <div className="relative inline-block">
          {isVideo
            ? <video src={value} muted loop autoPlay playsInline className={`${previewClass} rounded-lg object-cover border border-slate-200 bg-slate-50`} />
            : <img src={value} alt="" className={`${previewClass} rounded-lg object-contain border border-slate-200 bg-slate-50`} />}
          <button type="button" onClick={() => onChange("")} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
        </div>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={onFile} data-testid={`${testid}-file`} />

      <Dialog open={libOpen} onOpenChange={setLibOpen}>
        <DialogContent className="rounded-3xl max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Media library</DialogTitle></DialogHeader>
          {libItems.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No uploads yet. Upload a file to reuse it later.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {libItems.map((m) => (
                <div key={m.id} className="relative group rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-50">
                  <button type="button" onClick={() => { onChange(m.url); setLibOpen(false); }} className="block w-full aspect-square" data-testid={`lib-item-${m.id}`}>
                    {m.is_video
                      ? <video src={m.url} muted className="w-full h-full object-cover" />
                      : <img src={m.url} alt={m.name} className="w-full h-full object-cover" />}
                  </button>
                  <button type="button" onClick={() => delLib(m)} data-testid={`lib-del-${m.id}`}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
