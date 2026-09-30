import { useEffect, useRef, useState } from "react";
import { BACKEND } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, Play, Pause, Plus, X, ArrowUp, ArrowDown, Music, Loader2 } from "lucide-react";

const SEARCH_URL = `${BACKEND}/api/public/itunes/search`;

// Shared tiny audio-preview hook
function usePreview() {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(null);
  useEffect(() => {
    ref.current = new Audio();
    ref.current.addEventListener("ended", () => setPlaying(null));
    return () => { if (ref.current) { ref.current.pause(); ref.current = null; } };
  }, []);
  const toggle = (id, url) => {
    const a = ref.current;
    if (!a || !url) return;
    if (playing === id) { a.pause(); setPlaying(null); return; }
    a.src = url; a.play().catch(() => {}); setPlaying(id);
  };
  return { playing, toggle };
}

export function PlayButton({ id, url, playing, toggle, size = "h-8 w-8" }) {
  if (!url) return null;
  const active = playing === id;
  return (
    <button type="button" data-testid={`song-play-${id}`} onClick={() => toggle(id, url)}
      className={`${size} shrink-0 flex items-center justify-center rounded-full transition-colors ${active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
      {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );
}

// Read-only display of chosen songs (used in Messages)
export function SongList({ songs = [] }) {
  const { playing, toggle } = usePreview();
  if (!Array.isArray(songs) || songs.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="space-y-1.5">
      {songs.map((s, i) => (
        <div key={(s.id || "") + i} className="flex items-center gap-2.5">
          <span className="text-[11px] font-bold text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
          {s.artwork ? <img src={s.artwork} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" /> : <span className="h-9 w-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0"><Music className="h-4 w-4 text-slate-400" /></span>}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 truncate">{s.title || "Unknown"}</div>
            <div className="text-xs text-slate-400 truncate">{s.artist || ""}</div>
          </div>
          <PlayButton id={s.id || `s${i}`} url={s.preview} playing={playing} toggle={toggle} />
        </div>
      ))}
    </div>
  );
}

// Interactive picker: search iTunes, select up to `max`, keep order (ranking).
export default function SongPicker({ max = 1, value = [], onChange, testid = "song-picker" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const { playing, toggle } = usePreview();
  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${SEARCH_URL}?term=${encodeURIComponent(q)}&limit=12`);
        setResults(await r.json());
      } catch (e) { setResults([]); }
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const isSel = (s) => selected.some((x) => x.id === s.id);
  const add = (s) => { if (selected.length >= max || isSel(s)) return; onChange([...selected, { id: s.id, title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview }]); };
  const remove = (i) => onChange(selected.filter((_, idx) => idx !== i));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= selected.length) return; const n = [...selected]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };

  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="text-[11px] text-slate-500">{selected.length}/{max} selected</div>
      {selected.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 border border-slate-100 p-2">
          {selected.map((s, i) => (
            <div key={(s.id || "") + i} className="flex items-center gap-2" data-testid={`song-sel-${i}`}>
              <span className="text-[11px] font-bold text-brand-600 w-4 text-right shrink-0">{i + 1}</span>
              {s.artwork ? <img src={s.artwork} alt="" className="h-8 w-8 rounded object-cover shrink-0" /> : <span className="h-8 w-8 rounded bg-slate-200 shrink-0" />}
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-800 truncate">{s.title}</div><div className="text-[11px] text-slate-400 truncate">{s.artist}</div></div>
              <PlayButton id={s.id} url={s.preview} playing={playing} toggle={toggle} size="h-7 w-7" />
              {max > 1 && <>
                <button type="button" onClick={() => move(i, -1)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
              </>}
              <button type="button" data-testid={`song-remove-${i}`} onClick={() => remove(i)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {selected.length < max && (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a song or artist…" className="rounded-xl text-sm pl-8" data-testid={`${testid}-search`} />
          </div>
          {loading && <div className="flex items-center gap-2 text-xs text-slate-400 px-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</div>}
          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-1">
              {results.map((s) => (
                <div key={s.id} className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-50">
                  {s.artwork ? <img src={s.artwork} alt="" className="h-9 w-9 rounded object-cover shrink-0" /> : <span className="h-9 w-9 rounded bg-slate-200 shrink-0" />}
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-800 truncate">{s.title}</div><div className="text-[11px] text-slate-400 truncate">{s.artist}</div></div>
                  <PlayButton id={s.id} url={s.preview} playing={playing} toggle={toggle} size="h-7 w-7" />
                  <button type="button" data-testid={`song-add-${s.id}`} onClick={() => add(s)} disabled={isSel(s)} className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
