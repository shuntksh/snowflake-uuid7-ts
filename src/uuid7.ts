/**
 * Generates a random UUID7 following RFC9562. It is a time-ordered monotonic UUID
 * that is sortable with sacrifices on predictability and randomness.
 *
 * Following illustrates the structure of the UUID7:
 *
 *    0                   1                   2                   3
 *     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |                           unix_ts_ms                          |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |          unix_ts_ms           |  ver  |       rand_a          |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |var|                        rand_b                             |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |                            rand_b                             |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 *  - timestamp: 48 bits for the Unix Epoch timestamp in milliseconds
 *  - ver: 4 bits for the version number (7) of the UUID (0b0111)
 *  - rand_a: 12bits for random value (or additional timestamp resolution)
 *       - We use this section to store sequence number and worker ID
 *  - var: 2 bits variant (0b10)
 *  - rand_b: 62 bits for random value of which
 *
 * Implementation Note:
 *  - Javascript timestamp is in milliseconds and is 41 bits long (2^41 = 2199023255552) which means
 *    that we do not use the full 48 bits of the timestamp. If this is a concern, you may not use
 *    this implementation.
 *  - The worker ID and sequence number sizes are arbitrary picked to ensure that distributed systems
 *    can generate unique UUIDs which is also monotonic and sortable.
 *  - Sequence number will be incremented by 1 for each millisecond and will overflow after 4096.
 *  - The random values are generated using crypto.getRandomValues() for secure random numbers.
 *
 */

type UUIDBinary = [bigint, bigint];
const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UUIDv7 {
	// Predefined values for UUID7 in RFC9562
	static readonly UUID7_VERSION = 0b0111; // version 7
	static readonly UUID7_VARIANT = 0b10; // variant 2

	static readonly VER_LEN = 4;
	static readonly RAND_A_LEN = 12;
	static readonly VAR_LEN = 2;
	static readonly RAND_B_LEN = 62; // 62 bits - 22 bits for worker ID and sequence
	static readonly TIMESTAMP_SHIFT = BigInt(UUIDv7.VER_LEN + UUIDv7.RAND_A_LEN);
	static readonly MAX_SEQ = -1 ^ (-1 << UUIDv7.RAND_A_LEN);

	// Used to mask the random values to fit the bit length
	private static readonly RAND_A_MASK = 0xfffn;
	private static readonly RAND_B_MASK = 0x3fffffffffffffffn;

	// Precomputed values for UUID7 bit shifts
	private static readonly VER = BigInt(UUIDv7.UUID7_VERSION) << BigInt(UUIDv7.RAND_A_LEN);
	private static readonly VAR = BigInt(UUIDv7.UUID7_VARIANT) << BigInt(UUIDv7.RAND_B_LEN);

	static isValid(uuid: string): boolean {
		return UUIDRegex.test(uuid);
	}

	/**
	 * Parse to extract timestamp.It is meant to be used for testing and debugging. As per RFC9562,
	 * UUID7 is not meant to be parsed but rather used it as opaquely as possible.
	 */
	static parse(uuid: string) {
		if (!UUIDv7.isValid(uuid)) throw new Error("Invalid UUID");
		const hex = uuid.replace(/-/g, "");
		const left = BigInt(`0x${hex.slice(0, 16)}`);
		const right = BigInt(`0x${hex.slice(16)}`);
		const timestamp = Number(left >> UUIDv7.TIMESTAMP_SHIFT);
		const version = Number((left >> BigInt(UUIDv7.RAND_A_LEN)) & 0xfn);
		const randA = left & UUIDv7.RAND_A_MASK;
		const variant = Number(right >> BigInt(UUIDv7.RAND_B_LEN));
		const randB = right & UUIDv7.RAND_B_MASK;
		return {
			timestamp,
			version,
			variant,
			randA: randA.toString(10),
			randB: randB.toString(10),
			binary: [left, right],
		};
	}

	private sequenceOffset = 0n;
	private lastTimestamp = -1n;
	private sequence = 0n;

	constructor(sequence = 0) {
		if (sequence < 0 || sequence > BigInt(4095)) {
			throw new Error(`Sequence must be between 0 and 4095, got ${sequence}`);
		}
		this.sequenceOffset = BigInt(sequence);
		this.sequence = BigInt(sequence);
	}

	generate(): string {
		let [left, right] = this.generateBinary().map((x) => x.toString(16).padStart(16, "0"));
		left = `${left.slice(0, 8)}-${left.slice(8, 12)}-${left.slice(12, 16)}`;
		right = `${right.slice(0, 4)}-${right.slice(4)}`;
		return `${left}-${right}`;
	}

	generateBinary(): UUIDBinary {
		const [timestamp, sequence] = this.getTimestampAndSequence();
		const randB = this.getRandomByte();
		return [(timestamp << UUIDv7.TIMESTAMP_SHIFT) | UUIDv7.VER | sequence, UUIDv7.VAR | randB];
	}

	private getRandomByte(): bigint {
		const buff = new BigUint64Array(1);
		crypto.getRandomValues(buff);
		return buff[0] & BigInt(UUIDv7.RAND_B_MASK);
	}

	private getTimestampAndSequence(): [bigint, bigint] {
		let currentTimestamp = BigInt(Date.now());
		if (currentTimestamp < this.lastTimestamp) {
			throw new Error(
				`Clock moved backwards. Refusing to generate id until ${this.lastTimestamp}.`,
			);
		}
		if (currentTimestamp === this.lastTimestamp) {
			this.sequence = (this.sequence + 1n) & BigInt(UUIDv7.MAX_SEQ);
			if (this.sequence === 0n) {
				// Sequence overflow, wait until next millisecond
				currentTimestamp = this.waitTillNextMillis();
				this.sequence = this.sequenceOffset;
			}
		} else {
			this.sequence = this.sequenceOffset;
		}
		this.lastTimestamp = currentTimestamp;
		return [this.lastTimestamp, this.sequence];
	}

	/**
	 * We use synchronous loop here as 1) we only wait for less than a millisecond and 2) we assume
	 * it is a rare case and we can afford to wait for a few microseconds
	 */
	private waitTillNextMillis(): bigint {
		let timestamp = BigInt(Date.now());
		while (timestamp <= this.lastTimestamp) {
			timestamp = BigInt(Date.now());
		}
		return timestamp;
	}
}
