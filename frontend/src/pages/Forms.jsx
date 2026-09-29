import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, ListChecks } from "lucide-react";

export default function Forms() {
  const nav = useNavigate();
  const { current } = useWorkspace();
  const [forms, setForms] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = () => { if (current) api.get(`/forms?workspace_id=${current}`).then(({ data }) => setForms(data)).catch(() => {}); };
  useEffect(() => { load(); }, [current]);

  const create = async () => {
    if (!name.trim()) return;
    const { data } = await api.post("/forms", {
      name: name.trim(), description: "", workspace_id: current,
      fields: [
        { id: crypto.randomUUID(), label: "Name", key: "name", type: "text", required: true, options: [], showInList: true },
        { id: crypto.randomUUID(), label: "Email", key: "email", type: "email", required: true, options: [], showInList: true },
        { id: crypto.randomUUID(), label: "Message", key: "message", type: "textarea", required: false, options: [], showInList: false },
      ],
    });
    setOpen(false); setName("");
    nav(`/forms/${data.id}`);
  };

  const remove = async (id) => { await api.delete(`/forms/${id}`); toast.success("Form deleted"); load(); };

  return (
    <AppLayout title="Forms" subtitle={`${forms.length} form(s) · build a form and integrate it in your website via API`}
      actions={<PrimaryButton icon={Plus} data-testid="new-form-btn" onClick={() => setOpen(true)}>New form</PrimaryButton>}>

      {forms.length === 0 ? (
        <div className="bg-white rounded-3xl clara-soft p-12 text-center">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No forms yet. Build a form with your own input fields and integrate it in a website.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {forms.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              data-testid={`form-card-${f.id}`}
              className="bg-white rounded-3xl clara-soft clara-hover clara-trans p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <span className="h-11 w-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><FileText className="h-5 w-5" /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{f.name}</div>
                  {f.description ? <div className="text-xs text-slate-400 truncate">{f.description}</div> : null}
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1"><ListChecks className="h-3 w-3" />{(f.fields || []).length} field(s)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-5">
                <SecondaryButton icon={Pencil} data-testid={`edit-form-${f.id}`} onClick={() => nav(`/forms/${f.id}`)} className="flex-1 justify-center">Edit</SecondaryButton>
                <button data-testid={`del-form-${f.id}`} onClick={() => remove(f.id)} className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">Create form</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Form name</Label>
              <Input data-testid="form-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contact form" className="rounded-xl" autoFocus onKeyDown={(e) => e.key === "Enter" && create()} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-form-confirm" onClick={create}>Create</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
