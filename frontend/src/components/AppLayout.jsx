import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { Logo } from "@/components/Logo";
import { TopLoadingBar } from "@/components/TopLoadingBar";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, ChevronDown, HelpCircle, LogOut, Settings, Users, Plus, Check } from "lucide-react";

function DesktopNav({ navItems, location, navigate }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(navItems.length);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const hidden = measureRef.current;
      if (!container || !hidden) return;
      const avail = container.offsetWidth;
      const children = Array.from(hidden.children);
      const gap = 2;
      const total = children.reduce((a, c) => a + c.offsetWidth + gap, 0);
      if (total <= avail) { setVisibleCount(navItems.length); return; }
      const moreW = 104; // reserve for the "More" button
      let used = 0, count = 0;
      for (let i = 0; i < children.length; i++) {
        const w = children[i].offsetWidth + gap;
        if (used + w <= avail - moreW) { used += w; count++; } else break;
      }
      setVisibleCount(Math.max(1, count));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [navItems]);

  const visible = navItems.slice(0, visibleCount);
  const overflow = navItems.slice(visibleCount);
  const overflowActive = overflow.some(({ to }) => location.pathname === to || location.pathname.startsWith(to + "/"));

  const itemClass = "relative flex items-center px-3 py-2 rounded-full text-sm font-medium transition-colors hover:text-slate-900 whitespace-nowrap";

  return (
    <div className="hidden xl:flex items-center flex-1 min-w-0 ml-3">
      {/* hidden measuring copy (all items, off-screen) */}
      <nav ref={measureRef} aria-hidden="true" className="flex items-center gap-0.5 absolute opacity-0 pointer-events-none -z-10" style={{ left: -9999, top: 0 }}>
        {navItems.map(({ to, label, badge }) => (
          <span key={to} className={itemClass}>
            <span className="flex items-center gap-1.5">{label}{badge > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold">{badge > 99 ? "99+" : badge}</span>}</span>
          </span>
        ))}
      </nav>

      <nav ref={containerRef} className="flex items-center gap-0.5 flex-1 min-w-0">
        {visible.map(({ to, label, badge }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <NavLink key={to} to={to} data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`} className={itemClass}>
              {active && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 bg-slate-900 rounded-full shadow-lg shadow-slate-900/25"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }} />
              )}
              <span className={`relative z-10 flex items-center gap-1.5 ${active ? "text-white" : "text-slate-500"}`}>
                {label}
                {badge > 0 && (
                  <span data-testid="messages-unread-badge" className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${active ? "bg-white text-slate-900" : "bg-brand-600 text-white"}`}>{badge > 99 ? "99+" : badge}</span>
                )}
              </span>
            </NavLink>
          );
        })}

        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="nav-more" className={`relative flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${overflowActive ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>
                More <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {overflow.map(({ to, label, badge }) => {
                const active = location.pathname === to || location.pathname.startsWith(to + "/");
                return (
                  <DropdownMenuItem key={to} data-testid={`nav-more-${label.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => navigate(to)}
                    className={`cursor-pointer flex items-center justify-between ${active ? "text-brand-600 font-semibold" : ""}`}>
                    <span>{label}</span>
                    {badge > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-brand-600 text-white">{badge > 99 ? "99+" : badge}</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </div>
  );
}

