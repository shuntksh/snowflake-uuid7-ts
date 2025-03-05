import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { Snowflake } from "./snowflake";

describe("snowflake id", () => {
	beforeEach(() => {
		setSystemTime(new Date("2025-03-06T00:00:00.000Z"));
	});
	afterEach(() => {
		setSystemTime(); // reset to real time
	});

	it("should generate unique ids in the same timestamp window", () => {
		const snowflakeId = new Snowflake(1);
		const id1 = snowflakeId.generate();
		const id2 = snowflakeId.generate();
		const parsed1 = Snowflake.parse(id1);
		const parsed2 = Snowflake.parse(id2);
		expect(id1).not.toBe(id2);
		expect(parsed1.binary.length).toBe(64);
		expect(parsed1.timestamp).toBe(parsed2.timestamp);
		expect(parsed1.sequence).toBeLessThan(parsed2.sequence);
		expect(BigInt(id1)).toBeLessThan(BigInt(id2));
	});

	it("should generate unique ids in different timestamp windows", () => {
		const snowflakeId = new Snowflake(1);

		const id1 = snowflakeId.generate();
		setSystemTime(new Date("2025-03-06T00:00:00.001Z"));
		const id2 = snowflakeId.generate();

		const parsed1 = Snowflake.parse(id1);
		const parsed2 = Snowflake.parse(id2);

		expect(parsed1.binary).not.toBe(parsed2.binary);
		expect(id1).not.toBe(id2);

		expect(parsed1.timestamp).toBeLessThan(parsed2.timestamp);
		expect(parsed1.sequence).toBe(parsed2.sequence);

		expect(BigInt(id1)).toBeLessThan(BigInt(id2));
	});

	it("should generate unique ids with different worker ids", () => {
		const snowflakeId1 = new Snowflake(1);
		const snowflakeId2 = new Snowflake(2);
		const id1 = snowflakeId1.generate();
		const id2 = snowflakeId2.generate();
		const parsed1 = Snowflake.parse(id1);
		const parsed2 = Snowflake.parse(id2);
		expect(parsed1.workerId).not.toBe(parsed2.workerId);
		expect(id1).not.toBe(id2);
	});

	it("it should only allow 12 bits for sequence", () => {
		const snowflakeId = new Snowflake(1);
		const maxSequence = 0xfff;
		let prev = snowflakeId.generate();
		for (let i = 0; i <= maxSequence - 1; i++) {
			const current = snowflakeId.generate();
			const parsed = Snowflake.parse(current);
			expect(parsed.sequence).toBe(i + 1);
			expect(BigInt(current)).toBeGreaterThan(BigInt(prev));
			prev = current;
		}
	});
});
