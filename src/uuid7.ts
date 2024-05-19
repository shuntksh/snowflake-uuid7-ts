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
 *  - var: 2 bits variant (0b10)
 *  - rand_b: 62 bits for random value of which
 *       - Most significant 22 bits are used for 10-bit worker ID and 12-bit sequence number
 *       - Followed by 8 bits and 32 bits random values

 *
 *    0                   1                   2                   3
 *     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |var|   worker_id(10)   |     sequence(12)      |    rand (8)   |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |                           rand(32)                            |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * 
 * And when the 12 bit sequence overflows, we wait for the next millisecond to generate the next UUID.
 * 
 * Implementation Note:
 *  - Javascript timestamp is in milliseconds and is 41 bits long (2^41 = 2199023255552) which means
 *    that we do not use the full 48 bits of the timestamp. If this is a concern, you may not use
 *    this implementation.
 *  - The worker ID and sequence number sizes are arbitrary picked to ensure that distributed systems
 *    can generate unique UUIDs which is also monotonic and sortable.
 *  - Sequence number will be incremented by 1 for each millisecond and will overflow after 4096 IDs.
 *    this is OK as we have subsequent 40-bits random value to ensure uniqueness.
 *  - The random values are generated using crypto.getRandomValues() for secure random numbers.
 *
 */

type UUIDBinary = [bigint, bigint];
const UUIDRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UUIDv7 {
  // Predefined values for UUID7 in RFC9562
  static readonly UUID7_VERSION = 0b0111; // version 7
  static readonly UUID7_VARIANT = 0b10; // variant 2

  static readonly VER_LEN = 4;
  static readonly RAND_A_LEN = 12;
  static readonly VAR_LEN = 2;
  static readonly RAND_B_TOTAL_LEN = 62; // Total 62 bits for rand_b
  static readonly WORKER_ID_LEN = 10; // Arbitrary worker ID bits for this implementation
  static readonly SEQ_LEN = 12; // Arbitrary sequence bits for this implementation
  static readonly RAND_B_LEN = 40; // 62 bits - 22 bits for worker ID and sequence
  static readonly TIMESTAMP_SHIFT = BigInt(UUIDv7.VER_LEN + UUIDv7.RAND_A_LEN);
  static readonly WORKER_ID_SHIFT = BigInt(UUIDv7.SEQ_LEN + UUIDv7.RAND_B_LEN);
  static readonly SEQ_SHIFT = BigInt(UUIDv7.RAND_B_LEN);
  static readonly MAX_WORKER_ID = -1 ^ (-1 << UUIDv7.WORKER_ID_LEN);
  static readonly MAX_SEQ = -1 ^ (-1 << UUIDv7.SEQ_LEN);

  // Precomputed values for UUID7 bit shifts
  private static readonly VER =
    BigInt(UUIDv7.UUID7_VERSION) << BigInt(UUIDv7.RAND_A_LEN);
  private static readonly VAR =
    BigInt(UUIDv7.UUID7_VARIANT) <<
    BigInt(UUIDv7.WORKER_ID_LEN + UUIDv7.SEQ_LEN + UUIDv7.RAND_B_LEN);

  static isValidUUID(uuid: string): boolean {
    return UUIDRegex.test(uuid);
  }

  /**
   * Parse to extract timestamp.It is meant to be used for testing and debugging. As per RFC9562,
   * UUID7 is not meant to be parsed but rather used it as opaquely as possible.
   */
  static parse(uuid: string): {
    timestamp: number;
    version: number;
    variant: number;
    binary: UUIDBinary;
  } {
    if (!UUIDv7.isValidUUID(uuid)) throw new Error("Invalid UUID");
    const hex = uuid.replace(/-/g, "");
    const left = BigInt(`0x${hex.slice(0, 16)}`);
    const right = BigInt(`0x${hex.slice(16)}`);
    const timestamp = Number(left >> UUIDv7.TIMESTAMP_SHIFT);
    const version = Number((left >> BigInt(UUIDv7.RAND_A_LEN)) & 0xfn);
    const variant = Number(right >> BigInt(UUIDv7.RAND_B_TOTAL_LEN));
    return { timestamp, version, variant, binary: [left, right] };
  }

  private workerId: bigint;
  private lastTimestamp = -1n;
  private sequence = 0n;

  /**
   * This implementation accepts a worker ID and a sequence number to be used in the UUID
   * along with random value to avoid collisions during bath generation.
   * @param workerId - Optional worker ID (10 bits 0-1023)
   * @param sequence - Optional sequence number (12 bits 0-4095) to override the default sequence
   */
  constructor(workerId = 0, sequence = 0) {
    if (workerId < 0 || workerId > UUIDv7.MAX_WORKER_ID) {
      throw new Error(`Worker ID must be between 0 and 1023, got ${workerId}`);
    }
    if (sequence < 0 || sequence > BigInt(4095)) {
      throw new Error(`Sequence must be between 0 and 4095, got ${sequence}`);
    }

    this.workerId = BigInt(workerId);
    this.sequence = BigInt(sequence);
  }

  generateBinary(): UUIDBinary {
    const [timestamp, sequence] = this.getTimestampAndSequence();
    const [randA, randB] = this.getRandomByte();
    const left = (timestamp << UUIDv7.TIMESTAMP_SHIFT) | UUIDv7.VER | randA;
    const right =
      UUIDv7.VAR |
      (this.workerId << UUIDv7.WORKER_ID_SHIFT) |
      (sequence << UUIDv7.SEQ_SHIFT) |
      randB;

    return [left, right];
  }

  generate(): string {
    const [left, right] = this.generateBinary();
    const uuid =
      left.toString(16).padStart(16, "0") +
      right.toString(16).padStart(16, "0");
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(
      12,
      16
    )}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
  }

  /**
   * Returns a tuple of two random numbers using crypto.getRandomValues
   * for the 12bits rand_a and 40bits rand_b.
   */
  private getRandomByte(): [bigint, bigint] {
    const buff = new BigUint64Array(1);
    crypto.getRandomValues(buff);
    const random = buff[0];
    const mask12bits = 0xfffn;
    const randA = random & mask12bits; // Extract the bottom-12 bits
    const randB = random >> 24n; // Shifting 24 bits to extract top-40 bits
    return [randA, randB];
  }

  private getTimestampAndSequence(): [bigint, bigint] {
    let currentTimestamp = BigInt(Date.now());
    if (currentTimestamp < this.lastTimestamp) {
      throw new Error(
        `Clock moved backwards. Refusing to generate id until ${this.lastTimestamp}.`
      );
    }
    if (currentTimestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & BigInt(UUIDv7.MAX_SEQ);
      if (this.sequence === 0n) {
        // Sequence overflow, wait until next millisecond
        currentTimestamp = this.waitTillNextMillis();
      }
    } else {
      this.sequence = 0n;
    }
    this.lastTimestamp = currentTimestamp;
    return [this.lastTimestamp, this.sequence];
  }

  /**
   * We use synchronous loop here as 1) we only wait for less than a millisecond and 2) we assume
   * it is a rare case and we can afford to wait for a few microseconds
   *
   * * If the system is constantly hitting this case, we would need to increase the worker counts.
   */
  private waitTillNextMillis(): bigint {
    let timestamp = BigInt(Date.now());
    while (timestamp <= this.lastTimestamp) {
      timestamp = BigInt(Date.now());
    }
    return timestamp;
  }
}
