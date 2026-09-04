import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, ShieldAlert, FolderLock } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, Input, Chip, EmptyState } from "@/components/ui";
import { useMemberMap } from "@/features/family/hooks";
import { countryName } from "@/lib/utils";
import { DOCUMENT_TYPES, expiryStatus, type DocumentType } from "./types";
import { DocumentCard } from "./DocumentCard";
import { DocumentForm } from "./DocumentForm";

export function VaultPage() {
  const docs = useLiveQuery(() => db.documents.toArray(), []) ?? [];
  const members = useMemberMap();
  const [q, setQ] = useState("");
  const [type, setType] = useState<DocumentType | "all">("all");
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [add, setAdd] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return docs
      .filter((d) => type === "all" || d.type === type)
      .filter((d) => !onlyExpiring || ["expired", "critical", "soon"].includes(expiryStatus(d.expiryDate).status))
      .filter((d) => {
        if (!s) return true;
        const m = members.get(d.memberId);
        const hay = [m?.name, d.label, DOCUMENT_TYPES.find((t) => t.value === d.type)?.label, countryName(d.issuingCountry), d.notes, d.expiryDate].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(s);
      })
      .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  }, [docs, q, type, onlyExpiring, members]);

  const expiringCount = docs.filter((d) => ["expired", "critical", "soon"].includes(expiryStatus(d.expiryDate).status)).length;

  return (
    <div>
      <PageHeader
        title="Document vault"
        subtitle={`${docs.length} document${docs.length === 1 ? "" : "s"} across ${members.size} ${members.size === 1 ? "person" : "people"}`}
        action={
          <Button onClick={() => setAdd(true)} disabled={members.size === 0}>
            <Plus size={16} /> Add ID
          </Button>
        }
      />
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, type, country, label…" className="pl-10" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={type === "all"} onClick={() => setType("all")}>All</Chip>
        {DOCUMENT_TYPES.map((t) => (
          <Chip key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
            {t.icon} {t.label}
          </Chip>
        ))}
        <Chip active={onlyExpiring} onClick={() => setOnlyExpiring((v) => !v)} className={onlyExpiring ? "!border-danger !bg-danger" : ""}>
          <ShieldAlert size={12} className="mr-1 inline" /> Expiring soon {expiringCount > 0 && `(${expiringCount})`}
        </Chip>
      </div>

      {members.size === 0 ? (
        <EmptyState icon={<FolderLock />} title="Add a family member first" hint="Documents are linked to people. Head to Family to add your first profile." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FolderLock />} title={docs.length ? "No documents match" : "Your vault is empty"} hint={docs.length ? "Try a different search or filter." : "Add passports, IDs, visas and licences. Numbers are encrypted on-device."} action={!docs.length && <Button onClick={() => setAdd(true)}><Plus size={16} /> Add first document</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((d) => (
            <DocumentCard key={d.id} doc={d} member={members.get(d.memberId)} showMember />
          ))}
        </div>
      )}
      {add && <DocumentForm open onClose={() => setAdd(false)} />}
    </div>
  );
}
