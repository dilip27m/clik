import Link from "next/link";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

// On Home: tells the person a batch is still being read, or is ready to check.
export function BatchBanner({ reading, toCheck }: { reading: number; toCheck: number }) {
  if (!reading && !toCheck) return null;
  const busy = reading > 0;
  return (
    <Link
      href="/scan"
      className={`flex items-center gap-3 rounded-2xl border p-4 shadow-card transition animate-rise ${
        busy ? "border-clay/25 bg-clay-soft/50" : "border-leaf/30 bg-leaf-soft"
      }`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-white ${busy ? "bg-clay" : "bg-leaf"}`}>
        {busy ? <Spinner className="size-5" /> : <ClipboardCheck className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">
          {busy ? `Reading ${reading} bill${reading > 1 ? "s" : ""}…` : `${toCheck} bill${toCheck > 1 ? "s are" : " is"} read — check and save`}
        </span>
        <span className="block text-sm text-ink-soft">
          {busy ? (toCheck ? `${toCheck} already done. ` : "") + "You can leave the app; it keeps going." : "Tap to see them in a list."}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-faint" />
    </Link>
  );
}
