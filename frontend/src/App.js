import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Scenes from "@/pages/Scenes";
import SceneEditor from "@/pages/SceneEditor";
import SceneOverview from "@/pages/SceneOverview";
import Pancartes from "@/pages/Pancartes";
import PancarteEditor from "@/pages/PancarteEditor";
import Flows from "@/pages/Flows";
import FlowEditor from "@/pages/FlowEditor";
import Forms from "@/pages/Forms";
import FormEditor from "@/pages/FormEditor";
import Messages from "@/pages/Messages";
import PublicForm from "@/pages/PublicForm";
import ExportPage from "@/pages/ExportPage";
import Sources from "@/pages/Sources";
import MediaLibrary from "@/pages/MediaLibrary";
import Overlays from "@/pages/Overlays";
import Fonts from "@/pages/Fonts";
import Help from "@/pages/Help";
import Settings from "@/pages/Settings";
import Users from "@/pages/Users";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Public({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              <Route path="/login" element={<Public><Login /></Public>} />
              <Route path="/f/:token" element={<PublicForm />} />
              <Route path="/register" element={<Public><Register /></Public>} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/scenes" element={<Protected><Scenes /></Protected>} />
              <Route path="/scenes/:id" element={<Protected><SceneEditor /></Protected>} />
              <Route path="/scenes/:id/overview" element={<Protected><SceneOverview /></Protected>} />
              <Route path="/scenes/:id/export" element={<Protected><ExportPage /></Protected>} />
              <Route path="/overlays" element={<Protected><Pancartes /></Protected>} />
              <Route path="/overlays/:id" element={<Protected><PancarteEditor /></Protected>} />
              <Route path="/sequences" element={<Protected><Flows /></Protected>} />
              <Route path="/sequences/:id" element={<Protected><FlowEditor /></Protected>} />
              <Route path="/forms" element={<Protected><Forms /></Protected>} />
              <Route path="/forms/:id" element={<Protected><FormEditor /></Protected>} />
              <Route path="/messages" element={<Protected><Messages /></Protected>} />
              <Route path="/sources" element={<Protected><Sources /></Protected>} />
              <Route path="/media" element={<Protected><MediaLibrary /></Protected>} />
              <Route path="/assets" element={<Protected><Overlays /></Protected>} />
              <Route path="/fonts" element={<Protected><Fonts /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/users" element={<Protected><Users /></Protected>} />
              <Route path="/help" element={<Protected><Help /></Protected>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
