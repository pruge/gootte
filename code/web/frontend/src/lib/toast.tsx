import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ToastMessage {
  id: number;
  text: string;
  kind: "success" | "error";
}

interface ToastCtx {
  show: (text: string, kind?: "success" | "error") => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<ToastMessage[]>([]);
  const show = useCallback((text: string, kind: "success" | "error" = "success") => {
    const id = nextId++;
    setMsgs((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setMsgs((prev) => prev.filter((m) => m.id !== id)), 3000);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {/* 고정: 우측 상단에 toast stack */}
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`animate-toast-in rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
              m.kind === "success"
                ? "bg-green-700 text-white"
                : "bg-red-700 text-white"
            }`}
          >
            {m.kind === "success" ? "✓ " : "✗ "}
            {m.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}