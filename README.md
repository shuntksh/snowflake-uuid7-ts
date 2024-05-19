# Snowflake ID / UUIDv7 generator in TypeScript

This TypeScript library provides functionality to generate and decode both [Snowflake IDs](https://en.wikipedia.org/wiki/Snowflake_ID) and [UUIDv7](<https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_7_(timestamp,_counter_and_random)>) identifiers.

It is designed to run in both browser and Node.js (v20 or newer) environments. These methods are suitable for generating k-sorted unique identifiers in distributed systems.

## CLI

This project includes a CLI for generating or decoding Snowflake IDs and UUIDv7s. Decoding Snowflake IDs assumes the EPOCH time is set to the default Twitter EPOCH (1288834974657), corresponding to 2010-11-04 01:42:54.657 UTC.

```bash
# Usage
$ bun run index.ts --help
Usage: bun run [script] [options]
    Options:
      -h, --help          Display this help message and exit.
      -d, --decode <id>   Decode a Snowflake or UUIDv7 ID.
      -u, --uuid          Generate a UUIDv7.
      -s, --snowflake     Generate a Snowflake ID.
      -w, --id <workerId> Set the worker ID for Snowflake ID and offset sequence for UUIDv7. Default is 0.
      -c, --count <count> Specify the number of IDs to generate. Default is 1.

    Description:
      This tool generates unique identifiers using either the Snowflake or UUIDv7 method.
      - The UUIDv7 option provides a universally unique identifier.
      - The Snowflake ID is a custom method that can be beneficial for distributed systems,
        where the worker ID helps in identifying the source of the ID.

    Examples:
      node script.js --uuid            Generate a single UUIDv7.
      node script.js --snowflake -c 5  Generate 5 Snowflake IDs.
      node script.js -w 1 -s -c 10     Generate 10 Snowflake IDs with worker ID 1.

# Generate a Snowflake ID
$ bun run index.ts --snowflake --id 123 --count 5
1792041824068567040
1792041824068567041
1792041824068567042
1792041824068567043
1792041824068567044

# Decode the Snowflake ID
$ bun run index.ts --decode 1792052704567603201 | jq
{
  "timestamp": 1716093634155,
  "date": "2024-05-19T04:40:34.155Z",
  "id": 123,
  "sequence": 1
}

# Generate a UUIDv7
$ bun run index.ts --uuid -c 5 -w 5
018f918f-b46f-7005-9031-342c463e1978
018f918f-b470-7005-b374-e58e4d09ba4b
018f918f-b470-7006-91d9-2a0474baf822
018f918f-b470-7007-933d-1c5abb2f4ada
018f918f-b470-7008-955e-14e1b2fcb207

# Decode the UUIDv7
$ bun run index.ts --decode 018f918f-b470-7006-91d9-2a0474baf822 | jq
{
  "version": 7,
  "variant": 2,
  "timestamp": 1716134065264,
  "date": "2024-05-19T15:54:25.264Z",
  "randA": "6", # 6 is the sequence number (+5 offset)
  "randB": "1286105367217633314"
}
```

## Snowflake ID

Snowflake ID is a 63-bit identifier comprising:

- 41 bits timestamp (milliseconds since a specific epoch)
- 10 bits worker ID (optionally split into 5 bits for datacenter and 5 bits for worker)
- 12 bits sequence number (allowing generation of up to 4096 IDs per millisecond window)

It's important to note that the timestamp is 41 bits and requires adding a known EPOCH time. The default EPOCH time in this implementation is Twitter's original EPOCH (1288834974657), corresponding to 2010-11-04 01:42:54.657 UTC.

Snowflake ID generation is monotonic and uses a synchronous loop to handle sequence number overflows.

```typescript
import { Snowflake } from "./snowflake";
const snowflake = new Snowflake();
const id = snowflake.generate(); // -> 1234567890123456789
const { timestamp } = Snowflake.parse(id);
```

## UUIDv7

UUIDv7 is a 128-bit identifier defined in [RFC-9562](https://tools.ietf.org/html/rfc9562) with the following structure:

- 48 bits Unix Epoch timestamp (milliseconds)
- 4 bits for the version number (7)
- 12 bits for random value or additional timestamp resolution (this implementation uses this section to store a sequence number)
- 2 bits variant (0b10)
- 62 bits for random value

UUIDv7 generation utilizes `crypto.getRandomValues` for randomness, with the timestamp encoded as a 48-bit value derived from `Date.now()`. Notably, `Date.now()` returns a millisecond-precision timestamp, which is inherently 41 bits long. This does not fully utilize the 48-bit epoch field, nor does it provide the additional 12 bits reserved for nanosecond precision. We use the additional 12 bits to store a sequence number with additional offset value to keep the UUID k-sorted.

This level of precision is generally sufficient for ID generation in browser applications, but it's important to be aware of these limitations.

For applications requiring higher resolution, one might consider using `performance.now()` which offers microsecond resolution. This can help to fill more of the timestamp field, potentially enhancing the uniqueness and temporal accuracy of the UUIDv7, especially in environments with high ID generation rates or specific precision requirements.

```typescript
import { UUIDv7 } from "./uuidv7";
const uuid = new UUIDv7();
const id = uuid.generate(); // -> 12345678-1234-7xxx-xxxx-xxxxxxxxxxxx
const { timestamp } = UUIDv7.parse(id);
```

Per RFC, UUIDs should be handled as strings but if space is concern binary values can be used for persistence.

```typescript
// UUID as binary (64bit left, 64bit right)
const [left, right] = UUIDv7.toBinary(id); // returns [bigint, bigint]
```
