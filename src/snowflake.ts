/**
 * Snowflake ID is a 63-bit unique ID scheme with the first bit always 0 to ensure the ID is positive
 * for signed long value.
 *
 * The ID is composed of:
 * - 1 bit for sign (0) ignored
 * - 41 bits for the timestamp in milliseconds (gives us 69 years)
 * - 10 bits for the worker ID (gives us up to 1024 workers),
 *     *(optionally configurable to 5 bits for worker ID and 5 bits for data center ID
 * - 12 bits for the sequence number (gives us up to 4096 IDs per millisecond)
 *
 * For 64 bit long value, the layout is as follows:
 *
 *    0                   1                   2                   3
 *     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |X|                      Timestamp (41)                         |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *    |  Timestamp (41)   |   Worker ID (10)  |     Sequence (12)     |
 *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 * see:
 * - https://en.wikipedia.org/wiki/Snowflake_ID
 * - https://github.com/twitter-archive/snowflake/tree/scala_28
 *
 */
export class Snowflake {
  static readonly EPOCH = 1288834974657; // From the original Twitter implementation 2010-11-04T01:42:54.657Z
  static readonly WORKER_ID_LEN = 10;
  static readonly SEQ_LEN = 12;
  static readonly WORKER_ID_SHIFT = BigInt(this.SEQ_LEN);
  static readonly TIMESTAMP_SHIFT = BigInt(this.WORKER_ID_LEN + this.SEQ_LEN);
  static readonly MAX_WORKER_ID = -1 ^ (-1 << this.WORKER_ID_LEN);
  static readonly MAX_SEQ = BigInt(-1 ^ (-1 << this.SEQ_LEN));

  static toBinaryString(id: string): string {
    const bin = BigInt(id).toString(2);
    return bin.length < 64 ? bin.padStart(64, "0") : bin;
  }

  static parse(id: string): {
    timestamp: number;
    workerId: number;
    sequence: number;
    binary: string;
  } {
    const binary = Snowflake.toBinaryString(id);
    const timestamp =
      Number.parseInt(binary.substring(1, 42), 2) + Snowflake.EPOCH; // Ignore most significant bit
    const workerId = Number.parseInt(binary.substring(42, 52), 2);
    const sequence = Number.parseInt(binary.substring(52), 2);
    return { timestamp, workerId, sequence, binary };
  }

  private workerId: bigint;
  private lastTimestamp = -1n;
  private sequence = 0n;

  /**
   * @param workerId - The worker ID (10 bits 0-1023)
   * @param sequence - Optional sequence number (12 bits 0-4095) to override the default sequence
   */
  constructor(workerId: number, sequence = 0) {
    if (workerId < 0 || workerId > Snowflake.MAX_WORKER_ID) {
      throw new Error(
        `Worker ID must be between 0 and ${Snowflake.MAX_WORKER_ID}`
      );
    }
    // Ensure machineId is within 10 bits
    this.workerId = BigInt(workerId);
    this.sequence = BigInt(sequence);
  }

  setWorkerId(workerId: number): void {
    if (workerId < 0 || workerId > Snowflake.MAX_WORKER_ID) {
      throw new Error(
        `Worker ID must be between 0 and ${Snowflake.MAX_WORKER_ID}`
      );
    }
    this.workerId = BigInt(workerId);
  }

  generateBinary(): bigint {
    const [timestamp, sequence] = this.getTimestampAndSequence();

    // Bit shifting and composition of the Snowflake ID
    // [01-41]: Timestamp (ms) - 41 bits
    // [42-51]: Worker ID - 10 bits
    // [52-63]: Sequence - 12 bits
    const timestampPart =
      (timestamp - BigInt(Snowflake.EPOCH)) << Snowflake.TIMESTAMP_SHIFT;
    const workerPart = this.workerId << Snowflake.WORKER_ID_SHIFT;
    return timestampPart | workerPart | sequence;
  }

  getTimestampAndSequence(): [bigint, bigint] {
    let currentTimestamp = BigInt(Date.now());
    if (currentTimestamp < this.lastTimestamp) {
      throw new Error(
        `Clock moved backwards. Refusing to generate id until ${this.lastTimestamp}.`
      );
    }

    if (currentTimestamp === this.lastTimestamp) {
      // Increment and wrap the sequence on the same millisecond (OxFFF=4095)
      this.sequence = (this.sequence + 1n) & Snowflake.MAX_SEQ;
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

  generate(): string {
    return this.generateBinary().toString();
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
