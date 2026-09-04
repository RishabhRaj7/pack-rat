import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Image as ImageIcon, Paperclip, Trash2, ExternalLink } from "lucide-react";
import { db, type Attachment } from "@/lib/db";
import { saveAttachment, removeAttachment } from "@/lib/repo";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

/** Object URL for an attachment blob (falls back to remote URL). */
export function useAttachmentUrl(id?: string | null) {
  const att = useLiveQuery<Attachment | undefined>(async () => (id ? db.attachments.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!att) return setUrl(null);
    if (att.blob) {
      const u = URL.createObjectURL(att.blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(att.remoteUrl ?? null);
  }, [att]);
  return { url, attachment: att };
}

export function AttachmentChip({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const { url, attachment } = useAttachmentUrl(id);
  if (!attachment) return null;
  const isImg = attachment.mime.startsWith("image/");
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-xs">
      {isImg && url ? <img src={url} className="h-8 w-8 rounded-md object-cover" alt="" /> : <FileText size={16} className="text-accent" />}
      <span className="max-w-[140px] truncate font-medium">{attachment.name}</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-muted hover:text-accent" title="Open">
          <ExternalLink size={14} />
        </a>
      )}
      {onRemove && (
        <button onClick={onRemove} className="text-muted hover:text-danger" title="Remove">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/** Multi-file attachment manager bound to an array of attachment ids. */
export function AttachmentList({ ids, onChange, label = "Attach ticket / confirmation", className }: { ids: string[]; onChange: (ids: string[]) => void; label?: string; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const f of Array.from(files)) added.push((await saveAttachment(f)).id);
    onChange([...ids, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <AttachmentChip
            key={id}
            id={id}
            onRemove={async () => {
              await removeAttachment(id);
              onChange(ids.filter((x) => x !== id));
            }}
          />
        ))}
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
        <Paperclip size={14} /> {label}
      </Button>
    </div>
  );
}

/** Single file picker (e.g. profile photo or a scanned ID). */
export function SingleFilePicker({ id, onChange, accept = "image/*,application/pdf", label = "Upload scan (image or PDF)", preview = true }: { id?: string; onChange: (id?: string) => void; accept?: string; label?: string; preview?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { url, attachment } = useAttachmentUrl(id);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {preview && attachment && (attachment.mime.startsWith("image/") && url ? <img src={url} className="h-14 w-14 rounded-xl object-cover" alt="" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-accent"><FileText /></div>)}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            await removeAttachment(id);
            const a = await saveAttachment(f);
            onChange(a.id);
            setBusy(false);
          }}
        />
        <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <ImageIcon size={14} /> {attachment ? "Replace" : label}
        </Button>
        {attachment && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              await removeAttachment(id);
              onChange(undefined);
            }}
          >
            <Trash2 size={14} /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
