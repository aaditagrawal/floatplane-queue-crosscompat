import type { QueueVideo, RepeatMode, SortOrder } from "./types";

interface StoredQueue {
  fp_queue?: QueueVideo[] | null;
  fp_queue_index?: number | null;
  fp_queue_sort?: SortOrder | null;
  fp_queue_repeat?: RepeatMode | null;
  fp_queue_shuffle?: boolean;
}

interface CreatorSummary {
  id: string;
  title: string;
}

// These helpers validate untrusted storage/API input before constructing domain values.
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- This boundary guard exposes fields only for subsequent validation.
function isRecord(value: unknown): value is Record<string, unknown> {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Reject non-object boundary input before reading fields.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Decode a required string field at the boundary.
function decodeString(value: unknown): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the field without coercion.
  if (typeof value !== "string") throw new TypeError("Expected a string");
  return value;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Decode a finite numeric field at the boundary.
function decodeNumber(value: unknown): number {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the field without accepting NaN or infinities.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Expected a finite number");
  }
  return value;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Decode each stored queue entry before it reaches the queue model.
function decodeQueueVideo(value: unknown): QueueVideo {
  if (!isRecord(value)) throw new TypeError("Expected a queue video");
  const video: QueueVideo = {
    id: decodeString(value.id),
    title: decodeString(value.title),
    url: decodeString(value.url),
    thumbnail: decodeString(value.thumbnail),
    duration: decodeString(value.duration),
    durationSeconds: decodeNumber(value.durationSeconds),
  };
  // SAFETY: The immutable literal list contains only optional string keys of QueueVideo.
  const stringKeys = [
    "subchannel",
    "creatorId",
    "creatorName",
    "releaseDate",
    "attachmentId",
  ] as const;
  for (const key of stringKeys) {
    if (key in value) {
      video[key] = value[key] === undefined ? undefined : decodeString(value[key]);
    }
  }
  if ("progress" in value) {
    video.progress = value.progress === undefined ? undefined : decodeNumber(value.progress);
  }
  return video;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Validate the persisted enum at the storage boundary.
function decodeSortOrder(value: unknown): SortOrder {
  switch (value) {
    case "manual":
    case "newest":
    case "oldest":
    case "duration-asc":
    case "duration-desc":
    case "title-asc":
    case "title-desc":
      return value;
    default:
      throw new TypeError("Invalid queue sort order");
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Validate the persisted enum at the storage boundary.
function decodeRepeatMode(value: unknown): RepeatMode {
  switch (value) {
    case "none":
    case "one":
    case "all":
      return value;
    default:
      throw new TypeError("Invalid queue repeat mode");
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Browser storage is untrusted input; reject the entire envelope on any malformed field.
export function decodeQueueStorage(value: unknown): StoredQueue {
  if (!isRecord(value)) throw new TypeError("Expected queue storage");
  const stored: StoredQueue = {};
  if ("fp_queue" in value) {
    const queue = value.fp_queue;
    if (queue === null || queue === undefined) stored.fp_queue = queue;
    else {
      if (!Array.isArray(queue)) throw new TypeError("Expected a queue array");
      // Array.from also checks sparse entries instead of silently skipping holes.
      stored.fp_queue = Array.from(queue, decodeQueueVideo);
    }
  }
  if ("fp_queue_index" in value) {
    const index = value.fp_queue_index;
    stored.fp_queue_index = index === null || index === undefined ? index : decodeNumber(index);
  }
  if ("fp_queue_sort" in value) {
    const sort = value.fp_queue_sort;
    stored.fp_queue_sort = sort === null || sort === undefined ? sort : decodeSortOrder(sort);
  }
  if ("fp_queue_repeat" in value) {
    const repeat = value.fp_queue_repeat;
    stored.fp_queue_repeat =
      repeat === null || repeat === undefined ? repeat : decodeRepeatMode(repeat);
  }
  if ("fp_queue_shuffle" in value) {
    const shuffle = value.fp_queue_shuffle;
    if (shuffle !== undefined && shuffle !== true && shuffle !== false) {
      throw new TypeError("Expected a shuffle boolean");
    }
    stored.fp_queue_shuffle = shuffle;
  }
  return stored;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- API creators may be string IDs or malformed objects; only expose validated summaries.
export function decodeCreatorSummary(value: unknown): CreatorSummary | undefined {
  if (!isRecord(value)) return undefined;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate both required fields before constructing the summary.
  if (typeof value.id !== "string" || typeof value.title !== "string") return undefined;
  return { id: value.id, title: value.title };
}
