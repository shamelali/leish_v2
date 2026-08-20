export type BookingStatus = "requested"|"quoted"|"fee_paid"|"confirmed"|"completed"|"cancelled"|"expired";
type Role = "client"|"artist"|"studio"|"admin";
const transitions: Record<BookingStatus, { to: BookingStatus[]; roles: Role[] }> = {
  requested: { to: ["quoted","cancelled","expired"], roles: ["artist","studio","admin"] },
  quoted: { to: ["fee_paid","requested","cancelled","expired"], roles: ["client","artist","admin"] },
  fee_paid: { to: ["confirmed","cancelled"], roles: ["admin"] },
  confirmed: { to: ["completed","cancelled"], roles: ["artist","studio","admin"] },
  completed: { to: [], roles: [] },
  cancelled: { to: [], roles: [] },
  expired: { to: ["requested"], roles: ["artist","admin"] },
};
export function canTransition(from: BookingStatus, to: BookingStatus, role: Role, isOwner: boolean, isClaimedArtist: boolean): boolean {
  if (from==="requested" && to==="cancelled") return isOwner || isClaimedArtist;
  const rule = transitions[from];
  if (!rule.to.includes(to)) return false;
  if (role==="admin") return true;
  if (role==="client" && !isOwner) return false;
  if ((role==="artist" || role==="studio") && from!=="requested" && !isClaimedArtist) return false;
  return rule.roles.includes(role);
}
