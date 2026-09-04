export type LoyaltyKind = "airline" | "hotel" | "card" | "rail" | "other";

export const LOYALTY_KINDS: { value: LoyaltyKind; label: string; emoji: string }[] = [
  { value: "airline", label: "Airline", emoji: "✈️" },
  { value: "hotel", label: "Hotel", emoji: "🏨" },
  { value: "card", label: "Credit card", emoji: "💳" },
  { value: "rail", label: "Rail", emoji: "🚄" },
  { value: "other", label: "Other", emoji: "🎫" },
];

export interface LoyaltyCard {
  id: string;
  memberId?: string;
  kind: LoyaltyKind;
  program: string; // "KrisFlyer", "Marriott Bonvoy", "Amex Platinum"
  numberEnc: string; // encrypted membership / card number (store last 4 for cards!)
  tier?: string;
  preferredFor?: string; // "Use for hotel bookings — 5x points, no FX fee"
  expiry?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
