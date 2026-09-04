import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, MonitorSmartphone, Fingerprint, KeyRound, Lock, Download, Upload, Trash2, Cloud, CloudOff, Users, Plus, Pencil, ChevronRight, Sparkles, Smartphone } from "lucide-react";
import { Card, Button, Segmented, Toggle, Select, Avatar, Modal, Input, Field, Badge } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { useLock } from "@/features/lock/LockProvider";
import { useMembers } from "@/features/family/hooks";
import { MemberForm } from "@/features/family/MemberForm";
import { useSyncStatus, flushQueue } from "@/lib/sync";
import { describeSync, timeAgo, SyncPanel } from "@/components/sync";
import { isFirebaseConfigured, signInWithGoogle, signOut } from "@/lib/firebase";
import { seedSingapore } from "@/data/seed";
import { exportBackup, importBackup, wipeAllData } from "./backup";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3"><span className="text-accent">{icon}</span><h2 className="font-bold">{title}</h2></div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="text-sm font-semibold">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div><div className="shrink-0">{children}</div></div>
  );
}

export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const lock = useLock();
  const members = useMembers() ?? [];
  const sync = useSyncStatus();
  const [addMember, setAddMember] = useState(false);
  const [editMember, setEditMember] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncPanel, setSyncPanel] = useState(false);
  const syncInfo = describeSync(sync);
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      {msg && <div className="rounded-xl bg-ok-soft px-4 py-2 text-sm font-semibold text-ok">{msg}</div>}

      <Section title="Appearance" icon={<Sun size={18} />}>
        <Row label="Theme" hint="Dark mode uses true black for AMOLED screens.">
          <Segmented value={mode} onChange={setMode} options={[{ value: "light", label: <span className="flex items-center gap-1"><Sun size={13} /> Light</span> }, { value: "dark", label: <span className="flex items-center gap-1"><Moon size={13} /> Dark · AMOLED</span> }, { value: "system", label: <span className="flex items-center gap-1"><MonitorSmartphone size={13} /> Auto</span> }]} />
        </Row>
        {installEvt && <Row label="Install app" hint="Add Pack Rat to your home screen for offline access."><Button size="sm" variant="secondary" onClick={() => installEvt.prompt()}><Smartphone size={14} /> Install</Button></Row>}
      </Section>

      <Section title="Family members" icon={<Users size={18} />}>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} size={32} /><Link to={`/family/${m.id}`} className="flex-1 text-sm font-semibold hover:text-accent">{m.name} <span className="font-normal text-muted">{m.relation}</span></Link>
            <button onClick={() => setEditMember(m.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><Pencil size={14} /></button>
            <Link to={`/family/${m.id}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><ChevronRight size={14} /></Link>
          </div>
        ))}
        <Row label={members.length ? "Add another" : "No family members yet"}><Button size="sm" onClick={() => setAddMember(true)}><Plus size={14} /> Add</Button></Row>
      </Section>

      <Section title="App lock & encryption" icon={<Lock size={18} />}>
        <Row label="Biometric unlock" hint={lock.biometricAvailable ? "Face ID / Touch ID / Windows Hello via WebAuthn" : "Not available on this device/browser (needs HTTPS + platform authenticator)"}>
          <Toggle checked={!!lock.config?.biometric} onChange={async (v) => { try { if (v) await lock.enableBio(); else await lock.disableBio(); flash(v ? "Biometric unlock enabled" : "Biometric unlock disabled"); } catch (e) { flash((e as Error).message); } }} label="Biometric" />
        </Row>
        <Row label="Auto-lock" hint="Lock after the app has been in the background for…">
          <Select value={String(lock.config?.autoLockMinutes ?? 5)} onChange={(e) => lock.setAutoLockMinutes(Number(e.target.value))} className="w-36 py-1.5">
            <option value="0">Immediately</option><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="60">1 hour</option><option value="10080">7 days</option><option value="43200">30 days</option>
          </Select>
        </Row>
        <Row label="Change PIN" hint="Re-encrypts all sensitive fields with the new PIN."><Button size="sm" variant="outline" onClick={() => setPinModal(true)}><KeyRound size={14} /> Change</Button></Row>
        <Row label="Lock now"><Button size="sm" variant="secondary" onClick={lock.lock}><Fingerprint size={14} /> Lock</Button></Row>
      </Section>

      <Section title="Cloud sync" icon={sync.configured ? <Cloud size={18} /> : <CloudOff size={18} />}>
        {!isFirebaseConfigured ? (
          <Row label="Local-only mode" hint="Add VITE_FIREBASE_* keys to .env.local to enable Firestore + Storage sync across devices. All data currently lives in this browser's IndexedDB."><Badge>Offline-first</Badge></Row>
        ) : sync.user ? (
          <>
            <Row label={sync.user.name ?? sync.user.email ?? "Signed in"} hint={sync.user.email ?? undefined}>
              <Button size="sm" variant="outline" onClick={signOut}>Sign out</Button>
            </Row>
            <Row label={syncInfo.label} hint={syncInfo.detail ?? undefined}>
              <div className="flex gap-2">
                {sync.pending > 0 && sync.online && !sync.syncing && <Button size="sm" variant="secondary" onClick={() => void flushQueue()}>Sync now</Button>}
                <Button size="sm" variant="outline" onClick={() => setSyncPanel(true)}>Details</Button>
              </div>
            </Row>
            <Row label="Vault key" hint={sync.vaultKey.status === "shared" ? "Derived from your PIN alone — enter the same PIN on every device and all ID / card / policy numbers decrypt. Nothing to merge." : sync.vaultKey.status === "legacy" ? "Upgrading the cloud record to the shared same-PIN key…" : sync.vaultKey.status === "none" ? "No PIN check in the cloud yet — this device will publish one (never the PIN itself)." : "Checking…"}>
              <Badge tone={sync.vaultKey.status === "shared" ? "ok" : "neutral"}>{sync.vaultKey.status === "shared" ? "Same PIN everywhere" : sync.vaultKey.status === "none" ? "Publishing" : sync.vaultKey.status === "legacy" ? "Upgrading" : "—"}</Badge>
            </Row>
            {sync.pending > 0 && <Row label={`${sync.pending} change${sync.pending === 1 ? "" : "s"} not synced yet`} hint={sync.queue.slice(0, 3).map((q) => q.label ?? q.table).join(" · ") + (sync.pending > 3 ? " · …" : "")}><Badge tone="warn">Pending</Badge></Row>}
            {sync.lastSyncedAt && <Row label="Last synced" hint={new Date(sync.lastSyncedAt).toLocaleString()}><Badge tone="ok">{timeAgo(sync.lastSyncedAt)}</Badge></Row>}
          </>
        ) : (
          <>
            <Row label="Sign in to sync" hint="Google sign-in via Firebase Auth."><Button size="sm" onClick={signInWithGoogle}>Sign in</Button></Row>
            {sync.pending > 0 && <Row label={`${sync.pending} change${sync.pending === 1 ? "" : "s"} only on this device`} hint="They upload automatically once you sign in."><Button size="sm" variant="outline" onClick={() => setSyncPanel(true)}>View</Button></Row>}
          </>
        )}
        <Row label="Connection"><Badge tone={sync.online ? "ok" : "warn"}>{sync.online ? "Online" : "Offline — changes queued"}</Badge></Row>
      </Section>

      <Section title="Backup & data" icon={<Download size={18} />}>
        <Row label="Export backup" hint="JSON file. Encrypted fields stay encrypted (same PIN needed to read them).">
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => exportBackup(false)}>Data only</Button><Button size="sm" onClick={() => exportBackup(true)}><Download size={14} /> With files</Button></div>
        </Row>
        <Row label="Import backup" hint="Merge into current data, or replace everything.">
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const replace = confirm("Replace ALL existing data with this backup?\n\nOK = replace, Cancel = merge"); setBusy(true); try { await importBackup(f, replace ? "replace" : "merge"); flash("Backup imported"); if (replace) await lock.refresh(); } catch (err) { alert((err as Error).message); } setBusy(false); e.target.value = ""; }} />
          <Button size="sm" variant="outline" loading={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</Button>
        </Row>
        <Row label="Load sample trip" hint="Re-creates the Singapore example trip to see the pattern."><Button size="sm" variant="secondary" onClick={async () => { await seedSingapore(true); flash("Singapore trip added"); }}><Sparkles size={14} /> Add Singapore</Button></Row>
        <Row label="Erase everything" hint="Deletes all local data, PIN and settings on this device."><Button size="sm" variant="danger" onClick={() => confirm("Erase ALL data on this device? This cannot be undone.") && wipeAllData()}><Trash2 size={14} /> Erase</Button></Row>
      </Section>

      <p className="pb-4 text-center text-xs text-muted">Pack Rat · offline-first PWA · data encrypted on-device</p>

      {addMember && <MemberForm open onClose={() => setAddMember(false)} />}
      <SyncPanel open={syncPanel} onClose={() => setSyncPanel(false)} />
      {editMember && <MemberForm open onClose={() => setEditMember(null)} member={members.find((m) => m.id === editMember)} />}
      <Modal open={pinModal} onClose={() => setPinModal(false)} title="Change PIN" size="sm" footer={<><Button variant="ghost" onClick={() => setPinModal(false)}>Cancel</Button><Button disabled={pin.length !== 6 || pin !== pin2} loading={busy} onClick={async () => { setBusy(true); try { await lock.changePin(pin); setPinModal(false); setPin(""); setPin2(""); flash("PIN changed and data re-encrypted"); } catch (e) { alert((e as Error).message); } setBusy(false); }}>Update PIN</Button></>}>
        <div className="space-y-3">
          <Field label="New 6-digit PIN"><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Confirm PIN"><Input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></Field>
          {pin && pin2 && pin !== pin2 && <p className="text-xs text-danger">PINs don't match</p>}
          <p className="text-xs text-muted">Biometric unlock will need to be re-enabled after changing your PIN.</p>
        </div>
      </Modal>
    </div>
  );
}
