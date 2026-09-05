import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Trip } from "./types";

export const useTrips = () => useLiveQuery(() => db.trips.orderBy("startDate").reverse().toArray(), []);
export const useTrip = (id?: string) => useLiveQuery<Trip | undefined>(async () => (id ? db.trips.get(id) : undefined), [id]);
export const usePlaces = (tripId?: string) => useLiveQuery(() => (tripId ? db.places.where("tripId").equals(tripId).sortBy("createdAt") : []), [tripId]) ?? [];
export const useHotels = (tripId?: string) => useLiveQuery(() => (tripId ? db.hotels.where("tripId").equals(tripId).sortBy("checkIn") : []), [tripId]) ?? [];
export const useFlights = (tripId?: string) => useLiveQuery(() => (tripId ? db.flights.where("tripId").equals(tripId).sortBy("departAt") : []), [tripId]) ?? [];
export const useItinerary = (tripId?: string) => useLiveQuery(() => (tripId ? db.itineraryDays.where("tripId").equals(tripId).sortBy("date") : []), [tripId]) ?? [];
export const useExpenses = (tripId?: string) => useLiveQuery(() => (tripId ? db.expenses.where("tripId").equals(tripId).reverse().sortBy("date") : []), [tripId]) ?? [];
export const useTrains = (tripId?: string) => useLiveQuery(() => (tripId ? db.trains.where("tripId").equals(tripId).sortBy("departAt") : []), [tripId]) ?? [];
/** Every flight / train regardless of trip — used by the Journeys view and the Home summary. */
export const useAllFlights = () => useLiveQuery(() => db.flights.orderBy("departAt").toArray(), []) ?? [];
export const useAllTrains = () => useLiveQuery(() => db.trains.orderBy("departAt").toArray(), []) ?? [];
export const useAllHotels = () => useLiveQuery(() => db.hotels.orderBy("checkIn").toArray(), []) ?? [];
export const useAllExpenses = () => useLiveQuery(() => db.expenses.toArray(), []) ?? [];
