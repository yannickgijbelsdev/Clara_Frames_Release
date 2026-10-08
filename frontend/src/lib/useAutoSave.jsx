import { useEffect, useRef, useState } from "react";

// Debounced auto-save. Calls saveFn() ~delay ms after `data` identity changes.
// Skips the first run (initial load) so we never save freshly-loaded data.
// Returns a status string: 'pending' | 'saving' | 'saved' | 'error'.
export function useAutoSave(data, saveFn, delay = 1000) {
  const [status, setStatus] = useState("saved");
  const first = useRef(true);
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;

  useEffect(() => {
    if (data == null) return;
    if (first.current) { first.current = false; return; }
    setStatus("pending");
    const t = setTimeout(async () => {
      setStatus("saving");
      try { await saveRef.current(); setStatus("saved"); }
      catch (e) { setStatus("error"); }
    }, delay);
    return () => clearTimeout(t);
  }, [data, delay]);

  return status;
}

export function AutoSaveBadge({ status }) {
  const map = {
    pending: { t: "Editing…", dot: "bg-slate-300", c: "text-slate-400" },
    saving: { t: "Saving…", dot: "bg-amber-400", c: "text-slate-500" },
    saved: { t: "Auto-saved · live in vMix", dot: "bg-emerald-500", c: "text-emerald-600" },
    error: { t: "Save failed — retrying on next edit", dot: "bg-rose-500", c: "text-rose-600" },
  };
  const s = map[status] || map.saved;
  return (
    <span data-testid="autosave-status" className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.c}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "saving" ? "animate-pulse" : ""}`} />
      {s.t}
    </span>
  );
}
