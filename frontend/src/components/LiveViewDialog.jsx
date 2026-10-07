import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Monitor, RefreshCw, ExternalLink } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Simulates how vMix receives the transparent overlay (checkerboard = transparency)
export default function LiveViewDialog({ open, onOpenChange, token, name }) {
  const [nonce, setNonce] = useState(0);
  const src = token ? `${BACKEND}/api/public/scene/${token}/overlay?v=${nonce}` : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Monitor className="h-5 w-5 text-brand-600" /> Live view — {name || "scene"}
            <span className="ml-2 text-xs font-normal text-slate-400">exact zoals vMix de overlay binnenkrijgt</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div data-testid="live-view-surface"
            className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-300"
            style={{
              aspectRatio: "16 / 9",
              backgroundColor: "#0b1020",
              backgroundImage:
                "linear-gradient(45deg,#1e293b 25%,transparent 25%),linear-gradient(-45deg,#1e293b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1e293b 75%),linear-gradient(-45deg,transparent 75%,#1e293b 75%)",
              backgroundSize: "28px 28px",
              backgroundPosition: "0 0,0 14px,14px -14px,-14px 0",
            }}>
            {src && (
              <iframe key={nonce} title="live-view" src={src} data-testid="live-view-iframe"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent" }} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">De achtergrond-ruit toont transparantie. In vMix zet je deze als Web Browser-input op 1920×1080.</p>
            <div className="flex items-center gap-2">
              <button data-testid="live-view-refresh" onClick={() => setNonce((n) => n + 1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> Herlaad
              </button>
              <a data-testid="live-view-open" href={src} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-600 text-white hover:bg-brand-700 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Open in tab
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
