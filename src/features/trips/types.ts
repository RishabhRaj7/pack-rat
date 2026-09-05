export type PlaceTag = "food" | "sightseeing" | "shopping" | "nature" | "culture" | "nightlife" | "kids" | "transport" | "other";

export const PLACE_TAGS: { value: PlaceTag; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "sightseeing", label: "Sightseeing" },
  { value: "shopping", label: "Shopping" },
  { value: "nature", label: "Nature" },
  { value: "culture", label: "Culture" },
  { value: "nightlife", label: "Nightlife" },
  { value: "kids", label: "Kids" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

export type ReqState = "missing" | "pending" | "done";
export type ReadyStatus = "action" | "progress" | "ready";

export interface Requirement {
  id: string;
  label: string; // "Ticket booked", "Reservation", "Prerequisite: ..."
  state: ReqState;
}

export interface Place {
  id: string;
  tripId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  tags: PlaceTag[];
  requirements: Requirement[];
  attachmentIds: string[];
  url?: string;
  estimatedCost?: number;
  durationMins?: number;
  createdAt: number;
  updatedAt: number;
}

/** Red if anything is missing, amber if anything is pending, teal/mint when all confirmed. */
export function placeStatus(p: Pick<Place, "requirements">): ReadyStatus {
  if (p.requirements.some((r) => r.state === "missing")) return "action";
  if (p.requirements.some((r) => r.state === "pending")) return "progress";
  return "ready";
}

export interface Hotel {
  id: string;
  tripId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  confirmation?: string;
  phone?: string;
  roomType?: string;
  status: ReqState; // missing = not booked, pending = awaiting confirmation, done = confirmed
  notes?: string;
  attachmentIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** Journeys (flights / trains) can live inside a trip or stand alone. Standalone = tripId "" (kept as a string so the Dexie index still works). */
export const NO_TRIP = "";

export interface Flight {
  id: string;
  tripId: string; // NO_TRIP for ad-hoc flights
  airline: string;
  airlineCode?: string; // IATA prefix, e.g. SQ — drives the logo
  flightNumber: string; // e.g. SQ423
  from: string; // IATA
  to: string;
  fromName?: string; // airport / city label resolved from the flight number
  toName?: string;
  departAt: string; // ISO local datetime "2025-11-03T09:40"
  arriveAt: string;
  terminal?: string;
  gate?: string;
  seats?: string;
  confirmation?: string;
  passengerIds: string[];
  status: ReqState;
  attachmentIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Train {
  id: string;
  tripId: string; // NO_TRIP for ad-hoc journeys
  operator?: string; // e.g. Indian Railways, Deutsche Bahn, JR East
  trainNumber: string; // e.g. 12951, ICE 599, Nozomi 23
  trainName?: string; // e.g. Mumbai Rajdhani
  from: string; // station name / code
  to: string;
  departAt: string; // ISO local datetime
  arriveAt?: string;
  coach?: string;
  seats?: string;
  travelClass?: string; // 3A / 2nd / Green car…
  pnr?: string;
  platform?: string;
  passengerIds: string[];
  status: ReqState;
  attachmentIds: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DayPrepNotes {
  buy?: string;
  avoid?: string;
  general?: string;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  date: string; // YYYY-MM-DD
  title?: string;
  placeIds: string[]; // ordered
  prep?: DayPrepNotes;
  createdAt: number;
  updatedAt: number;
}

export type ExpenseCategory = "food" | "transport" | "stay" | "tickets" | "shopping" | "other";
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "transport", label: "Transport" },
  { value: "stay", label: "Stay" },
  { value: "tickets", label: "Tickets" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
];

export interface Expense {
  id: string;
  tripId: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  paidById?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmergencyInfo {
  police?: string;
  ambulance?: string;
  fire?: string;
  general?: string;
  embassyName?: string;
  embassyAddress?: string;
  embassyPhone?: string;
  embassyUrl?: string;
  insuranceProvider?: string;
  insurancePolicyEnc?: string; // encrypted
  insurancePhone?: string;
  notes?: string;
}

/**
 * One reusable Trip model: every destination is data, not code.
 * Adding a new country = creating a new Trip record.
 */
export interface Trip {
  id: string;
  title: string;
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lng: number;
  timezone?: string;
  startDate: string;
  endDate: string;
  currency: string; // local currency code
  coverEmoji: string;
  coverImageId?: string;
  travellerIds: string[];
  emergency: EmergencyInfo;
  notes?: string;
  archived?: boolean;
  publishedId?: string;
  createdAt: number;
  updatedAt: number;
}

export type TripStatus = "upcoming" | "ongoing" | "completed";

export function tripStatus(t: Pick<Trip, "startDate" | "endDate" | "archived">, today = new Date()): TripStatus {
  const d = today.toISOString().slice(0, 10);
  if (t.archived || d > t.endDate) return "completed";
  if (d >= t.startDate) return "ongoing";
  return "upcoming";
}
