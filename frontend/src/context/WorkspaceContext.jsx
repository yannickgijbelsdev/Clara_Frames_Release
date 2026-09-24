import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const Ctx = createContext(null);
export const useWorkspace = () => useContext(Ctx);

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [current, setCurrentState] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/workspaces");
    setList(data);
    setCurrentState((prev) => {
      const saved = localStorage.getItem("ws");
      const pick = data.find((w) => w.id === prev) || data.find((w) => w.id === saved) || data[0];
      return pick?.id || null;
    });
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const setCurrent = (id) => { setCurrentState(id); localStorage.setItem("ws", id); };

  const createWs = async (name, color = "#5f6da6") => {
    const { data } = await api.post("/workspaces", { name, color });
    setList((l) => [...l, data]); setCurrent(data.id); return data;
  };
  const renameWs = async (id, name, color) => {
    await api.put(`/workspaces/${id}`, { name, color });
    setList((l) => l.map((w) => (w.id === id ? { ...w, name, color } : w)));
  };
  const deleteWs = async (id) => {
    await api.delete(`/workspaces/${id}`);
    setList((l) => {
      const nl = l.filter((w) => w.id !== id);
      setCurrentState((cur) => (cur === id ? nl[0]?.id || null : cur));
      return nl;
    });
  };

  const currentWs = list.find((w) => w.id === current) || null;
  return (
    <Ctx.Provider value={{ list, current, currentWs, setCurrent, createWs, renameWs, deleteWs, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}
