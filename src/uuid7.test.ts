import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UUIDv7 } from "./uuid7";

describe("randomUUID7", () => {
  it("should generate UUID with dashes", () => {
    const uuid = new UUIDv7().generate();
    expect(uuid).toMatch(/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/);
  });

  it("should generate a UUID that contains timestamp", () => {
    vi.useFakeTimers();
    const v7 = new UUIDv7();
    // We have to use a fake timer to ensure the timestamp is the same
    const now = Date.now();
    const uuid = v7.generate();
    const { timestamp, version, variant } = UUIDv7.parse(uuid);
    expect(timestamp).toBe(now);
    expect(version).toBe(7);
    expect(variant).toBe(2);

    vi.advanceTimersByTime(1);
    const uuid2 = v7.generate();
    const { timestamp: timestamp2 } = UUIDv7.parse(uuid2);
    expect(timestamp2).toBe(now + 1);
    vi.useRealTimers();
  });

  it("should not generate the same UUID for the same timestamp while monotonically increasing", () => {
    vi.useFakeTimers();
    const v7 = new UUIDv7();
    let uuid1 = v7.generateBinary();
    for (let i = 0; i < 100; i++) {
      const uuid2 = v7.generateBinary();
      expect(uuid2[0]).not.toBe(uuid1[0]);
      expect(uuid2[1]).not.toBe(uuid1[1]);
      expect(uuid2[1]).toBeGreaterThan(uuid1[1]); // Lexicographically less than
      uuid1 = uuid2;
    }
    vi.useRealTimers();
  });

  it("should generate monotonically increase UUID", () => {
    vi.useFakeTimers();
    const v7 = new UUIDv7();
    const uuid1 = v7.generate();
    vi.advanceTimersByTime(1);
    const uuid2 = v7.generate();
    expect(uuid1).not.toBe(uuid2);
    expect(uuid1 < uuid2).toBe(true); // Lexicographically less than
    vi.useRealTimers();
  });
});
