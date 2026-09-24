import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function TopLoadingBar() {
  const loc = useLocation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 700);
    return () => clearTimeout(t);
  }, [loc.pathname]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ width: "0%", opacity: 1 }}
          animate={{ width: "100%" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="fixed top-0 left-0 h-[3px] z-[60] bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800 shadow-[0_0_8px_rgba(95,109,166,0.6)]"
        />
      )}
    </AnimatePresence>
  );
}
