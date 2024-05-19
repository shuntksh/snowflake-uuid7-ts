# Snowflake ID / UUIDv7 generator in TypeScript

This is a simple [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID) / [UUIDv7](<https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_7_(timestamp,_counter_and_random)>) generator written in TypeScript that is intended to run on browser and Node.js (v20 or newer) environments. Both can be used to generate monotonic unique identifiers.

## Snowflake ID

Snowflake ID is a 63-bit unique identifier that is composed of:

- 41 bits timestamp in milliseconds since epoch
- 10 bits worker ID (can be 5 bits for datacenter ID and 5 bits for worker ID)
- 12 bits sequence number (can generate 4096 unique IDs per millisecond)

Note that the timestmap is 41 bits long which requires to add a known EPOCH time to the timestamp. The default EPOCH time in this implementation uses the original Twitter EPOCH time (1288834974657) which is 2010-11-04 01:42:54.657 UTC.

This implementation uses synchronous loop to wait for the next millisecond if the sequence number overflows.

It is important to note that the Snowflake ID is not a random ID per se, but a unique identifier that is generated in a monotonic way. Assuming this is a timestamp with a worker ID encoded to allow distributed generation of unique IDs.

```typescript
import { Snowflake } from "./snowflake";
const snowflake = new Snowflake();
const id = snowflake.generate(); // -> 1234567890123456789
const { timestamp } = snowflake.parse(id);
```

## UUIDv7

UUIDv7 is a 128-bit unique identifier defined in [RFC-9562](https://tools.ietf.org/html/rfc9562) that is composed of:

- 48 bits Unix Epoch timestamp in milliseconds
- 4 bits for the version number (7) of the UUID (0b0111)
- 12bits for random value (or additional timestamp resolution)
- 2 bits variant (0b10)
- 62 bits for random value

The implementation uses the `crypto.getRandomValues` to generate the random bits and the timestamp is encoded as a 48-bit value from `Date.now` which returns millisecond resolution timestamp. The UUIDv7 is generated in a synchronous way.

```typescript
import { UUIDv7 } from "./uuidv7";

const uuid = new UUIDv7();
const id = uuid.generate(); // -> 12345678-1234-7xxx-xxxx-xxxxxxxxxxxx
const { timestamp } = uuid.parse(id);
```

The RFC recommends to use UUID as is, but for persistence storage, one might choose to store the UUID as a string or a binary value which is 128 bits long.

```typescript
// UUID as binary (64bit left, 64bit right)
const [left, right] = uuid.toBinary(id); // returns [bigint, bigint]
```
