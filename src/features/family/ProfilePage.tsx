import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Pencil, Plus, Trash2, FolderLock, CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { Avatar, Button, Card, EmptyState, PageHeader, Badge } from "@/components/ui";
import { useAttachmentUrl } from "@/components/attachments";
import { DocumentCard } from "@/features/documents/DocumentCard";
import { DocumentForm } from "@/features/documents/DocumentForm";
import { LoyaltyCardRow, LoyaltyForm } from "@/features/loyalty/LoyaltyPage";
import { deleteMemberCascade } from "@/lib/repo";
import { countryName, flag, fmtDate } from "@/lib/utils";
import { useMember } from "./hooks";
import { MemberForm } from "./MemberForm";

export function ProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const member = useMember(id);
  const docs = useLiveQuery(() => (id ? db.documents.where("memberId").equals(id).toArray() : []), [id]) ?? [];
  const loyalty = useLiveQuery(() => (id ? db.loyalty.where("memberId").equals(id).toArray() : []), [id]) ?? [];
  const trips = useLiveQuery(() => db.trips.filter((t) => !!id && t.travellerIds.includes(id)).toArray(), [id]) ?? [];
  const { url } = useAttachmentUrl(member?.photoId);
  const [edit, setEdit] = useState(false);
  const [addDoc, setAddDoc] = useState(false);
  const [addLoyalty, setAddLoyalty] = useState(false);

  if (!member) return <div className="py-20 text-center text-muted">{member === undefined ? "Loading…" : "Not found"}</div>;

  return (
    <div>
      <PageHeader
        back={
          <Link to="/family" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg">
            <ArrowLeft size={14} /> Family
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={member.name} src={url} size={56} /> {member.name}
          </span>
        }
        subtitle={[member.relation, member.nationality && `${flag(member.nationality)} ${countryName(member.nationality)}`, member.dateOfBirth && `Born ${fmtDate(member.dateOfBirth)}`].filter(Boolean).join(" · ")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setEdit(true)} title="Edit"><Pencil size={16} /></Button>
            <Button
              variant="danger"
              size="icon"
              title="Delete"
              onClick={async () => {
                if (confirm(`Delete ${member.name} and all their documents?`)) {
                  await deleteMemberCascade(member.id);
                  nav("/family");
                }
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        }
      />
      {member.notes && <Card className="mb-5 p-4 text-sm text-muted">{member.notes}</Card>}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Documents</h2>
          <Button size="sm" onClick={() => setAddDoc(true)}><Plus size={14} /> Add ID</Button>
        </div>
        {docs.length === 0 ? (
          <EmptyState icon={<FolderLock />} title="No documents yet" hint="Add a passport, national ID, visa or licence." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{docs.map((d) => <DocumentCard key={d.id} doc={d} member={member} />)}</div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Loyalty & cards</h2>
          <Button size="sm" variant="secondary" onClick={() => setAddLoyalty(true)}><Plus size={14} /> Add</Button>
        </div>
        {loyalty.length === 0 ? (
          <EmptyState icon={<CreditCard />} title="No loyalty programs" hint="Frequent flyer, hotel status and preferred travel cards." />
        ) : (
          <div className="space-y-2">{loyalty.map((l) => <LoyaltyCardRow key={l.id} card={l} />)}</div>
        )}
      </section>

      {trips.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Trips</h2>
          <div className="flex flex-wrap gap-2">
            {trips.map((t) => (
              <Link key={t.id} to={`/trips/${t.id}`}>
                <Badge tone="accent" className="px-3 py-1 text-xs">{t.coverEmoji} {t.title}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {edit && <MemberForm open onClose={() => setEdit(false)} member={member} />}
      {addDoc && <DocumentForm open onClose={() => setAddDoc(false)} memberId={member.id} />}
      {addLoyalty && <LoyaltyForm open onClose={() => setAddLoyalty(false)} memberId={member.id} />}
    </div>
  );
}
