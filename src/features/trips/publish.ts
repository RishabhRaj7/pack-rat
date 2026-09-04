/**
 * Publish an itinerary as a read-only shareable page.
 *  - Local mode: the itinerary is compressed into the URL fragment (works with no backend, no data leaves
 *    the device until you share the link).
 *  - Firebase mode: additionally written to `published/{id}` so the link stays short.
 * Sensitive data (ID numbers, confirmations, insurance) is never included.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { db } from "@/lib/db";
import { getFirebase } from "@/lib/firebase";
import { newId, put } from "@/lib/repo";
import type { Trip, PlaceTag } from "./types";

export interface PublishedItinerary {
  v: 1;
  title: string;
  city: string;
  country: string;
  countryCode: string;
  emoji: string;
  startDate: string;
  endDate: string;
  hotel?: { name: string; address: string; checkIn: string; checkOut: string };
  days: { date: string; title?: string; places: { name: string; address?: string; tags: PlaceTag[]; notes?: string; lat?: number; lng?: number }[]; prep?: { buy?: string; avoid?: string; general?: string } }[];
  publishedAt: number;
}

export async function buildPublished(trip: Trip): Promise<PublishedItinerary> {
  const [days, places, hotels] = await Promise.all([
    db.itineraryDays.where("tripId").equals(trip.id).sortBy("date"),
    db.places.where("tripId").equals(trip.id).toArray(),
    db.hotels.where("tripId").equals(trip.id).toArray(),
  ]);
  const pm = new Map(places.map((p) => [p.id, p]));
  const hotel = hotels[0];
  return {
    v: 1,
    title: trip.title,
    city: trip.city,
    country: trip.country,
    countryCode: trip.countryCode,
    emoji: trip.coverEmoji,
    startDate: trip.startDate,
    endDate: trip.endDate,
    hotel: hotel ? { name: hotel.name, address: hotel.address, checkIn: hotel.checkIn, checkOut: hotel.checkOut } : undefined,
    days: days.map((d) => ({
      date: d.date,
      title: d.title,
      prep: d.prep,
      places: d.placeIds.map((id) => pm.get(id)).filter(Boolean).map((p) => ({ name: p!.name, address: p!.address, tags: p!.tags, notes: p!.notes, lat: p!.lat, lng: p!.lng })),
    })),
    publishedAt: Date.now(),
  };
}

export async function publishTrip(trip: Trip): Promise<string> {
  const payload = await buildPublished(trip);
  const base = `${location.origin}${location.pathname}#/share`;
  const fb = getFirebase();
  if (fb && fb.auth.currentUser) {
    const { doc, setDoc } = await import("firebase/firestore");
    const id = trip.publishedId ?? newId();
    await setDoc(doc(fb.firestore, "published", id), { ...payload, ownerUid: fb.auth.currentUser.uid });
    if (trip.publishedId !== id) await put("trips", { ...trip, publishedId: id });
    return `${base}/${id}`;
  }
  return `${base}?d=${compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

export function decodeShared(d: string): PublishedItinerary | null {
  try {
    const json = decompressFromEncodedURIComponent(d);
    return json ? (JSON.parse(json) as PublishedItinerary) : null;
  } catch {
    return null;
  }
}

export async function fetchPublished(id: string): Promise<PublishedItinerary | null> {
  const fb = getFirebase();
  if (!fb) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(fb.firestore, "published", id));
  return snap.exists() ? (snap.data() as PublishedItinerary) : null;
}