export default function AppLayout({ children, title, subtitle, actions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { list, currentWs, setCurrent, createWs } = useWorkspace();
  const [newEnvOpen, setNewEnvOpen] = useState(false);
  const [envName, setEnvName] = useState("");
  const [unread, setUnread] = useState(0);
  const initials = (user?.name || user?.email || "U").slice(0, 1).toUpperCase();

  useEffect(() => {
    document.title = title ? `Clara Frames | ${title}` : "Clara Frames";
  }, [title]);

  useEffect(() => {
    if (!currentWs?.id) return;
    let alive = true;
    const fetchUnread = () => api.get(`/submissions/unread-count?workspace_id=${currentWs.id}`)
      .then(({ data }) => { if (alive) setUnread(data.count || 0); }).catch(() => {});
    fetchUnread();
    const t = setInterval(fetchUnread, 20000);
    window.addEventListener("submissions-changed", fetchUnread);
    return () => { alive = false; clearInterval(t); window.removeEventListener("submissions-changed", fetchUnread); };
  }, [currentWs?.id, location.pathname]);

  const navItems = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/scenes", label: "Scenes" },
    { to: "/pancartes", label: "Pancartes" },
    { to: "/flows", label: "Flows" },
    { to: "/forms", label: "Forms" },
    { to: "/messages", label: "Messages", badge: unread },
    { to: "/sources", label: "API Sources" },
    { to: "/overlays", label: "Overlays" },
    { to: "/fonts", label: "Fonts" },
    { to: "/media", label: "Media" },
    { to: "/help", label: "vMix Help" },
    ...(user?.role === "admin" ? [{ to: "/users", label: "Users" }] : []),
  ];

  const avatarEl = user?.avatar
    ? <img src={user.avatar} alt="" className="h-9 w-9 rounded-full object-cover shadow-sm" />
    : <span className="h-9 w-9 rounded-full bg-brand-50 text-brand-600 font-semibold flex items-center justify-center shadow-sm">{initials}</span>;

  const submitEnv = async () => {
    if (!envName.trim()) return;
    await createWs(envName.trim());
    setEnvName(""); setNewEnvOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <TopLoadingBar />
      <header className="sticky top-0 z-30 bg-[#F5F6F8]/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <button data-testid="logo-btn" onClick={() => navigate("/dashboard")}><Logo /></button>
            <div className="hidden sm:block h-5 w-px bg-slate-200/70" />
            <span className="hidden sm:block font-display font-semibold text-slate-900 text-[15px] whitespace-nowrap">
              Clara Frames
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="workspace-switcher" className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors max-w-[220px]">
                <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-800 truncate">{currentWs?.name || "Environment"}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Environments</DropdownMenuLabel>
              {list.map((w) => (
                <DropdownMenuItem key={w.id} data-testid={`ws-item-${w.id}`} onClick={() => setCurrent(w.id)} className="cursor-pointer">
                  <span className="h-2.5 w-2.5 rounded-full mr-2 shrink-0" style={{ background: w.color }} />
                  <span className="flex-1 truncate">{w.name}</span>
                  {currentWs?.id === w.id && <Check className="h-4 w-4 text-brand-600" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="new-env-btn" onClick={() => setNewEnvOpen(true)} className="cursor-pointer text-brand-600 font-medium">
                <Plus className="h-4 w-4 mr-2" />New environment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DesktopNav navItems={navItems} location={location} navigate={navigate} />

          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => navigate("/help")} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition-colors">
              <HelpCircle className="h-[19px] w-[19px]" />
            </button>
            <div className="pl-3 border-l border-slate-200/60">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-testid="account-menu" className="flex items-center gap-2 rounded-full pr-1.5 py-1 pl-1 hover:bg-slate-100/70 transition-colors">
                    {avatarEl}
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{user?.name || user?.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-settings" onClick={() => navigate("/settings")} className="cursor-pointer"><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
                  {user?.role === "admin" && <DropdownMenuItem data-testid="menu-users" onClick={() => navigate("/users")} className="cursor-pointer"><Users className="h-4 w-4 mr-2" />Users</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="logout-btn" onClick={logout} className="cursor-pointer text-red-600"><LogOut className="h-4 w-4 mr-2" />Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <nav className="xl:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto">
          {navItems.map(({ to, label, badge }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isActive ? "bg-slate-900 text-white" : "text-slate-600 bg-slate-100"}`}>
              {label}
              {badge > 0 && <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold bg-brand-600 text-white">{badge > 99 ? "99+" : badge}</span>}
            </NavLink>
          ))}
        </nav>
      </header>

      <motion.main key={location.pathname}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="max-w-[1400px] mx-auto px-6 py-8">
        {(title || subtitle || actions) && (
          <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
            <div>
              {title && <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{title}</h1>}
              {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        )}
        {children}
      </motion.main>

      <Dialog open={newEnvOpen} onOpenChange={setNewEnvOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="font-display">New environment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Environment name</Label>
              <Input data-testid="env-name-input" value={envName} onChange={(e) => setEnvName(e.target.value)} placeholder="e.g. Sports Show 2026" className="rounded-xl" autoFocus onKeyDown={(e) => e.key === "Enter" && submitEnv()} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <SecondaryButton onClick={() => setNewEnvOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton data-testid="create-env-confirm" onClick={submitEnv}>Create</PrimaryButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
