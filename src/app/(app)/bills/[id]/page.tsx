"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CloudUpload, ExternalLink, Link2, Pencil, Trash, TriangleAlert } from "lucide-react";
import { BILL_TYPES, Bill, BillData, formatDate, formatQty } from "@/lib/bill-types";
import { api } from "@/lib/client/api";
import { useCached } from "@/lib/client/useCached";
import { BillDetails } from "@/components/bill/BillDetails";
import { BillForm } from "@/components/bill/BillForm";
import { BillPhoto } from "@/components/bill/BillPhoto";
import { BillTypeChip } from "@/components/bill/billStyle";
import { getCompany } from "@/lib/companies";
import { CompanyPicker } from "@/components/CompanyPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export default function BillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useCached<{ bill: Bill; matches: Bill[]; sheetsConfigured: boolean }>(`/api/bills/${id}`);
  const [editing, setEditing] = useState(false);
  const [editCompany, setEditCompany] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) {
    return error ? (
      <Notice tone="error" title="Could not open this bill">{error}</Notice>
    ) : (
      <div className="grid place-items-center py-20 text-clay">
        <Spinner className="size-8" />
      </div>
    );
  }

  const { bill, matches } = data;
  const def = BILL_TYPES[bill.type];
  const isPurchase = bill.type === "apmdc_invoice" || bill.type === "transit_in";

  async function saveEdit(values: BillData) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/bills/${bill.id}`, { method: "PATCH", body: { data: values, company: editCompany ?? bill.company } });
      setEditing(false);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${def.name} ${bill.docNo}? It will also be removed from the Google Sheet.`)) return;
    setBusy(true);
    try {
      await api(`/api/bills/${bill.id}`, { method: "DELETE" });
      router.replace(`/bills?type=${bill.type}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <Link href={`/bills?type=${bill.type}`} className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-clay">
        <ArrowLeft className="size-5" /> All {def.name} bills
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">{bill.docNo}</h1>
        <BillTypeChip type={bill.type} />
      </div>
      <p className="-mt-3 text-ink-soft">
        {getCompany(bill.company).name} · {formatDate(bill.date)} · {bill.party}
      </p>

      {actionError && <Notice tone="error">{actionError}</Notice>}

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
        <div className="space-y-3 md:sticky md:top-20">
          {bill.hasPhoto ? (
            <BillPhoto src={`/api/bills/${bill.id}/photo`} className="max-h-[50vh] md:max-h-[70vh]" />
          ) : (
            <Card className="p-8 text-center text-ink-soft">No photo for this bill</Card>
          )}
          <SyncStatus bill={bill} connected={data.sheetsConfigured} />
        </div>

        <div className="space-y-4">
          {editing ? (
            <>
              <div className="rounded-2xl border border-line bg-paper p-4">
                <p className="mb-2 text-[0.95rem] font-medium text-ink-soft">Company</p>
                <CompanyPicker value={editCompany ?? bill.company} onChange={setEditCompany} />
              </div>
              <BillForm
                type={bill.type}
                initial={bill.data}
                saving={busy}
                submitLabel="Save changes"
                onSubmit={saveEdit}
                footer={
                  <Button type="button" variant="ghost" full onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                }
              />
            </>
          ) : (
            <>
              <Card className="overflow-hidden">
                <BillDetails bill={bill} />
              </Card>
              {isPurchase && <MatchCard bill={bill} matches={matches} />}
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" variant="secondary" icon={<Pencil className="size-5" />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button size="lg" variant="danger" icon={<Trash className="size-5" />} onClick={remove} loading={busy}>
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncStatus({ bill, connected }: { bill: Bill; connected: boolean }) {
  if (!connected && bill.sheetStatus !== "synced") {
    return <p className="rounded-xl bg-line/60 px-4 py-2.5 text-sm text-ink-soft">Google Sheet is not connected yet — saved in the app only</p>;
  }
  if (bill.sheetStatus === "synced") {
    return (
      <p className="flex items-center justify-between gap-2 rounded-xl bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
        <span>✓ In the Google Sheet</span>
        {bill.photoUrl && (
          <a href={bill.photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
            Photo in Drive <ExternalLink className="size-3.5" />
          </a>
        )}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl bg-gold-soft px-4 py-2.5 text-sm font-medium text-gold">
      <CloudUpload className="size-4" />
      {bill.sheetStatus === "failed" ? "Will be sent to the Google Sheet when the connection is back" : "Sending to the Google Sheet…"}
    </p>
  );
}

// APMDC bill ↔ Transit Form for the same truck, quantity and day.
function MatchCard({ bill, matches }: { bill: Bill; matches: Bill[] }) {
  const other = bill.type === "apmdc_invoice" ? "Transit Form" : "APMDC Bill";
  if (matches.length === 0) {
    return (
      <Notice tone="warn" title={`No matching ${other} yet`}>
        Looking for {bill.vehicleNo || "the same truck"}, {formatQty(bill.qty)} on {formatDate(bill.date)}. If it is saved with a different
        vehicle number, check both bills.
      </Notice>
    );
  }
  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-2 font-semibold text-leaf">
        <Link2 className="size-5" /> Matching {other}
        {matches.length > 1 && (
          <span className="ml-1 inline-flex items-center gap-1 text-sm font-medium text-gold">
            <TriangleAlert className="size-4" /> {matches.length} possible
          </span>
        )}
      </p>
      <ul className="space-y-1">
        {matches.map((m) => (
          <li key={m.id}>
            <Link href={`/bills/${m.id}`} className="font-medium text-clay underline-offset-4 hover:underline">
              {m.docNo}
            </Link>{" "}
            <span className="text-sm text-ink-soft">
              · {formatDate(m.date)} · {formatQty(m.qty)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
