import { Snowflake } from "./src/snowflake";
import { UUIDv7 } from "./src/uuid7";

export { Snowflake, UUIDv7 };

if (import.meta.main) {
  const usage = `Usage: bun run [script] [options]
    Options:
      -h, --help          Display this help message and exit.
      -u, --uuid          Generate a UUIDv7.
      -s, --snowflake     Generate a Snowflake ID.
      -w, --id <workerId> Set the worker ID for Snowflake ID generation. Default is 0.
      -c, --count <count> Specify the number of IDs to generate. Default is 1.
    
    Description:
      This tool generates unique identifiers using either the Snowflake or UUIDv7 method.
      - The UUIDv7 option provides a universally unique identifier.
      - The Snowflake ID is a custom method that can be beneficial for distributed systems,
        where the worker ID helps in identifying the source of the ID.
    
    Examples:
      node script.js --uuid            Generate a single UUIDv7.
      node script.js --snowflake -c 5  Generate 5 Snowflake IDs.
      node script.js -w 1 -s -c 10     Generate 10 Snowflake IDs with worker ID 1.`;

  const args = [...(Bun?.argv || [])].slice(2) as string[];
  const flag = {
    uuid: false,
    snowflake: false,
    workerId: 0,
    count: 1,
    decode: false,
    value: "",
  };
  while (args.length) {
    const arg = args.shift();
    switch (arg) {
      case "--decode":
      case "-d":
        flag.decode = true;
        flag.value = args.shift() || "";
        if (!flag.value) {
          console.log("No value provided for decoding.");
          console.log(usage);
          process.exit(1);
        }
        break;
      case "--uuid":
      case "-u":
        flag.uuid = true;
        break;
      case "--snowflake":
      case "-s":
        flag.snowflake = true;
        break;
      case "--id":
      case "-w":
        flag.workerId = parseInt(args.shift() || "0", 10);
        break;
      case "--count":
      case "-c":
        flag.count = parseInt(args.shift() || "1", 10);
        break;
      case "--help":
      case "-h":
        console.log(usage);
        process.exit(0);
      default:
        console.log(`Unknown argument: ${arg}`);
        console.log(usage);
        process.exit(1);
    }
  }
  const uuid = new UUIDv7(flag.workerId);
  const snowflake = new Snowflake(flag.workerId);

  if (flag.decode && flag.value) {
    try {
      if (UUIDv7.isValid(flag.value)) {
        const { timestamp, version, variant, worker, sequence, randA, randB } =
          UUIDv7.parse(flag.value);
        console.log(
          JSON.stringify({
            version,
            variant,
            timestamp,
            date: new Date(timestamp),
            id: worker,
            sequence,
            randA,
            randB,
          })
        );
      } else if (Snowflake.isValid(flag.value)) {
        const { timestamp, workerId, sequence } = Snowflake.parse(flag.value);
        console.log(
          JSON.stringify({
            timestamp,
            date: new Date(timestamp),
            id: workerId,
            sequence,
          })
        );
      } else {
        console.log("Invalid UUIDv7 or Snowflake ID.");
        process.exit(1);
      }
    } catch (error) {
      console.log(error);
      process.exit(1);
    }
    process.exit(0);
  }

  flag.count = Math.min(Math.max(flag.count, 1), 1000);
  if (!flag.uuid && !flag.snowflake) flag.uuid = true;

  for (let i = 0; i < flag.count; i++) {
    if (flag.uuid) console.log(uuid.generate());
    if (flag.snowflake) console.log(snowflake.generate());
  }
}
