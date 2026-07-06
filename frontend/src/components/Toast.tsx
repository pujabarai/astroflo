"use client";

import { useState, useCallback, createContext, useContext } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastCtx {
  addToast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastCtx>({
  addToast: () => {},
});

let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const colorMap = {
    success: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", color: "#22c55e" },
    error: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", color: "#f87171" },
    info: { bg: "oklch(0.12 0.01 60 / 0.15)", border: "oklch(0.12 0.01 60 / 0.3)", color: "oklch(0.12 0.01 60)" },
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {toasts.map((t) => {
          const c = colorMap[t.type];
          return (
            <div
              key={t.id}
              className="toast"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: "12px",
                padding: "14px 18px",
                color: c.color,
                fontWeight: 600,
                fontSize: "14px",
                maxWidth: "360px",
                backdropFilter: "blur(12px)",
              }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
