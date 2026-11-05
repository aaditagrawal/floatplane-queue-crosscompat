# Dependency refresh

The Bun lock selects unimport 6.5.0 within WXT 0.21.4's existing supported range, ^3.13.1 || ^4.0.0 || ^5.0.0 || ^6.0.0. This replaces unimport 3.14.6's fast-glob dependency with tinyglobby and removes the micromatch and braces dependency chain. It resolves this checkout's exposure to [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) by updating the supported dependency graph. Braces itself still has no published fixed release. There is no override, ignored advisory, or removed project tooling.

Bun 1.4.3's targeted transitive update was used: bun update unimport. Version 7 is outside WXT's declared range and was not selected. Validation covers frozen installation and WXT type generation, tsrs, lint, formatting, and default, Firefox, Chrome, and Edge extension builds. There is no project test suite or live Floatplane service test.

# Owned state decoding

`utils/decoders.ts` now validates the saved queue and creator summaries directly. It preserves required fields, optional versus absent fields, nullish storage values, finite numbers, enum membership, unknown-field stripping, and whole-queue rejection. Malformed queues still enter the existing storage-error catch; malformed creator summaries still produce the undefined fallback. Error objects and messages are local `TypeError` values, since neither caller consumes Zod's diagnostic details.

Zod, unused `@types/chrome`, and the redundant `typescript` compiler installation are removed from the manifest and lock. The existing `tsrs --noEmit` compiler and strict configuration remain. WXT's TypeScript peer is optional; its generated browser types supply the extension API declarations. WXT/Vite and their browser lifecycle support remain dependencies. The lock has 206 package entries, down from 229, including removal of TypeScript's 20 optional platform packages.

`bun test` exercises persisted-state compatibility and creator fallbacks, and CI now runs these tests and type checking. A separate generated corpus compared 20,771 results with the original committed Zod schemas. No authenticated Floatplane session or installed-browser interaction was exercised.

The decoder benchmark extracts the actual schemas from commit `6ac5c64f5a1240298a9e588150a1c0cc373b6bf3`. Install the old validator outside the project, then pass its entrypoint:

```sh
baseline_dir=$(mktemp -d)
bun add --cwd "$baseline_dir" zod@4.6.7
bun run benchmark:decoders "$baseline_dir/node_modules/zod/index.js" > decoder-benchmark.json
```

Each workload checks output equivalence before timing. It warms both implementations, alternates execution order across 21 samples, and runs a full collection before each timed batch. Output includes medians, p95, minima, maxima, every sample, iteration counts, and runtime details. `FP_BENCH_SAMPLES=7` selects a shorter repeat. Inputs cover empty storage, minimal and complete video metadata, queues of 1, 25, 100 and 1,000 videos, late/all-invalid entries, invalid storage enums, and valid/string/malformed creators. Timing covers decoding and its consumed error/fallback behavior, excluding module initialization, browser storage I/O, and extension startup.

The independent review run used Bun 1.4.3 on Linux x86_64 with an AMD Ryzen 5 5600G and 12 logical CPUs. The shared gate isolated the benchmark from fleet builds and other benchmarks, and accepted pressure checks before and after it. All 12 workloads had lower candidate medians and p95 values across 21 alternating samples. Earlier measurements under severe contention were discarded.

Times below are microseconds per decode plus consumption of the returned fields. Both implementations use the same consumption code. The JSON output preserves individual samples, minima, maxima and iteration counts.

| Workload                | Zod median | Owned median | Zod p95 | Owned p95 |
| ----------------------- | ---------: | -----------: | ------: | --------: |
| empty storage           |      0.187 |        0.015 |   0.315 |     0.039 |
| one video               |      0.689 |        0.159 |   1.851 |     0.287 |
| minimal queue 25        |      5.262 |        1.629 |   8.102 |     2.644 |
| typical queue 25        |      5.561 |        2.176 |   6.708 |     2.718 |
| default maximum 100     |     21.895 |        8.400 |  27.263 |    11.067 |
| large queue 1000        |    271.418 |       91.718 | 300.292 |   144.191 |
| invalid late entry 100  |     32.008 |        9.608 |  57.791 |    12.751 |
| all invalid entries 100 |     72.199 |        1.469 | 102.330 |     1.908 |
| invalid sort after 25   |      9.683 |        3.081 |  11.322 |     4.418 |
| creator summary         |      0.066 |        0.010 |   0.093 |     0.017 |
| creator string ID       |      0.089 |        0.004 |   0.100 |     0.010 |
| creator malformed       |      0.156 |        0.007 |   0.187 |     0.010 |

These are local measurements of pure decoding under Bun. They do not measure browser-engine-specific execution, cold module initialization, storage I/O, layout, or extension startup. The content-script change adds no DOM, CSS, event, network, or concurrency work. Unused type/compiler package removal adds no executed application paths; no installation or build speedup is claimed.
