import { useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ImageUpload({ value, onChange, testid = "image-upload", previewClass = "h-16" }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
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
      </div>
      {value && (
        <div className="relative inline-block">
          <img src={value} alt="" className={`${previewClass} rounded-lg object-contain border border-slate-200 bg-slate-50`} />
          <button type="button" onClick={() => onChange("")} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-file`} />
    </div>
  );
}
