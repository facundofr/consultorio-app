export type Catalog = {
  professionals: { id: string; name: string; specialtyIds: string[]; locationIds: string[] }[];
  services: { id: string; name: string; durationMinutes: number; specialtyId: string | null }[];
  locations: { id: string; name: string }[];
};

export function servicesFor(catalog: Catalog, professionalId: string) {
  const p = catalog.professionals.find((x) => x.id === professionalId);
  if (!p) return [];
  return catalog.services.filter((s) => !s.specialtyId || p.specialtyIds.includes(s.specialtyId));
}
