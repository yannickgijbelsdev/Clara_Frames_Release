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
import { Plus, Pencil, Trash2, Copy, LayoutTemplate } from "lucide-react";
import { uid } from "@/lib/elementDefs";

export default function Pancartes() {
  const nav = useNavigate();
  const { current } = useWorkspace();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = () => { if (current) api.get(`/pancartes?workspace_id=${current}`).then(({ data }) => setItems(data)).catch(() => {}); };
  useEffect(() => { load(); }, [current]);

  const create = async () => {
    if (!name.trim()) return;
    const { data } = await api.post("/pancartes", {
      name: name.trim(), width: 1920, height: 1080, background: { color: "#0b1020" }, workspace_id: current,
      elements: [
        { id: uid(), type: "text", x: 140, y: 760, w: 1100, h: 140, rotation: 0, opacity: 1,
          props: { name: "title", text: "Jane Doe" }, style: { color: "#ffffff", fontSize: 96, fontWeight: 800, fontFamily: "'Outfit', sans-serif" } },
        { id: uid(), type: "text", x: 140, y: 900, w: 1100, h: 90, rotation: 0, opacity: 1,
          props: { name: "subtitle", text: "Host" }, style: { color: "#c9d0ee", fontSize: 52, fontWeight: 500, fontFamily: "'Plus Jakarta Sans', sans-serif" } },
      ],
    });
    setOpen(false); setName("");
    nav(`/pancartes/${data.id}`);
  };

  const duplicate = async (p) => {
    const { data } = await api.post("/pancartes", { name: `${p.name} copy`, width: p.width, height: p.height, background: p.background, elements: p.elements, workspace_id: current });
    toast.success("Pancarte duplicated"); load();
  };
  const remove = async (id) => { await api.delete(`/pancartes/${id}`); toast.success("Pancarte deleted"); load(); };

  return (
    <AppLayout title="Pancartes" subtitle={`${items.length} card design(s) · reusable across flows`}
      actions={<PrimaryButton icon={Plus} data-testid="new-pancarte-btn" onClick={() => setOpen(true)}>New pancarte</PrimaryButton>}>

      {items.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <LayoutTemplate className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No pancartes yet. Design a card with its own background, images and texts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              data-testid={`pancarte-card-${p.id}`}
              className="bg-white rounded-3xl clara-soft clara-hover clara-trans overflow-hidden">
              <div className="p-3 bg-slate-100">
                <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-slate-200" style={{ aspectRatio: `${p.width || 1920} / ${p.height || 1080}` }}>
                  <PancarteView pancarte={p} />
                </div>
              </div>
              <div className="p-4 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="text-xs text-slate-400">{(p.elements || []).length} element(s)</div>
                </div>
                <button data-testid={`dup-pancarte-${p.id}`} onClick={() => duplicate(p)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><Copy className="h-4 w-4" /></button>
                <SecondaryButton icon={Pencil} data-testid={`edit-pancarte-${p.id}`} onClick={() => nav(`/pancartes/${p.id}`)}>Edit</SecondaryButton>
                <button data-testid={`del-pancarte-${p.id}`} onClick={() => remove(p.id)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">Create pancarte</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Pancarte name</Label>
              <Input data-testid="pancarte-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Presenter card" className="rounded-xl" autoFocus onKeyDown={(e) => e.key === "Enter" && create()} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-pancarte-confirm" onClick={create}>Create</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
