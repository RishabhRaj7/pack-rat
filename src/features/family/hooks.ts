import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { FamilyMember } from "./types";

export const useMembers = () => useLiveQuery(() => db.members.orderBy("name").toArray(), []) ?? undefined;
export const useMember = (id?: string) => useLiveQuery<FamilyMember | undefined>(async () => (id ? db.members.get(id) : undefined), [id]);
export const useMemberMap = () => {
  const members = useMembers();
  return new Map((members ?? []).map((m) => [m.id, m]));
};
