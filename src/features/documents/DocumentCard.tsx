import { useState } from "react";
import { DOCUMENT_ICONS, IconTile } from "@/components/icons";
import { Pencil, Trash2, FileText } from "lucide-react";
import { Card, Badge, Avatar } from "@/components/ui";
import { SecretField } from "@/features/lock/SecretField";
import { SyncBadge } from "@/components/sync";
import { useAttachmentUrl } from "@/components/attachments";
import { fmtDate, countryName } from "@/lib/utils";
import { remove, removeAttachment } from "@/lib/repo";
import type { FamilyMember } from "@/features/family/types";
import { DOCUMENT_TYPES, expiryStatus, type IdDocument } from "./types";
import { DocumentForm } from "./DocumentForm";

export function ExpiryBadge({ expiryDate }: { expiryDate?: string }) {
  const { status, days } = expiryStatus(expiryDate);
  if (status === "none") return null;
  if (status === "expired") return <Badge tone="danger">Expired {Math.abs(days!)}d ago</Badge>;
  if (status === "critical") return <Badge tone="danger">Expires in {days}d</Badge>;
  if (status === "soon") return <Badge tone="warn">Expires in {days}d</Badge>;
  return <Badge tone="ok">Valid</Badge>;
}

export function DocumentCard({ doc, member, showMember }: { doc: IdDocument; member?: FamilyMember; showMember?: boolean }) {
  const [edit, setEdit] = useState(false);
  const type = DOCUMENT_TYPES.find((t) => t.value === doc.type)!;
  const { url, attachment } = useAttachmentUrl(doc.attachmentId);
  const { status } = expiryStatus(doc.expiryDate);
  return (
    <Card className={`p-4 ${status === "expired" || status === "critical" ? "ring-1 ring-danger/40" : status === "soon" ? "ring-1 ring-warn/40" : ""}`}>
      <div className="flex items-start gap-3">
        <IconTile icon={DOCUMENT_ICONS[doc.type]} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{doc.label || type.label}</p>
            <ExpiryBadge expiryDate={doc.expiryDate} />
            <SyncBadge table="documents" id={doc.id} />
          </div>
          <p className="text-xs text-muted">
            {countryName(doc.issuingCountry)} · Expires {fmtDate(doc.expiryDate)}
          </p>
          <div className="mt-2">
            <SecretField value={doc.numberEnc} />
          </div>
          {doc.notes && <p className="mt-1.5 text-xs text-muted">{doc.notes}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {showMember && member && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2 text-xs font-medium">
                <Avatar name={member.name} size={18} /> {member.name}
              </span>
            )}
            {attachment && url && (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-accent hover:underline">
                <FileText size={12} /> {attachment.mime.startsWith("image/") ? "View scan" : "Open PDF"}
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button onClick={() => setEdit(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Edit"><Pencil size={15} /></button>
          <button
            onClick={async () => {
              if (confirm("Delete this document?")) {
                await removeAttachment(doc.attachmentId);
                await remove("documents", doc.id);
              }
            }}
            className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {edit && <DocumentForm open onClose={() => setEdit(false)} doc={doc} />}
    </Card>
  );
}
