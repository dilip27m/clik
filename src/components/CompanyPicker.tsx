"use client";

import { Building } from "lucide-react";
import { COMPANIES } from "@/lib/companies";

// Two-way switch between the companies, used in the header and on bill forms.
export function CompanyPicker({ value, onChange, size = "md" }: { value: string; onChange: (id: string) => void; size?: "sm" | "md" }) {
  return (
    <div className={`inline-flex rounded-xl border border-line-strong bg-paper p-1 ${size === "md" ? "w-full" : ""}`} role="radiogroup">
      {COMPANIES.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition ${
              size === "sm" ? "h-8 px-3 text-sm" : "h-11 px-4"
            } ${active ? "bg-clay text-white shadow-lift" : "text-ink-soft hover:bg-cream"}`}
          >
            {size === "md" && <Building className="size-4" />}
            {c.short}
          </button>
        );
      })}
    </div>
  );
}
