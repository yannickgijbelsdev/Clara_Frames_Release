import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { SecondaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SongList } from "@/components/SongPicker";
import { toast } from "sonner";
import { Inbox, ChevronDown, ChevronUp, Trash2, Check, Mail, Radio, X } from "lucide-react";

function renderValue(field, value) {
  if (value === undefined || value === null || value === "") return "—";
  if (field?.type === "checkbox") return (value === true || value === "true" || value === "on" || value === 1) ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toSongs(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[") || t.startsWith("{")) { try { const p = JSON.parse(t); return Array.isArray(p) ? p : [p]; } catch (e) {} }
    return t ? [t] : [];
  }
  if (v && typeof v === "object") return [v];
  return [];
}

function FieldValue({ field, value, onLive }) {
  if (field?.type === "song_pick") return <SongList songs={toSongs(value)} onLive={onLive} />;
  return <span className="text-sm text-slate-800 break-words">{renderValue(field, value)}</span>;
}

export default function Messages() {
  const { current } = useWorkspace();
  const [forms, setForms] = useState([]);
  const [subs, setSubs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [live, setLive] = useState(null);

  const loadLive = () => {
    if (!current) return;
    api.get(`/sources/live?workspace_id=${current}`)
      .then(({ data }) => { const l = data?.live; setLive(l && (l.title || l.text) ? l : null); })
      .catch(() => {});
  };
  const load = () => {
    if (!current) return;
    api.get(`/forms?workspace_id=${current}`).then(({ data }) => setForms(data)).catch(() => {});
    api.get(`/submissions?workspace_id=${current}`).then(({ data }) => setSubs(data)).catch(() => {});
    loadLive();
  };
  useEffect(() => { load(); }, [current]);

  const sendLive = async (song) => {
    try {
      const { data } = await api.post(`/sources/live`, {
        workspace_id: current, title: song.title || "", artist: song.artist || "",
        artwork: song.artwork || "", preview: song.preview || "",
      });
      setLive(data.live);
      toast.success("Live gezet in de overlay");
    } catch (e) { toast.error("Live zetten mislukt"); }
  };
  const clearLive = async () => {
    try { await api.delete(`/sources/live?workspace_id=${current}`); setLive(null); toast.success("Live leeggemaakt"); }
    catch (e) { toast.error("Leegmaken mislukt"); }
  };

  const formsById = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f])), [forms]);
  const visibleSubs = filter === "all" ? subs : subs.filter((s) => s.form_id === filter);

  const markRead = async (s) => {
    if (s.read) return;
    setSubs((arr) => arr.map((x) => x.id === s.id ? { ...x, read: true } : x));
    try { await api.post(`/submissions/${s.id}/read`); window.dispatchEvent(new Event("submissions-changed")); } catch (e) {}
  };
  const toggle = (s) => {
    setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }));
    if (!expanded[s.id]) markRead(s);
  };
  const remove = async (s) => {
    setSubs((arr) => arr.filter((x) => x.id !== s.id));
    try { await api.delete(`/submissions/${s.id}`); window.dispatchEvent(new Event("submissions-changed")); toast.success("Message deleted"); } catch (e) { toast.error("Delete failed"); }
  };

  const unreadTotal = subs.filter((s) => !s.read).length;

  return (
    <AppLayout title="Messages" subtitle={`${subs.length} message(s)${unreadTotal ? ` · ${unreadTotal} unread` : ""}`}
      actions={
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="rounded-full w-52" data-testid="messages-form-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All forms</SelectItem>
            {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>}>

      {live && (
        <div data-testid="live-now-banner" className="bg-slate-900 text-white rounded-3xl p-4 mb-4 flex items-center gap-4">
          <span className="h-10 w-10 rounded-2xl bg-brand-600/20 text-brand-300 flex items-center justify-center shrink-0">
            <Radio className="h-5 w-5" />
          </span>
          {live.artwork && <img src={live.artwork} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-brand-300 font-bold">Nu live in de overlay</div>
            <div className="text-sm font-semibold truncate">{live.text || [live.artist, live.title].filter(Boolean).join(" - ") || "—"}</div>
          </div>
          <button data-testid="live-clear-btn" onClick={clearLive}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X className="h-3.5 w-3.5" />Wis
          </button>
        </div>
      )}

      {visibleSubs.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center" data-testid="messages-empty">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No messages yet. Answers submitted through your forms will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSubs.map((s, i) => {
            const form = formsById[s.form_id];
            const fields = form?.fields || [];
            const listFields = fields.filter((f) => f.showInList !== false);
            const detailFields = fields.filter((f) => f.showInList === false);
            const knownKeys = new Set(fields.map((f) => f.key));
            const extraKeys = Object.keys(s.data || {}).filter((k) => !knownKeys.has(k));
            const isOpen = !!expanded[s.id];
            const hasDetails = detailFields.length > 0 || extraKeys.length > 0;
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                data-testid={`message-card-${s.id}`}
                className={`bg-white rounded-3xl clara-soft p-5 border ${s.read ? "border-transparent" : "border-brand-200 ring-1 ring-brand-100"}`}>
                <div className="flex items-start gap-3">
                  <span className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${s.read ? "bg-slate-100 text-slate-400" : "bg-brand-50 text-brand-600"}`}>
                    {s.read ? <Mail className="h-5 w-5" /> : <span className="relative"><Mail className="h-5 w-5" /><span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-brand-600" /></span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{form?.name || "Unknown form"}</span>
                      <span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleString()}</span>
                      {!s.read && <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wide">New</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {listFields.length === 0 ? (
                        <div className="text-sm text-slate-400">No preview fields configured — open details.</div>
                      ) : listFields.map((f) => (
                        <div key={f.key} className="min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{f.label}</div>
                          <FieldValue field={f} value={s.data?.[f.key]} onLive={f.type === "song_pick" ? sendLive : undefined} />
                        </div>
                      ))}
                    </div>

                    {isOpen && hasDetails && (
                      <div data-testid={`message-details-${s.id}`} className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {detailFields.map((f) => (
                          <div key={f.key} className="min-w-0">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{f.label}</div>
                            <FieldValue field={f} value={s.data?.[f.key]} onLive={f.type === "song_pick" ? sendLive : undefined} />
                          </div>
                        ))}
                        {extraKeys.map((k) => (
                          <div key={k} className="min-w-0">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{k}</div>
                            <div className="text-sm text-slate-800 break-words">{renderValue(null, s.data?.[k])}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      {hasDetails && (
                        <SecondaryButton data-testid={`message-more-${s.id}`} onClick={() => toggle(s)} icon={isOpen ? ChevronUp : ChevronDown} className="text-xs py-1.5">
                          {isOpen ? "Hide details" : "More details"}
                        </SecondaryButton>
                      )}
                      {!s.read && (
                        <button data-testid={`message-markread-${s.id}`} onClick={() => markRead(s)} className="text-xs font-medium text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />Mark read</button>
                      )}
                      <button data-testid={`message-delete-${s.id}`} onClick={() => remove(s)} className="ml-auto h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
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
