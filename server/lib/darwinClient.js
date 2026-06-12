/**
 * Darwin Real Time Train Information (push port) via the Rail Data Marketplace
 * Kafka stream.
 *
 * RDM serves Darwin over Kafka only — SASL_SSL with the PLAIN mechanism, where
 * username/password are the subscription's "consumer key" / "consumer secret".
 * There is NO STOMP/XML option on the marketplace (that was the legacy National
 * Rail feed). Message values are UTF-8 JSON; the Darwin Pport message itself is
 * nested as a JSON *string* under the envelope's `bytes` field. Reference
 * client: https://github.com/raildatamarketplace/rdm-darwin-kafka-client
 *
 * `kafkajs` is imported lazily (same pattern as stompit in stompClient.js) so
 * the server still runs without it installed. Decoding is deliberately
 * defensive — gzip, base64-in-`bytes` and raw-XML payloads are detected and
 * surfaced rather than silently dropped, because the exact envelope can vary
 * by product version and we refine from the user's first live run.
 */
import { gunzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = join(DIR, "..", "data", "darwinSamples");

let warnedXml = false;

/** Kafka value buffer → inner Darwin message object (or null if undecodable). */
export function decodeDarwinValue(buf) {
  if (!buf || !buf.length) return null;
  let bytes = buf;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = gunzipSync(bytes);
    } catch {
      return null;
    }
  }
  const text = bytes.toString("utf8").trim();
  if (text.startsWith("<")) {
    if (!warnedXml) {
      warnedXml = true;
      console.error(
        "[darwin] messages are raw XML, not the expected JSON envelope — " +
          "set DARWIN_DEBUG=1, send a sample from data/darwinSamples/, and we'll add an XML parser",
      );
    }
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  // Unwrap the RDM envelope: the Darwin message is a JSON string (occasionally
  // base64-wrapped) under `bytes`. Loop in case of double wrapping.
  for (let hops = 0; obj && typeof obj === "object" && typeof obj.bytes === "string" && hops < 3; hops++) {
    const inner = obj.bytes.trim();
    try {
      obj = JSON.parse(inner);
      continue;
    } catch {
      /* not plain JSON — try base64 below */
    }
    try {
      const decoded = Buffer.from(inner, "base64").toString("utf8").trim();
      if (decoded.startsWith("{") || decoded.startsWith("[")) {
        obj = JSON.parse(decoded);
        continue;
      }
    } catch {
      /* fall through */
    }
    break;
  }
  return obj && typeof obj === "object" ? obj : null;
}

/** Save a handful of raw messages so the real wire format can be inspected. */
function makeSampler() {
  let generic = 0;
  const seenTypes = new Set();
  return (raw) => {
    try {
      const text = raw.toString("utf8");
      let name = null;
      for (const type of ["scheduleFormations", "formationLoading", "deactivated"]) {
        if (text.includes(type) && !seenTypes.has(type)) {
          seenTypes.add(type);
          name = `sample-${type}.json`;
          break;
        }
      }
      if (!name && generic < 5) name = `sample-${generic++}.json`;
      if (!name) return;
      mkdirSync(SAMPLE_DIR, { recursive: true });
      writeFileSync(join(SAMPLE_DIR, name), text);
    } catch {
      /* sampling must never break the feed */
    }
  };
}

/**
 * Connect and stream decoded Darwin messages to `onMessage(innerOrNull)`.
 * Pass null for undecodable values so the caller can count them.
 */
export async function startDarwin({
  brokers,
  username,
  password,
  topic,
  groupId,
  fromBeginning = false,
  mechanism = "plain",
  debug = false,
  onMessage,
}) {
  let kafkajs;
  try {
    kafkajs = await import("kafkajs");
  } catch {
    console.error("[darwin] 'kafkajs' is not installed. Run: cd server && npm install");
    return;
  }
  const { Kafka, logLevel } = kafkajs;

  // kafkajs logs multi-line JSON for every retry; compress to one-liners and
  // print each distinct message at most every 30s (retry storms repeat fast).
  const logSeen = new Map();
  const kafka = new Kafka({
    clientId: "exeter-train-map",
    brokers,
    ssl: true,
    sasl: { mechanism, username, password },
    logLevel: logLevel.ERROR,
    logCreator:
      () =>
      ({ namespace, log }) => {
        const line = `${namespace}: ${log.message}`;
        const now = Date.now();
        if (now - (logSeen.get(line) || 0) < 30000) return;
        if (logSeen.size > 50) logSeen.clear();
        logSeen.set(line, now);
        console.error(`[darwin] kafka ${line}`);
      },
  });
  const consumer = kafka.consumer({ groupId, sessionTimeout: 30000 });
  const sample = debug ? makeSampler() : null;
  let messages = 0;

  consumer.on(consumer.events.CRASH, ({ payload }) => {
    const err = payload?.error?.message || "unknown error";
    console.error(`[darwin] consumer crashed: ${err}`);
    if (!payload?.restart) {
      console.error("[darwin] not auto-restarting — check DARWIN_* credentials/topic. Reconnecting in 30s");
      setTimeout(() => run().catch(() => {}), 30000).unref?.();
    }
  });

  const run = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning });
    console.log(`[darwin] connected ✓  consuming ${topic} (group ${groupId}, from ${fromBeginning ? "earliest" : "latest"})`);
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (messages === 0) console.log("[darwin] receiving messages ✓");
        messages++;
        if (sample) sample(message.value);
        onMessage(decodeDarwinValue(message.value));
      },
    });
  };

  try {
    await run();
  } catch (e) {
    console.error(`[darwin] connect failed: ${e.message} — retrying in 30s`);
    console.error("[darwin] (check DARWIN_BROKERS / DARWIN_USERNAME / DARWIN_PASSWORD / DARWIN_TOPIC)");
    setTimeout(() => run().catch((err) => console.error(`[darwin] retry failed: ${err.message}`)), 30000).unref?.();
  }
}
