// Example: Demonstrates CLI-style partial JSON streaming behavior
//
// Run:
//   npm run build
//   npx tsx examples/streaming-json/run.ts

import { createJsonStreamer } from "../../src/cli/stream.js";

const streamer = createJsonStreamer((line) => {
	process.stdout.write(line);
});

const deltas = ["Here is the output: ", "{", '"status": "ok", ', '"items": [', "1", ", 2", "]", "}"];

for (const delta of deltas) {
	process.stderr.write(`delta: ${JSON.stringify(delta)}\n`);
	streamer.handleDelta(delta);
}

process.stderr.write("done\n");
