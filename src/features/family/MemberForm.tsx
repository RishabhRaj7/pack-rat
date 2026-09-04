import { useState } from "react";
import { Modal, Button, Field, Input, Select, Textarea, Avatar } from "@/components/ui";
import { SingleFilePicker, useAttachmentUrl } from "@/components/attachments";
import { COUNTRIES } from "@/lib/utils";
import { put, newId } from "@/lib/repo";
import type { FamilyMember } from "./types";

export function MemberForm({ open, onClose, member }: { open: boolean; onClose: () => void; member?: FamilyMember }) {
  const [form, setForm] = useState<Partial<FamilyMember>>(member ?? { name: "", relation: "" });
  const { url } = useAttachmentUrl(form.photoId);
  const set = (k: keyof FamilyMember, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name?.trim()) return;
    await put("members", { ...(form as FamilyMember), id: form.id ?? newId(), name: form.name.trim() });
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? "Edit family member" : "Add family member"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.name?.trim()}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={form.name || "?"} src={url} size={64} />
          <SingleFilePicker id={form.photoId} onChange={(id) => set("photoId", id)} accept="image/*" label="Upload photo" preview={false} />
        </div>
        <Field label="Full name">
          <Input autoFocus value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="As printed on passport" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relation">
            <Input value={form.relation ?? ""} onChange={(e) => set("relation", e.target.value)} placeholder="Me, Spouse, Son…" />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </Field>
        </div>
        <Field label="Nationality">
          <Select value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)}>
            <option value="">Select country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Allergies, dietary needs, seat preference…" />
        </Field>
      </div>
    </Modal>
  );
}
