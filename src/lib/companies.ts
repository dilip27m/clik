// The companies whose bills are kept. Each has its own bills, totals and
// Google Sheet; one login switches between them inside the app.

export interface Company {
  id: string;
  name: string;
  short: string;
  // How the company's name appears on bills (consignee, receiver, seller…).
  match: RegExp;
}

export const COMPANIES: Company[] = [
  { id: "slp", name: "Sri Lalithha Pulverisers", short: "Sri Lalithha", match: /lalit/i },
  { id: "renuka", name: "Renuka Minerals", short: "Renuka", match: /renuka/i },
];

export const DEFAULT_COMPANY = COMPANIES[0].id;

export function getCompany(id: unknown): Company {
  return COMPANIES.find((c) => c.id === id) ?? COMPANIES[0];
}

export function isCompanyId(id: unknown): id is string {
  return COMPANIES.some((c) => c.id === id);
}

// Which company a bill belongs to, from the name printed on it.
export function companyFromName(name: unknown): string | null {
  const text = String(name ?? "");
  return COMPANIES.find((c) => c.match.test(text))?.id ?? null;
}
