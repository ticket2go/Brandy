// Supabase Auth verlangt eine E-Mail. Wir bilden den Login-Namen
// deterministisch auf eine interne Pseudo-E-Mail ab, sodass User
// nach außen nur ihren Benutzernamen brauchen.

const DOMAIN = "brandsystem.local";

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  const u = normalizeUsername(input);
  return /^[a-z0-9_.-]{3,40}$/.test(u);
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const domain = email.slice(at + 1);
  if (domain.toLowerCase() !== DOMAIN) return null;
  return email.slice(0, at);
}
