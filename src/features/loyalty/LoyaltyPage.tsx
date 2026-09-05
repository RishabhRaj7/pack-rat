import { useState } from "react";
import { LOYALTY_ICONS, IconTile } from "@/components/icons";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Trash2, CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { Modal, Button, Field, Input, Select, Textarea, Card, Badge, PageHeader, EmptyState, Chip, Avatar } from "@/components/ui";
import { SecretField, useDecrypted } from "@/features/lock/SecretField";
import { SyncBadge } from "@/components/sync";
import { useLock } from "@/features/lock/LockProvider";
import { useMembers, useMemberMap } from "@/features/family/hooks";
import { put, newId, remove } from "@/lib/repo";
import { LOYALTY_KINDS, type LoyaltyCard, type LoyaltyKind } from "./types";

export function LoyaltyForm({ open, onClose, card, memberId }: { open: boolean; onClose: () => void; card?: LoyaltyCard; memberId?: string }) {
  const { encrypt } = useLock();
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<LoyaltyCard>>(card ?? { kind: "airline", program: "", memberId });
  const { plain, setPlain, ready, unreadable, keepIfUnreadable } = useDecrypted(card?.numberEnc);
  const set = (k: keyof LoyaltyCard, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.program?.trim() && (plain.trim() || unreadable);
  const save = async () => {
    if (!valid) return;
    await put("loyalty", { ...(form as LoyaltyCard), id: form.id ?? newId(), numberEnc: (await keepIfUnreadable(encrypt)) ?? "" });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={card ? "Edit loyalty / card" : "Add loyalty program or card"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid || !ready}>Save securely</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => set("kind", e.target.value as LoyaltyKind)}>
              {LOYALTY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={form.memberId ?? ""} onChange={(e) => set("memberId", e.target.value || undefined)}>
              <option value="">Shared / household</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Program / card name"><Input value={form.program ?? ""} onChange={(e) => set("program", e.target.value)} placeholder="KrisFlyer, Marriott Bonvoy, Amex Platinum…" /></Field>
        <Field label={form.kind === "card" ? "Card (store last 4 digits only)" : "Membership number"} hint="Encrypted before storage.">
          <Input value={plain} onChange={(e) => setPlain(e.target.value)} className="font-mono" placeholder={unreadable ? "Encrypted with another device's PIN — leave blank to keep it" : form.kind === "card" ? "•••• 4242" : "1234 5678 90"} disabled={!ready} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tier / status"><Input value={form.tier ?? ""} onChange={(e) => set("tier", e.target.value)} placeholder="Gold, Platinum…" /></Field>
          <Field label="Expiry"><Input type="month" value={form.expiry ?? ""} onChange={(e) => set("expiry", e.target.value)} /></Field>
        </div>
        <Field label="Use this for…" hint="e.g. 'Hotel bookings — no FX fee, 5x points' so you always pick the right card."><Textarea value={form.preferredFor ?? ""} onChange={(e) => set("preferredFor", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function LoyaltyCardRow({ card, showOwner }: { card: LoyaltyCard; showOwner?: boolean }) {
  const [edit, setEdit] = useState(false);
  const members = useMemberMap();
  const owner = card.memberId ? members.get(card.memberId) : undefined;
  return (
    <Card className="flex items-start gap-3 p-4">
      <IconTile icon={LOYALTY_ICONS[card.kind]} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{card.program}</p>
          {card.tier && <Badge tone="accent">{card.tier}</Badge>}
          {card.expiry && <Badge>Exp {card.expiry}</Badge>}
          <SyncBadge table="loyalty" id={card.id} />
        </div>
        <div className="mt-1"><SecretField value={card.numberEnc} /></div>
        {card.preferredFor && <p className="mt-1.5 text-xs text-muted">{card.preferredFor}</p>}
        {showOwner && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted">{owner ? <><Avatar name={owner.name} size={16} /> {owner.name}</> : "Shared"}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => setEdit(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={15} /></button>
        <button onClick={() => confirm("Delete?") && remove("loyalty", card.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
      </div>
      {edit && <LoyaltyForm open onClose={() => setEdit(false)} card={card} />}
    </Card>
  );
}

export function LoyaltyPage() {
  const cards = useLiveQuery(() => db.loyalty.toArray(), []) ?? [];
  const [kind, setKind] = useState<LoyaltyKind | "all">("all");
  const [add, setAdd] = useState(false);
  const list = cards.filter((c) => kind === "all" || c.kind === kind).sort((a, b) => a.program.localeCompare(b.program));
  return (
    <div>
      <PageHeader title="Loyalty & cards" subtitle="Frequent flyer numbers, hotel status, and which card to book with" action={<Button onClick={() => setAdd(true)}><Plus size={16} /> Add</Button>} />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>All</Chip>
        {LOYALTY_KINDS.map((k) => <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</Chip>)}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<CreditCard />} title="Nothing here yet" hint="Store airline & hotel loyalty numbers and note which credit card to use for each kind of booking." action={<Button onClick={() => setAdd(true)}><Plus size={16} /> Add first program</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{list.map((c) => <LoyaltyCardRow key={c.id} card={c} showOwner />)}</div>
      )}
      {add && <LoyaltyForm open onClose={() => setAdd(false)} />}
    </div>
  );
}
