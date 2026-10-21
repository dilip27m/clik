"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_COMPANY, getCompany, isCompanyId } from "@/lib/companies";

const KEY = "billbook:company";

const CompanyContext = createContext<{ company: string; setCompany: (id: string) => void }>({
  company: DEFAULT_COMPANY,
  setCompany: () => {},
});

export function rememberCompany(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

// The company currently being worked on; remembered on this phone.
export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setState] = useState(DEFAULT_COMPANY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the choice saved on this phone
      if (isCompanyId(saved)) setState(saved);
    } catch {}
  }, []);

  const setCompany = useCallback((id: string) => {
    setState(id);
    rememberCompany(id);
  }, []);

  return <CompanyContext.Provider value={{ company, setCompany }}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  return { ...ctx, info: getCompany(ctx.company) };
}
