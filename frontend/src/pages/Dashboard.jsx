import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/context/AuthContext";
import { Layers, Radio, Plus, MonitorPlay, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [scenes, setScenes] = useState([]);
  const [sources, setSources] = useState([]);

  useEffect(() => {
    api.get("/scenes").then(({ data }) => setScenes(data)).catch(() => {});
    api.get("/sources").then(({ data }) => setSources(data)).catch(() => {});
  }, []);

  const stats = [
    { label: "Overlay scenes", value: scenes.length, icon: Layers, to: "/scenes", color: "from-[#8f99c5] to-[#545f8f]" },
    { label: "API sources", value: sources.length, icon: Radio, to: "/sources", color: "from-rose-400 to-rose-600" },
    { label: "Ready for vMix", value: scenes.length, icon: MonitorPlay, to: "/scenes", color: "from-emerald-400 to-emerald-600" },
  ];

  return (
    <AppLayout title={`Welcome, ${user?.name || "creator"}`} subtitle="Design broadcast overlays and export them straight into vMix."
      actions={<PrimaryButton icon={Plus} data-testid="dash-new-scene" onClick={() => nav("/scenes")}>New scene</PrimaryButton>}>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s, i) => (
          <motion.button key={s.label} onClick={() => nav(s.to)}
            data-testid={`stat-${i}`}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="text-left bg-white rounded-3xl clara-soft clara-hover clara-trans p-5 flex items-center gap-4">
            <span className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shrink-0`}>
              <s.icon className="h-6 w-6" />
            </span>
            <div>
              <div className="font-display text-3xl font-bold text-slate-900">{s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl clara-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">Recent scenes</h2>
            <button onClick={() => nav("/scenes")} className="text-sm text-rose-600 font-medium inline-flex items-center gap-1">View all <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          {scenes.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No scenes yet. Create your first overlay.</p>
          ) : (
            <div className="space-y-2">
              {scenes.slice(0, 4).map((s) => (
                <button key={s.id} onClick={() => nav(`/scenes/${s.id}`)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 text-left">
                  <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#8f99c5] to-[#545f8f] text-white flex items-center justify-center font-bold shrink-0">{s.name.slice(0, 1).toUpperCase()}</span>
                  <div className="flex-1 min-w-0"><div className="font-medium text-slate-900 truncate">{s.name}</div><div className="text-xs text-slate-400">{(s.elements || []).length} element(s)</div></div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl clara-soft p-6 text-white flex flex-col justify-between">
          <div>
            <MonitorPlay className="h-8 w-8 text-rose-400 mb-3" />
            <h2 className="font-display text-xl font-semibold">How it plugs into vMix</h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">Build a scene, then add it to vMix as a single <b>Web Browser input</b> (live overlay) or bind Title fields to the <b>Data Source (XML/JSON)</b> endpoint.</p>
          </div>
          <button onClick={() => nav("/help")} className="mt-5 self-start inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 text-sm font-medium">Read the vMix guide <ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </AppLayout>
  );
}
