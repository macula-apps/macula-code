import { describe, it, expect } from "vitest";
import { deriveRealmTag } from "../src/mesh/realm";

describe("deriveRealmTag", () => {
  it("hashes a realm name with SHA-256, lowercase hex, 64 chars", () => {
    const tag = deriveRealmTag("io.macula")!;
    expect(tag).toMatch(/^[0-9a-f]{64}$/);
    expect(tag).not.toMatch(/[A-F]/);
  });

  it("is stable for the same name", () => {
    expect(deriveRealmTag("io.example.myapp")).toBe(deriveRealmTag("io.example.myapp"));
  });

  it("distinguishes different names", () => {
    expect(deriveRealmTag("io.macula")).not.toBe(deriveRealmTag("io.example.myapp"));
  });

  it("passes a 64-hex tag through, lowercased", () => {
    const tag = "A".repeat(64);
    expect(deriveRealmTag(tag)).toBe(tag.toLowerCase());
  });

  it("trims whitespace around the name before hashing", () => {
    expect(deriveRealmTag("  io.macula  ")).toBe(deriveRealmTag("io.macula"));
  });

  it("maps empty input to the all-zero realm (undefined)", () => {
    expect(deriveRealmTag("")).toBeUndefined();
    expect(deriveRealmTag("   ")).toBeUndefined();
  });
});
