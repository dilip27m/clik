"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, House, LogOut, ScanLine } from "lucide-react";
import { clearCache } from "@/lib/client/useCached";

const LINKS = [
  { href: "/", label: "Home", icon: House },
  { href: "/scan", label: "Scan Bill", icon: ScanLine },
  { href: "/bills", label: "Bills", icon: FolderOpen },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

async function logout() {
  await fetch("/api/login", { method: "DELETE" });
  clearCache();
  window.location.replace("/login");
}

// Top bar on computers, bottom tab bar on phones.
export function AppNav({ company }: { company: string }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-clay font-display text-lg font-bold text-white shadow-lift">
              {company.charAt(0) || "B"}
            </span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold text-ink">Bill Book</span>
              <span className="block text-xs text-ink-soft">{company}</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 font-medium transition ${
                  isActive(path, href) ? "bg-clay-soft text-clay-dark" : "text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon className="size-5" /> {label}
              </Link>
            ))}
          </nav>
          <button
            onClick={logout}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink-soft hover:bg-paper md:ml-2"
          >
            <LogOut className="size-4" /> <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid h-[4.5rem] max-w-md grid-cols-3 items-center">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            if (href === "/scan") {
              return (
                <Link key={href} href={href} className="flex flex-col items-center gap-1">
                  <span className={`-mt-7 grid size-16 place-items-center rounded-full border-4 border-cream text-white shadow-lift ${active ? "bg-clay-dark" : "bg-clay"}`}>
                    <Icon className="size-7" />
                  </span>
                  <span className={`text-xs font-semibold ${active ? "text-clay-dark" : "text-ink-soft"}`}>{label}</span>
                </Link>
              );
            }
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-1 ${active ? "text-clay-dark" : "text-ink-soft"}`}>
                <Icon className="size-6" />
                <span className="text-xs font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
