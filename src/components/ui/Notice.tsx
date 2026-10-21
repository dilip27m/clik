import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { ReactNode } from "react";

type Tone = "info" | "warn" | "error" | "success";

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "bg-clay-soft/60 border-clay/20 text-clay-dark", icon: <Info className="size-5 shrink-0" /> },
  warn: { box: "bg-gold-soft border-gold/30 text-[#7a5308]", icon: <TriangleAlert className="size-5 shrink-0" /> },
  error: { box: "bg-rust-soft border-rust/30 text-rust", icon: <CircleX className="size-5 shrink-0" /> },
  success: { box: "bg-leaf-soft border-leaf/30 text-leaf", icon: <CircleCheck className="size-5 shrink-0" /> },
};

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const t = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${t.box}`} role={tone === "error" ? "alert" : "status"}>
      {t.icon}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="mt-0.5 text-[0.95rem] leading-snug opacity-90">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
