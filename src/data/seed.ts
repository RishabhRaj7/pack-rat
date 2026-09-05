/**
 * Sample data: the Singapore trip. This is the reference example of the reusable Trip model —
 * every future destination is created the same way (through the UI or by adding data like this).
 */
import { db, getSetting, setSetting } from "@/lib/db";
import { put, newId } from "@/lib/repo";
import { dateRange } from "@/lib/utils";
import type { Trip, Place, Hotel, Flight, Expense, Requirement } from "@/features/trips/types";

const r = (label: string, state: Requirement["state"]): Requirement => ({ id: newId(), label, state });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedSingapore(force = false) {
  if (!force && (await getSetting("seeded:singapore", false))) return;
  if (!force && (await db.trips.count()) > 0) return;

  const start = new Date();
  start.setDate(start.getDate() + 21);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const S = iso(start);
  const E = iso(end);
  const dates = dateRange(S, E);
  const tripId = newId();

  const trip: Trip = {
    id: tripId,
    title: "Singapore family getaway",
    country: "Singapore",
    countryCode: "SG",
    city: "Singapore",
    lat: 1.3521,
    lng: 103.8198,
    timezone: "Asia/Singapore",
    startDate: S,
    endDate: E,
    currency: "SGD",
    coverEmoji: "",
    travellerIds: [],
    notes: "Visa-free for most passports (check ICA). Fill in the SG Arrival Card online within 3 days of arrival. EZ-Link / contactless cards work on MRT & buses. Tap water is safe. Chewing gum is banned.",
    emergency: {
      police: "999",
      ambulance: "995",
      fire: "995",
      general: "999",
      embassyName: "Your embassy / high commission in Singapore",
      embassyAddress: "Add the address — most are around Tanglin / Napier Road",
      insuranceProvider: "",
      notes: "Nearest 24h hospital to Marina Bay: Raffles Hospital (585 North Bridge Rd). Pharmacies: Guardian / Watsons in most malls.",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const places: Omit<Place, "createdAt" | "updatedAt">[] = [
    { id: newId(), tripId, name: "Gardens by the Bay", address: "18 Marina Gardens Dr, Singapore 018953", lat: 1.2816, lng: 103.8636, tags: ["sightseeing", "nature"], requirements: [r("Cloud Forest + Flower Dome tickets booked", "pending")], attachmentIds: [], estimatedCost: 53, notes: "Supertree Grove light show (Garden Rhapsody) at 7:45pm & 8:45pm is free. Go to the domes first while it's hot outside.", url: "https://www.gardensbythebay.com.sg" },
    { id: newId(), tripId, name: "Marina Bay Sands SkyPark", address: "10 Bayfront Ave, Singapore 018956", lat: 1.2834, lng: 103.8607, tags: ["sightseeing"], requirements: [r("Observation deck tickets", "missing")], attachmentIds: [], estimatedCost: 32, notes: "Sunset slot sells out — book 2 days ahead. CÉ LA VI rooftop is an alternative with a drink minimum." },
    { id: newId(), tripId, name: "Maxwell Food Centre", address: "1 Kadayanallur St, Singapore 069184", lat: 1.2803, lng: 103.8448, tags: ["food"], requirements: [], attachmentIds: [], estimatedCost: 15, notes: "Tian Tian Hainanese Chicken Rice (stall 10) — go before 12pm to skip the queue. Cash preferred at hawker stalls." },
    { id: newId(), tripId, name: "Universal Studios Singapore", address: "8 Sentosa Gateway, Singapore 098269", lat: 1.254, lng: 103.8238, tags: ["kids", "sightseeing"], requirements: [r("Park tickets booked", "done"), r("Express pass decided", "pending")], attachmentIds: [], estimatedCost: 83, notes: "Arrive 30 min before opening. Do Transformers and Battlestar first. Sentosa Express from VivoCity level 3.", url: "https://www.rwsentosa.com/en/attractions/universal-studios-singapore" },
    { id: newId(), tripId, name: "Night Safari", address: "80 Mandai Lake Rd, Singapore 729826", lat: 1.4022, lng: 103.7881, tags: ["nature", "kids"], requirements: [r("Tram tickets booked", "done")], attachmentIds: [], estimatedCost: 55, notes: "Tram ride first, then walking trails. Book Mandai Khatib shuttle. Bring insect repellent.", url: "https://www.mandai.com/en/night-safari.html" },
    { id: newId(), tripId, name: "Jewel Changi — Rain Vortex", address: "78 Airport Blvd, Singapore 819666", lat: 1.3602, lng: 103.9894, tags: ["sightseeing", "shopping"], requirements: [], attachmentIds: [], estimatedCost: 0, notes: "Free to view. Light & sound show hourly from 8pm. Great to do on departure day — arrive 4h early." },
    { id: newId(), tripId, name: "Chinatown & Buddha Tooth Relic Temple", address: "288 South Bridge Rd, Singapore 058840", lat: 1.2815, lng: 103.8443, tags: ["culture", "shopping"], requirements: [r("Prerequisite: covered shoulders & knees", "done")], attachmentIds: [], estimatedCost: 0, notes: "Free entry. Rooftop orchid garden. Pagoda Street for souvenirs — bargain politely." },
    { id: newId(), tripId, name: "Orchard Road", address: "Orchard Rd, Singapore", lat: 1.3048, lng: 103.8318, tags: ["shopping"], requirements: [], attachmentIds: [], estimatedCost: 0, notes: "ION Orchard, Takashimaya. Claim GST refund (eTRS) at the airport — keep receipts over S$100 per shop." },
    { id: newId(), tripId, name: "Lau Pa Sat — Satay Street", address: "18 Raffles Quay, Singapore 048582", lat: 1.2807, lng: 103.8504, tags: ["food", "nightlife"], requirements: [], attachmentIds: [], estimatedCost: 25, notes: "Boon Tat St closes to traffic at 7pm for satay stalls. Stall 7 & 8 are popular. Order by the dozen." },
    { id: newId(), tripId, name: "Singapore Botanic Gardens", address: "1 Cluny Rd, Singapore 259569", lat: 1.3138, lng: 103.8159, tags: ["nature"], requirements: [r("Orchid Garden tickets", "missing")], attachmentIds: [], estimatedCost: 15, notes: "UNESCO site, free entry (Orchid Garden S$15). Go early morning before the heat." },
  ];

  const hotel: Omit<Hotel, "createdAt" | "updatedAt"> = { id: newId(), tripId, name: "Pan Pacific Singapore", address: "7 Raffles Blvd, Marina Square, Singapore 039595", lat: 1.2914, lng: 103.8586, checkIn: S, checkOut: E, checkInTime: "15:00", checkOutTime: "12:00", confirmation: "PPS-48213977", phone: "+65 6336 8111", roomType: "Deluxe Harbour View, 2 twin beds", status: "done", notes: "Breakfast included at Edge. Requested connecting rooms — confirm at check-in. Promenade MRT (CC4) is 3 min walk.", attachmentIds: [] };

  const flights: Omit<Flight, "createdAt" | "updatedAt">[] = [
    { id: newId(), tripId, airline: "Singapore Airlines", flightNumber: "SQ423", from: "BOM", to: "SIN", departAt: `${S}T23:45`, arriveAt: `${dates[1]}T07:50`, terminal: "2", seats: "42A, 42B, 42C", confirmation: "7GHK2Q", passengerIds: [], status: "done", attachmentIds: [] },
    { id: newId(), tripId, airline: "Singapore Airlines", flightNumber: "SQ424", from: "SIN", to: "BOM", departAt: `${E}T20:10`, arriveAt: `${E}T23:15`, terminal: "3", confirmation: "7GHK2Q", passengerIds: [], status: "pending", attachmentIds: [] },
  ];

  const itinerary = dates.map((date, i) => {
    const byName = (n: string) => places.find((p) => p.name.startsWith(n))!.id;
    const plans: string[][] = [
      [byName("Maxwell"), byName("Chinatown"), byName("Lau Pa Sat")],
      [byName("Gardens by the Bay"), byName("Marina Bay Sands")],
      [byName("Universal Studios")],
      [byName("Singapore Botanic"), byName("Orchard Road"), byName("Night Safari")],
      [],
      [byName("Jewel Changi")],
    ];
    const prep = [
      { buy: "Kaya jam & Ya Kun coffee powder from a supermarket; EZ-Link card at any MRT station", avoid: "Taxis 5–8pm (peak surcharge) — take the MRT", general: "Hawker centres: chope a table with a tissue pack, order, then sit." },
      { buy: "Bak kwa (Bee Cheng Hiang) — vacuum packed for the flight", avoid: "Supertree OCBC Skyway in the rain — slippery, closes in lightning", general: "Sunset at SkyPark ≈ 7pm; light show at Gardens 7:45pm — walkable in 10 min." },
      { buy: "Minion popcorn bucket if the kids insist", avoid: "Lockers near the entrance fill up — use the ones inside Sci-Fi City", general: "Free water refill stations near restrooms. Ponchos for the Jurassic Park ride." },
      { buy: "TWG tea tins at ION Orchard; Charles & Keith is cheaper than back home", avoid: "Orchard Rd on a weekend afternoon if you dislike crowds", general: "Night Safari: last tram 11:15pm. Wear dark clothes, no flash photography." },
      { buy: "", avoid: "", general: "Free day — Sentosa beaches, Haw Par Villa, or the ArtScience Museum depending on weather." },
      { buy: "Duty-free: Tiger Balm, pandan cake from Bengawan Solo (T2/T3)", avoid: "Leaving the GST refund kiosk for last — do it before check-in", general: "Check-out 12:00, leave bags at concierge, Jewel by 2pm, check-in 3h before." },
    ];
    return { id: newId(), tripId, date, placeIds: plans[i] ?? [], prep: prep[i], title: i === 0 ? "Arrival & Chinatown" : i === 1 ? "Marina Bay" : i === 2 ? "Sentosa day" : i === 3 ? "Gardens, shopping, wildlife" : i === 4 ? "Free day" : "Departure via Jewel" };
  });

  const expenses: Omit<Expense, "createdAt" | "updatedAt">[] = [
    { id: newId(), tripId, date: S, category: "transport", description: "Grab from Changi to hotel", amount: 28.5, currency: "SGD" },
    { id: newId(), tripId, date: S, category: "food", description: "Chicken rice ×4 + drinks", amount: 26, currency: "SGD" },
    { id: newId(), tripId, date: dates[1], category: "tickets", description: "Gardens by the Bay domes ×4", amount: 212, currency: "SGD" },
  ];

  await put("trips", trip);
  for (const p of places) await put("places", p as Place);
  await put("hotels", hotel as Hotel);
  for (const f of flights) await put("flights", f as Flight);
  for (const d of itinerary) await put("itineraryDays", d);
  for (const e of expenses) await put("expenses", e as Expense);
  await setSetting("seeded:singapore", true);
}
