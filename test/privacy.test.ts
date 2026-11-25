import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSalt, pseudonym, redact } from "../src/privacy.js";

describe("redact", () => {
  it("removes emails, phones, cards and IPs", () => {
    const r = redact(
      "Email me at jane.doe@example.com or call +44 7700 900123. Card 4242 4242 4242 4242 failed from 192.168.0.12.",
    );
    expect(r.text).toBe("Email me at [EMAIL] or call [PHONE]. Card [CARD] failed from [IP].");
    expect(r.count).toBe(4);
  });

  it("does not treat dates, versions or prices as phone numbers or cards", () => {
    const text = "Since 2026-10-02 on v3.8.2 I was charged £24.99 twice, order 12345.";
    expect(redact(text).text).toBe(text);
  });

  it("only redacts card-like numbers that pass the Luhn check", () => {
    expect(redact("ref 1234 5678 9012 3456").text).toContain("1234 5678 9012 3456");
  });

  it("removes self-introductions, greetings and sign-offs", () => {
    const r = redact("Hi Sarah,\nmy name is Jane Doe and I'd like a refund.\nThanks, Jane Doe");
    expect(r.text).toBe("Hi [NAME],\nmy name is [NAME] and I'd like a refund.\nThanks, [NAME]");
  });

  it("scrubs known names everywhere, including first names alone", () => {
    const r = redact("Priya here. Priya Raman needs help; ask Priya.", { names: ["Priya Raman"] });
    expect(r.text).not.toMatch(/Priya|Raman/);
  });

  it("leaves allow-listed product names alone", () => {
    expect(redact("Thanks Tempo team!", { allow: ["Tempo"] }).text).toBe("Thanks Tempo team!");
  });

  it("redacts social handles but not npm scopes or emails", () => {
    const r = redact("cc @dwelle, uses @excalidraw/excalidraw");
    expect(r.text).toBe("cc [HANDLE], uses @excalidraw/excalidraw");
  });

  it("removes secrets and tokens in URLs", () => {
    const r = redact("key sk-abcdefghijklmnopqrstuvwx and https://x.io/cb?token=abc123&ok=1");
    expect(r.text).toBe("key [SECRET] and https://x.io/cb?token=[REDACTED]&ok=1");
  });

  it("applies custom patterns from config", () => {
    expect(redact("Order ACME-123456 is late", { patterns: ["ACME-\\d{6}"] }).text).toBe("Order [REDACTED] is late");
  });
});

describe("pseudonym", () => {
  it("is stable for the same identifier and salt, case-insensitively", () => {
    expect(pseudonym("Jane@Example.com", "s1")).toBe(pseudonym("jane@example.com ", "s1"));
  });

  it("differs across salts, so a committed store cannot be reversed by hashing emails", () => {
    expect(pseudonym("jane@example.com", "s1")).not.toBe(pseudonym("jane@example.com", "s2"));
  });

  it("persists a salt per store", () => {
    const dir = mkdtempSync(join(tmpdir(), "receipts-salt-"));
    expect(loadSalt(dir)).toBe(loadSalt(dir));
  });
});
