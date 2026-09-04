export type DocumentType =
  | "passport"
  | "national_id"
  | "driving_license"
  | "visa"
  | "residence_permit"
  | "travel_insurance"
  | "vaccination"
  | "birth_certificate"
  | "other";

export const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: string }[] = [
  { value: "passport", label: "Passport", icon: "🛂" },
  { value: "national_id", label: "National ID", icon: "🪪" },
  { value: "driving_license", label: "Driving license", icon: "🚗" },
  { value: "visa", label: "Visa", icon: "🧾" },
  { value: "residence_permit", label: "Residence permit", icon: "🏠" },
  { value: "travel_insurance", label: "Travel insurance", icon: "🛡️" },
  { value: "vaccination", label: "Vaccination record", icon: "💉" },
  { value: "birth_certificate", label: "Birth certificate", icon: "📜" },
  { value: "other", label: "Other", icon: "📄" },
];

export interface IdDocument {
  id: string;
  memberId: string;
  type: DocumentType;
  label?: string; // optional custom label e.g. "Schengen visa"
  numberEnc: string; // AES-GCM encrypted ID number
  issueDate?: string;
  expiryDate?: string;
  issuingCountry: string; // country code
  attachmentId?: string; // scanned image / PDF
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type ExpiryStatus = "expired" | "critical" | "soon" | "ok" | "none";

/** Passports commonly need 6 months validity; treat <90 days as critical, <180 as soon. */
export function expiryStatus(expiryDate?: string, today = new Date()): { status: ExpiryStatus; days: number | null } {
  if (!expiryDate) return { status: "none", days: null };
  const exp = new Date(expiryDate + "T00:00:00");
  const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { status: "expired", days };
  if (days <= 90) return { status: "critical", days };
  if (days <= 180) return { status: "soon", days };
  return { status: "ok", days };
}
