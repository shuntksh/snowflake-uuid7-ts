import { describe, expect, it, setSystemTime } from "bun:test";
import { UUIDv7 } from "./uuid7";

function computeEntropy(value: bigint): number {
	const bit: ("0" | "1")[] = value
		.toString(2)
		.split("")
		.map((v) => (v === "1" ? "1" : "0"));
	const freq: { "1": number; "0": number } = { "1": 0, "0": 0 };
	for (let i = 0; i < bit.length; i++) {
		freq[bit[i]]++;
	}
	const totalBits = bit.length;
	const probabilities = Object.values(freq).map((count) => count / totalBits);
	const entropy = probabilities.reduce((acc, p) => acc - p * Math.log2(p), 0);
	return entropy;
}

describe("randomUUID7", () => {
	it("should generate UUID with dashes", () => {
		const uuid = new UUIDv7().generate();
		expect(uuid).toMatch(/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/);
	});

	it("should generate a UUID that contains timestamp", () => {
		setSystemTime(new Date("2025-03-06T00:00:00.000Z"));
		const v7 = new UUIDv7();
		// We have to use a fake timer to ensure the timestamp is the same
		const now = Date.now();
		const uuid = v7.generate();
		const { timestamp, version, variant } = UUIDv7.parse(uuid);
		expect(timestamp).toBe(now);
		expect(version).toBe(7);
		expect(variant).toBe(2);

		setSystemTime(new Date("2025-03-06T00:00:00.001Z"));
		const uuid2 = v7.generate();
		const { timestamp: timestamp2 } = UUIDv7.parse(uuid2);
		expect(timestamp2).toBe(now + 1);
		setSystemTime(); // reset to real time
	});

	it("should not generate the same UUID for the same timestamp while monotonically increasing", () => {
		setSystemTime(new Date("2025-03-06T00:00:00.000Z"));
		const v7 = new UUIDv7();
		let uuid1 = v7.generate();
		for (let i = 0; i < 100; i++) {
			const uuid2 = v7.generate();
			const parsed1 = UUIDv7.parse(uuid1);
			const parsed2 = UUIDv7.parse(uuid2);
			expect(uuid2).not.toBe(uuid1);
			expect(parsed2.timestamp).toBe(parsed1.timestamp);
			expect(Number(parsed2.randA)).toBeGreaterThan(Number(parsed1.randA)); // Lexicographically less than
			expect(parsed2.randB).not.toBe(parsed1.randB); // Lexicographically less than
			// Sanity check for randomness
			expect(computeEntropy(parsed1.binary[1])).toBeGreaterThan(0);
			uuid1 = uuid2;
		}
		setSystemTime(); // reset to real time
	});

	it("should generate monotonically increase UUID", () => {
		setSystemTime(new Date("2025-03-06T00:00:00.000Z"));
		const v7 = new UUIDv7();
		const uuid1 = v7.generate();
		setSystemTime(new Date("2025-03-06T00:00:00.001Z"));
		const uuid2 = v7.generate();
		expect(uuid1).not.toBe(uuid2);
		expect(uuid1 < uuid2).toBe(true); // Lexicographically less than
		setSystemTime(); // reset to real time
	});
});
