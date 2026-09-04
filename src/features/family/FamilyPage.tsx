import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Users, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, Card, Avatar, Badge, EmptyState } from "@/components/ui";
import { useAttachmentUrl } from "@/components/attachments";
import { expiryStatus } from "@/features/documents/types";
import { countryName, flag } from "@/lib/utils";
import { useMembers } from "./hooks";
import { MemberForm } from "./MemberForm";
import type { FamilyMember } from "./types";

function MemberCard({ m }: { m: FamilyMember }) {
  const docs = useLiveQuery(() => db.documents.where("memberId").equals(m.id).toArray(), [m.id]) ?? [];
  const { url } = useAttachmentUrl(m.photoId);
  const alerts = docs.filter((d) => ["expired", "critical"].includes(expiryStatus(d.expiryDate).status)).length;
  const soon = docs.filter((d) => expiryStatus(d.expiryDate).status === "soon").length;
  return (
    <Link to={`/family/${m.id}`}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-accent/50">
        <Avatar name={m.name} src={url} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{m.name}</p>
          <p className="text-xs text-muted">
            {[m.relation, m.nationality && `${flag(m.nationality)} ${countryName(m.nationality)}`].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{docs.length} document{docs.length === 1 ? "" : "s"}</Badge>
            {alerts > 0 && <Badge tone="danger">{alerts} need renewal</Badge>}
            {soon > 0 && <Badge tone="warn">{soon} expiring soon</Badge>}
          </div>
        </div>
        <ChevronRight className="text-muted" size={18} />
      </Card>
    </Link>
  );
}

export function FamilyPage() {
  const members = useMembers();
  const [add, setAdd] = useState(false);
  return (
    <div>
      <PageHeader title="Family" subtitle="Profiles and their document vaults" action={<Button onClick={() => setAdd(true)}><Plus size={16} /> Add member</Button>} />
      {members && members.length === 0 ? (
        <EmptyState icon={<Users />} title="No family members yet" hint="Add yourself and the people you travel with. Each profile gets its own encrypted ID vault." action={<Button onClick={() => setAdd(true)}><Plus size={16} /> Add first member</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{members?.map((m) => <MemberCard key={m.id} m={m} />)}</div>
      )}
      {add && <MemberForm open onClose={() => setAdd(false)} />}
    </div>
  );
}
