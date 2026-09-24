import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import SceneCanvas from "@/components/SceneCanvas";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MonitorPlay } from "lucide-react";

export default function Scenes() {
  const nav = useNavigate();
  const { current } = useWorkspace();
  const [scenes, setScenes] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = () => { if (current) api.get(`/scenes?workspace_id=${current}`).then(({ data }) => setScenes(data)).catch(() => {}); };
  useEffect(() => { load(); }, [current]);

  const create = async () => {
    if (!name.trim()) return;
    const { data } = await api.post("/scenes", {
      name: name.trim(), width: 1920, height: 1080, background: { color: "#0b1020" }, workspace_id: current,
      elements: [
        { id: crypto.randomUUID(), type: "text", x: 120, y: 120, w: 900, h: 120, rotation: 0, opacity: 1,
          props: { name: "title", text: "LIVE NOW" }, style: { color: "#ffffff", fontSize: 84, fontWeight: 800, fontFamily: "'Outfit', sans-serif" } },
      ],
    });
    setOpen(false); setName("");
    nav(`/scenes/${data.id}`);
  };

  const remove = async (id) => {
    await api.delete(`/scenes/${id}`);
    toast.success("Scene deleted");
    load();
  };

  return (
    <AppLayout title="Scenes" subtitle={`${scenes.length} overlay scene(s)`}
      actions={<PrimaryButton icon={Plus} data-testid="new-scene-btn" onClick={() => setOpen(true)}>New scene</PrimaryButton>}>

      {scenes.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <MonitorPlay className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No scenes yet. Create your first vMix overlay.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {scenes.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              data-testid={`scene-card-${s.id}`}
              className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
              <div className="p-3 bg-slate-100">
                <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200">
                  <SceneCanvas scene={s} />
                </div>
              </div>
              <div className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{s.name}</div>
                  <div className="text-xs text-slate-400">{(s.elements || []).length} element(s)</div>
                </div>
                <SecondaryButton icon={Pencil} data-testid={`edit-scene-${s.id}`} onClick={() => nav(`/scenes/${s.id}`)}>Edit</SecondaryButton>
                <button data-testid={`del-scene-${s.id}`} onClick={() => remove(s.id)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">Create scene</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Scene name</Label>
              <Input data-testid="scene-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lower Third" className="rounded-xl" autoFocus onKeyDown={(e) => e.key === "Enter" && create()} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-scene-confirm" onClick={create}>Create</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
