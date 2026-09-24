import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Plus, Layers, Radio, Search, MonitorPlay } from "lucide-react";

export default function Dashboard() {
  const nav = useNavigate();
  const { current, currentWs } = useWorkspace();
  const [scenes, setScenes] = useState([]);
  const [sources, setSources] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!current) return;
    api.get(`/scenes?workspace_id=${current}`).then(({ data }) => setScenes(data)).catch(() => {});
    api.get(`/sources?workspace_id=${current}`).then(({ data }) => setSources(data)).catch(() => {});
  }, [current]);

  const filtered = scenes.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppLayout>
      {/* top row: big stat card + compact metrics pill */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl clara-soft p-5 flex items-center gap-5">
          <div className="font-display text-5xl font-bold text-slate-900 leading-none">{scenes.length}</div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-brand-500 font-bold">{currentWs?.name || "Workspace"}</div>
            <div className="font-medium text-slate-900">Scenes created</div>
          </div>
          <PrimaryButton icon={Plus} data-testid="dash-new-scene" onClick={() => nav("/scenes")} className="ml-4">New scene</PrimaryButton>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-full clara-soft px-5 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Layers className="h-4 w-4" />Scenes <b className="text-slate-900 ml-0.5">{scenes.length}</b></div>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Radio className="h-4 w-4" />Sources <b className="text-slate-900 ml-0.5">{sources.length}</b></div>
        </motion.div>
      </div>

      {/* center card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="max-w-3xl mx-auto bg-white rounded-3xl clara-soft p-6">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <span className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 font-medium">{currentWs?.name || "All scenes"}</span>
          <div className="relative flex-1 max-w-xs ml-auto min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input data-testid="dash-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scenes…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-300 transition" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <MonitorPlay className="h-9 w-9 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">{scenes.length === 0 ? "No scenes yet in this environment." : "No scenes match your search."}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.slice(0, 6).map((s) => (
              <button key={s.id} data-testid={`dash-scene-${s.id}`} onClick={() => nav(`/scenes/${s.id}`)}
                className="w-full flex items-center gap-4 py-3 px-2 rounded-2xl hover:bg-slate-50 text-left transition-colors">
                <span className="relative h-10 w-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <Layers className="h-5 w-5" />
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{s.name}</div>
                  <div className="text-xs text-slate-400">{(s.elements || []).length} element(s) · {s.width}×{s.height}</div>
                </div>
                <span className="text-xs font-medium text-emerald-600 shrink-0">Ready</span>
              </button>
            ))}
          </div>
        )}

        <div className="pt-4 mt-3 border-t border-slate-100 text-center">
          <button data-testid="dash-view-all" onClick={() => nav("/scenes")} className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors">View all scenes</button>
        </div>
      </motion.div>
    </AppLayout>
  );
}
