import { useState } from "react";
import { Modal, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SingleFilePicker } from "@/components/attachments";
import { COUNTRIES } from "@/lib/utils";
import { put, newId } from "@/lib/repo";
import { useLock } from "@/features/lock/LockProvider";
import { useDecrypted } from "@/features/lock/SecretField";
import { useMembers } from "@/features/family/hooks";
import { DOCUMENT_TYPES, type IdDocument, type DocumentType } from "./types";

export function DocumentForm({ open, onClose, doc, memberId }: { open: boolean; onClose: () => void; doc?: IdDocument; memberId?: string }) {
  const { encrypt } = useLock();
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<IdDocument>>(doc ?? { memberId: memberId ?? "", type: "passport", issuingCountry: "" });
  const { plain: number, setPlain: setNumber, ready, unreadable, keepIfUnreadable } = useDecrypted(doc?.numberEnc);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof IdDocument, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.memberId && form.type && (number.trim() || unreadable);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const numberEnc = (await keepIfUnreadable(encrypt)) ?? "";
    await put("documents", { ...(form as IdDocument), id: form.id ?? newId(), numberEnc });
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc ? "Edit document" : "Add ID document"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || !ready} loading={saving}>Save securely</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Belongs to">
            <Select value={form.memberId ?? ""} onChange={(e) => set("memberId", e.target.value)}>
              <option value="">Select person</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="ID type">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as DocumentType)}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="ID number" hint="Encrypted with your PIN before it is stored.">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={!ready ? "Decrypting…" : unreadable ? "Encrypted with another device's PIN — leave blank to keep it" : "e.g. K1234567"} disabled={!ready} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="Label (optional)">
          <Input value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Schengen tourist visa" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issue date">
            <Input type="date" value={form.issueDate ?? ""} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field label="Expiry date">
            <Input type="date" value={form.expiryDate ?? ""} onChange={(e) => set("expiryDate", e.target.value)} />
          </Field>
        </div>
        <Field label="Issuing country">
          <Select value={form.issuingCountry ?? ""} onChange={(e) => set("issuingCountry", e.target.value)}>
            <option value="">Select country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Scanned copy">
          <SingleFilePicker id={form.attachmentId} onChange={(id) => set("attachmentId", id)} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Where the original is kept, renewal reminders…" />
        </Field>
      </div>
    </Modal>
  );
}
