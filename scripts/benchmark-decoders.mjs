import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decodeCreatorSummary, decodeQueueStorage } from "../utils/decoders.ts";

// Use an external baseline installation; the shipped project does not depend on Zod.
// bun scripts/benchmark-decoders.mjs /path/to/zod/index.js [baseline-commit]
function queueCandidate(input) {
  try {
    return decodeQueueStorage(input);
  } catch {
    return;
  }
}

function consumeQueue(value) {
  if (value === undefined) return 0;
  const queue = value.fp_queue ?? [];
  let size = queue.length + (value.fp_queue_index ?? -1);
  for (const video of queue) {
    size += video.id.length + video.title.length + video.url.length + video.thumbnail.length;
    size += video.duration.length + video.durationSeconds + (video.progress ?? 0);
    size += (video.subchannel?.length ?? 0) + (video.creatorId?.length ?? 0);
    size += (video.creatorName?.length ?? 0) + (video.releaseDate?.length ?? 0);
    size += video.attachmentId?.length ?? 0;
  }
  return (
    size +
    (value.fp_queue_sort?.length ?? 0) +
    (value.fp_queue_repeat?.length ?? 0) +
    (value.fp_queue_shuffle ? 1 : 0)
  );
}

function consumeCreator(value) {
  return value === undefined ? 0 : value.id.length + value.title.length;
}

function distribution(samples) {
  const sorted = samples.toSorted((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
    samples,
  };
}

const zodPath = process.argv[2];
if (!zodPath) throw new Error("Pass the index.js path of an external Zod 4.6.7 installation");
const baseline = process.argv[3] ?? "6ac5c64f5a1240298a9e588150a1c0cc373b6bf3";
const revision = Bun.spawnSync(["git", "show", `${baseline}:entrypoints/content.ts`]);
if (revision.exitCode !== 0) throw new Error(revision.stderr.toString());
const source = revision.stdout.toString();
const definitions = source.slice(
  source.indexOf("const queueVideoSchema"),
  source.indexOf("export default"),
);
assert.ok(
  definitions.includes("const creatorSummarySchema"),
  "Expected the baseline validation schemas",
);
const directory = await mkdtemp(join(tmpdir(), "floatplane-decoder-benchmark-"));

try {
  const baselinePath = join(directory, "baseline.mjs");
  await writeFile(
    baselinePath,
    `import { z } from ${JSON.stringify(pathToFileURL(resolve(zodPath)).href)};\n${definitions}\nexport { queueStorageSchema, creatorSummarySchema };\n`,
  );
  const { queueStorageSchema, creatorSummarySchema } = await import(
    pathToFileURL(baselinePath).href
  );
  const metadata = JSON.parse(await readFile(join(resolve(zodPath), "..", "package.json"), "utf8"));
  assert.equal(metadata.version, "4.6.7", "Use the committed Zod version");

  const video = {
    id: "post-1",
    title: "A realistic saved queue entry",
    url: "https://www.floatplane.com/post/post-1",
    thumbnail: "https://example.com/thumb.png",
    duration: "12:34",
    durationSeconds: 754,
    subchannel: "Channel",
    creatorId: "creator-1",
    creatorName: "Creator",
    releaseDate: "2026-10-01T12:00:00.000Z",
    progress: 123.4,
    attachmentId: "video-1",
  };
  function storage(size) {
    return {
      fp_queue: Array.from({ length: size }, (_, index) => ({ ...video, id: `post-${index}` })),
      fp_queue_index: size ? 0 : -1,
      fp_queue_sort: "manual",
      fp_queue_repeat: "none",
      fp_queue_shuffle: false,
    };
  }
  const invalidLate = storage(100);
  invalidLate.fp_queue[99].durationSeconds = Infinity;
  const invalidAll = storage(100);
  for (const entry of invalidAll.fp_queue) entry.id = null;
  const invalidSort = { ...storage(25), fp_queue_sort: "invalid" };
  const minimalQueue = storage(25);
  minimalQueue.fp_queue = minimalQueue.fp_queue.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    thumbnail: entry.thumbnail,
    duration: entry.duration,
    durationSeconds: entry.durationSeconds,
  }));
  const cases = [
    ["empty storage", {}],
    ["one video", storage(1)],
    ["minimal queue 25", minimalQueue],
    ["typical queue 25", storage(25)],
    ["default maximum 100", storage(100)],
    ["large queue 1000", storage(1000)],
    ["invalid late entry 100", invalidLate],
    ["all invalid entries 100", invalidAll],
    ["invalid sort after 25", invalidSort],
  ];
  function queueBaseline(input) {
    try {
      return queueStorageSchema.parse(input);
    } catch {
      return;
    }
  }
  function creatorBaseline(input) {
    const result = creatorSummarySchema.safeParse(input);
    return result.success ? result.data : undefined;
  }
  const workloads = cases.map(([name, input]) => ({
    name,
    input,
    old: queueBaseline,
    next: queueCandidate,
    consume: consumeQueue,
  }));
  for (const [name, input] of [
    ["creator summary", { id: "creator-1", title: "Creator", ignored: true }],
    ["creator string ID", "creator-1"],
    ["creator malformed", { id: null, title: 42 }],
  ])
    workloads.push({
      name,
      input,
      old: creatorBaseline,
      next: decodeCreatorSummary,
      consume: consumeCreator,
    });

  const sampleCount = Number(process.env.FP_BENCH_SAMPLES ?? 21);
  assert.ok(Number.isInteger(sampleCount) && sampleCount >= 7);
  let checksum = 0;
  function batch(run, input, iterations, consume) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) checksum += consume(run(input));
    return ((performance.now() - start) * 1e6) / iterations;
  }
  const results = [];
  for (const workload of workloads) {
    assert.deepStrictEqual(
      workload.next(workload.input),
      workload.old(workload.input),
      workload.name,
    );
    for (let i = 0; i < 3; i++) {
      batch(workload.old, workload.input, 100, workload.consume);
      batch(workload.next, workload.input, 100, workload.consume);
    }
    const estimate = Math.max(
      batch(workload.old, workload.input, 100, workload.consume),
      batch(workload.next, workload.input, 100, workload.consume),
    );
    const iterations = Math.min(100000, Math.max(20, Math.ceil(15e6 / estimate)));
    const samples = { old: [], next: [] };
    for (let sample = 0; sample < sampleCount; sample++) {
      for (const key of sample % 2 ? ["next", "old"] : ["old", "next"]) {
        Bun.gc(true);
        samples[key].push(batch(workload[key], workload.input, iterations, workload.consume));
      }
    }
    const old = distribution(samples.old);
    const next = distribution(samples.next);
    results.push({
      name: workload.name,
      iterations,
      unit: "ns/op",
      baseline: old,
      candidate: next,
      medianRatio: next.median / old.median,
    });
  }
  console.log(
    JSON.stringify(
      {
        runtime: `Bun ${Bun.version}`,
        executable: process.execPath,
        platform: process.platform,
        arch: process.arch,
        baseline,
        zod: metadata.version,
        warmupBatches: 3,
        sampleCount,
        order: "alternating baseline/candidate",
        explicitGc: "before each timed batch, excluded from elapsed time",
        checksum,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
