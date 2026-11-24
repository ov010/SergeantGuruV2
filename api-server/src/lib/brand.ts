/**
 * The footer line every SergeantGuruV2 embed carries, for example
 * "SergeantGuruV2 | 09:16Z | ID: 1574715321087037450". Interactions pass their
 * own ID; anything sent outside an interaction falls back to "N/A".
 */
export function brandFooter(id?: string | null): string {
  return `SergeantGuruV2 | ${new Date().toISOString().slice(11, 16)}Z | ID: ${id ?? "N/A"}`;
}
