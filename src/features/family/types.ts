export interface FamilyMember {
  id: string;
  name: string;
  relation?: string; // e.g. "Me", "Spouse", "Daughter"
  dateOfBirth?: string; // YYYY-MM-DD
  nationality?: string; // country code
  photoId?: string; // attachment id
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
