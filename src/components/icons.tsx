/**
 * Central icon registry. Everything that used to be an emoji now maps to a Lucide icon
 * so the UI stays minimal and consistent with Material You.
 */
import type { ComponentType } from "react";
import {
  Utensils, Camera, ShoppingBag, Leaf, Landmark, Moon, Baby, TrainFront, MapPin,
  Car, BedDouble, Ticket, CreditCard, Wallet,
  BookUser, IdCard, CarFront, StampIcon, Home, ShieldCheck, Syringe, ScrollText, FileText,
  Plane, Hotel, TramFront, BadgeCheck,
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  type LucideProps,
} from "lucide-react";
import type { PlaceTag, ExpenseCategory } from "@/features/trips/types";
import type { DocumentType } from "@/features/documents/types";
import type { LoyaltyKind } from "@/features/loyalty/types";

type Icon = ComponentType<LucideProps>;

export const PLACE_TAG_ICONS: Record<PlaceTag, Icon> = {
  food: Utensils,
  sightseeing: Camera,
  shopping: ShoppingBag,
  nature: Leaf,
  culture: Landmark,
  nightlife: Moon,
  kids: Baby,
  transport: TrainFront,
  other: MapPin,
};

export const EXPENSE_ICONS: Record<ExpenseCategory, Icon> = {
  food: Utensils,
  transport: Car,
  stay: BedDouble,
  tickets: Ticket,
  shopping: ShoppingBag,
  other: Wallet,
};

export const DOCUMENT_ICONS: Record<DocumentType, Icon> = {
  passport: BookUser,
  national_id: IdCard,
  driving_license: CarFront,
  visa: StampIcon,
  residence_permit: Home,
  travel_insurance: ShieldCheck,
  vaccination: Syringe,
  birth_certificate: ScrollText,
  other: FileText,
};

export const LOYALTY_ICONS: Record<LoyaltyKind, Icon> = {
  airline: Plane,
  hotel: Hotel,
  card: CreditCard,
  rail: TramFront,
  other: BadgeCheck,
};

export function weatherIcon(code: number): Icon {
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code <= 49) return CloudFog;
  if (code <= 59) return CloudDrizzle;
  if (code <= 69) return CloudRain;
  if (code <= 79) return CloudSnow;
  if (code <= 84) return CloudRain;
  if (code <= 94) return CloudSnow;
  return CloudLightning;
}

/** Small tonal square with an icon inside — replaces the old emoji tiles. */
export function IconTile({ icon: I, size = 40, className = "" }: { icon: Icon; size?: number; className?: string }) {
  return (
    <div style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong ${className}`}>
      <I size={Math.round(size * 0.45)} />
    </div>
  );
}
