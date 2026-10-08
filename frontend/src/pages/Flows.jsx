import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import PancarteView from "@/components/PancarteView";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Film, Clock } from "lucide-react";

export default function Flows() {
  const nav = useNavigate();
  const { current } = useWorkspace();
  const [flows, setFlows] = useState([]);
  const [pancartes, setPancartes] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = () => {
    if (!current) return;
    api.get(`/flows?workspace_id=${current}`).then(({ data }) => setFlows(data)).catch(() => {});
    api.get(`/pancartes?workspace_id=${current}`).then(({ data }) => setPancartes(data)).catch(() => {});
  };
  useEffect(() => { load(); }, [current]);
  const panById = Object.fromEntries(pancartes.map((p) => [p.id, p]));

  const create = async () => {
    if (!name.trim()) return;
    const { data } = await api.post("/flows", { name: name.trim(), interval: 5, entrance: "fade", entranceDuration: 0.6, pancarte_ids: [], durations: [], loop: true, workspace_id: current });
    setOpen(false); setName("");
    nav(`/reeksen/${data.id}`);
  };
  const remove = async (id) => { await api.delete(`/flows/${id}`); toast.success("Reeks verwijderd"); load(); };

  return (
    <AppLayout title="Reeksen" subtitle={`${flows.length} reeks(en) · overlays die na elkaar spelen`}
      actions={<PrimaryButton icon={Plus} data-testid="new-flow-btn" onClick={() => setOpen(true)}>New reeks</PrimaryButton>}>

      {flows.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <Film className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Nog geen reeksen. Maak een reeks en sleep overlays erin om ze na elkaar af te spelen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {flows.map((f, i) => {
            const first = (f.pancarte_ids || []).map((id) => panById[id]).filter(Boolean)[0];
            return (
              <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                data-testid={`flow-card-${f.id}`}
                className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
                <div className="p-3 bg-slate-100">
                  <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
                    {first ? <PancarteView pancarte={first} /> : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">Geen overlays</div>}
                  </div>
                </div>
                <div className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{f.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" />{(f.pancarte_ids || []).length} overlay(s) · {f.interval || 5}s elk{f.loop === false ? " · geen loop" : ""}</div>
                  </div>
                  <SecondaryButton icon={Pencil} data-testid={`edit-flow-${f.id}`} onClick={() => nav(`/reeksen/${f.id}`)}>Edit</SecondaryButton>
                  <button data-testid={`del-flow-${f.id}`} onClick={() => remove(f.id)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">Create reeks</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Reeks naam</Label>
              <Input data-testid="flow-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Presenters rotation" className="rounded-xl" autoFocus onKeyDown={(e) => e.key === "Enter" && create()} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-flow-confirm" onClick={create}>Create</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
