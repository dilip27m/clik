import { AppNav } from "@/components/layout/AppNav";
import { CompanyProvider } from "@/lib/client/company";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 pt-5 pb-32 md:pb-12">{children}</main>
    </CompanyProvider>
  );
}
