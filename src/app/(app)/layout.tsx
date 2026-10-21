import { AppNav } from "@/components/layout/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const company = process.env.APP_COMPANY_NAME || "Sri Lalithha Pulverisers";
  return (
    <>
      <AppNav company={company} />
      <main className="mx-auto max-w-5xl px-4 pt-5 pb-32 md:pb-12">{children}</main>
    </>
  );
}
