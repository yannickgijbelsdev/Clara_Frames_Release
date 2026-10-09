import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import VUMeter from "./VUMeter";
import { Trash2, Radio, Film, VolumeX } from "lucide-react";

function vimeoId(url) {
  const m = (url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/) || (url || "").match(/(\d{6,})/);
  return m ? m[1] : "";
}
function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; }
  return Math.sqrt(s / buf.length);
}

// A single live stream tile: HLS (hls.js + real Web Audio VU meter) or Vimeo (iframe + live indicator).
export default function StreamMonitor({ stream, audioCtx, large = false, onRemove }) {
  const videoRef = useRef(null);
  const wiredRef = useRef(false);
  const rafRef = useRef(null);
  const [lvl, setLvl] = useState({ l: 0, r: 0 });
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  const isVimeo = stream.kind === "vimeo";
  const vid = isVimeo ? vimeoId(stream.url) : "";

  useEffect(() => {
    if (isVimeo || !videoRef.current || !stream.url) return;
    const video = videoRef.current;
    let hls;
    const onPlay = () => setPlaying(true);
    const onErr = () => setErr(true);
    video.muted = true; // required for autoplay; unmuted (silently) once audio monitoring wires up
    video.addEventListener("playing", onPlay);
    video.addEventListener("error", onErr);
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal) setErr(true); });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = stream.url;
    }
    video.play().catch(() => {});
    return () => { video.removeEventListener("playing", onPlay); video.removeEventListener("error", onErr); if (hls) hls.destroy(); };
  }, [stream.url, isVimeo]);

  useEffect(() => {
    if (isVimeo || !audioCtx || !videoRef.current || wiredRef.current) return;
    try {
      const video = videoRef.current;
      const src = audioCtx.createMediaElementSource(video);
      const splitter = audioCtx.createChannelSplitter(2);
      src.connect(splitter);
      // Keep the graph "pulled" (so analysers actually run) but inaudible via a 0-gain path.
      const gain = audioCtx.createGain(); gain.gain.value = 0;
      src.connect(gain); gain.connect(audioCtx.destination);
      const aL = audioCtx.createAnalyser(); const aR = audioCtx.createAnalyser();
      aL.fftSize = 512; aR.fftSize = 512; aL.smoothingTimeConstant = 0.7; aR.smoothingTimeConstant = 0.7;
      splitter.connect(aL, 0); splitter.connect(aR, 1);
      // A muted element feeds silence into Web Audio — unmute now that output is routed to a 0-gain node.
      video.muted = false;
      wiredRef.current = true;
      const bL = new Uint8Array(aL.fftSize); const bR = new Uint8Array(aR.fftSize);
      const tick = () => {
        aL.getByteTimeDomainData(bL); aR.getByteTimeDomainData(bR);
        setLvl({ l: Math.min(1, rms(bL) * 3.2), r: Math.min(1, rms(bR) * 3.2) });
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* source already created or audio unavailable */ }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [audioCtx, isVimeo]);

  return (
    <div data-testid={`stream-monitor-${stream.id}`} className="relative rounded-2xl overflow-hidden ring-1 ring-slate-800 bg-slate-950">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        {isVimeo ? (
          vid ? (
            <iframe title={stream.name} className="absolute inset-0 w-full h-full"
              src={`https://player.vimeo.com/video/${vid}?background=1&autoplay=1&loop=1&muted=1&autopause=0`}
              frameBorder="0" allow="autoplay; fullscreen" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Invalid Vimeo URL</div>
          )
        ) : (
          <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* header */}
        <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold text-white rounded-full px-2 py-0.5 ${stream.kind === "vimeo" ? "bg-sky-600/90" : "bg-indigo-600/90"}`}>
            {stream.kind === "vimeo" ? <Film className="h-2.5 w-2.5" /> : <Radio className="h-2.5 w-2.5" />}
            {stream.kind.toUpperCase()}
          </span>
          <span className="text-xs font-semibold text-white/95 drop-shadow truncate">{stream.name}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-white bg-rose-600/90 rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />{err ? "ERR" : "LIVE"}
          </span>
          {onRemove && (
            <button data-testid={`stream-remove-${stream.id}`} onClick={onRemove} title="Remove stream"
              className="h-6 w-6 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-rose-600 hover:text-white transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* VU meter (HLS) or audio-unavailable note (Vimeo) */}
        {isVimeo ? (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-white/80 bg-black/55 rounded-full px-2.5 py-1">
            <VolumeX className="h-3 w-3" />Audio not available via Vimeo
          </div>
        ) : (
          <div className={`absolute bottom-2 right-2 ${large ? "w-7 h-28" : "w-5 h-20"}`}>
            <VUMeter left={lvl.l} right={lvl.r} />
          </div>
        )}
      </div>
    </div>
  );
}
