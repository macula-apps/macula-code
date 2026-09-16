import { createHash } from "crypto";

/**
 * Derive the 32-byte realm tag macula scopes every mesh operation under,
 * as 64 lowercase hex characters. A realm NAME is hashed with SHA-256 —
 * the same rule as the Erlang SDK's `macula_realm:id/1` — and a 64-hex
 * tag is passed through as-is. Empty input is the all-zero realm, which
 * the SDK omits.
 */
export function deriveRealmTag(realm: string): string | undefined {
  const trimmed = realm.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return createHash("sha256").update(trimmed, "utf8").digest("hex");
}
