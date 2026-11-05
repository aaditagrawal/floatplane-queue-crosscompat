import { describe, expect, test } from "bun:test";
import { decodeCreatorSummary, decodeQueueStorage } from "./decoders";

const video = {
  id: "post-1",
  title: "A video",
  url: "https://www.floatplane.com/post/post-1",
  thumbnail: "thumbnail.png",
  duration: "1:30",
  durationSeconds: 90,
};
const optionalStrings = ["subchannel", "creatorId", "creatorName", "releaseDate", "attachmentId"];
const nonStrings = [null, 0, false, {}, [], NaN, 1n, Symbol("field")];
const nonNumbers = [null, "1", false, {}, [], NaN, Infinity, -Infinity, 1n];

describe("persisted queue decoding", () => {
  test("copies known fields without mutating or retaining untrusted fields", () => {
    const input = {
      fp_queue: [{ ...video, creatorId: "creator", progress: 15, extra: "discard" }],
      fp_queue_index: 0,
      fp_queue_sort: "newest",
      fp_queue_repeat: "all",
      fp_queue_shuffle: true,
      extra: "discard",
    };
    const output = decodeQueueStorage(input);
    expect(output).toStrictEqual({
      fp_queue: [{ ...video, creatorId: "creator", progress: 15 }],
      fp_queue_index: 0,
      fp_queue_sort: "newest",
      fp_queue_repeat: "all",
      fp_queue_shuffle: true,
    });
    expect(input.fp_queue[0].extra).toBe("discard");
    expect(output.fp_queue).not.toBe(input.fp_queue);
    expect(output.fp_queue[0]).not.toBe(input.fp_queue[0]);
  });

  test("preserves absent, explicit undefined, and allowed nullish values", () => {
    expect(decodeQueueStorage({})).toStrictEqual({});
    for (const field of ["fp_queue", "fp_queue_index", "fp_queue_sort", "fp_queue_repeat"]) {
      expect(decodeQueueStorage({ [field]: undefined })).toStrictEqual({ [field]: undefined });
      expect(decodeQueueStorage({ [field]: null })).toStrictEqual({ [field]: null });
    }
    expect(decodeQueueStorage({ fp_queue_shuffle: undefined })).toStrictEqual({
      fp_queue_shuffle: undefined,
    });
    for (const field of [...optionalStrings, "progress"]) {
      expect(decodeQueueStorage({ fp_queue: [{ ...video, [field]: undefined }] })).toStrictEqual({
        fp_queue: [{ ...video, [field]: undefined }],
      });
    }
    // These are the unchanged defaults applied by loadQueue in the content script.
    const empty = decodeQueueStorage({});
    expect(empty.fp_queue ?? []).toEqual([]);
    expect(empty.fp_queue_index ?? -1).toBe(-1);
    expect(empty.fp_queue_sort ?? "manual").toBe("manual");
    expect(empty.fp_queue_repeat ?? "none").toBe("none");
    expect(empty.fp_queue_shuffle === true).toBe(false);
  });

  test("requires every video field and validates optional strings without coercion", () => {
    for (const field of Object.keys(video)) {
      const missing = { ...video };
      delete missing[field];
      expect(() => decodeQueueStorage({ fp_queue: [missing] })).toThrow(TypeError);
    }
    for (const field of ["id", "title", "url", "thumbnail", "duration", ...optionalStrings]) {
      for (const invalid of nonStrings) {
        expect(() => decodeQueueStorage({ fp_queue: [{ ...video, [field]: invalid }] })).toThrow(
          TypeError,
        );
      }
    }
    for (const field of optionalStrings) {
      expect(decodeQueueStorage({ fp_queue: [{ ...video, [field]: "" }] }).fp_queue[0][field]).toBe(
        "",
      );
    }
    // Stored URL/duration strings have never had format restrictions.
    expect(
      decodeQueueStorage({ fp_queue: [{ ...video, url: "", thumbnail: "", duration: "" }] })
        .fp_queue,
    ).toEqual([{ ...video, url: "", thumbnail: "", duration: "" }]);
  });

  test("accepts finite fractional/negative numbers and rejects invalid numbers", () => {
    for (const number of [-1, -0, 0, 0.5, Number.MAX_VALUE]) {
      const input = {
        fp_queue: [{ ...video, durationSeconds: number, progress: number }],
        fp_queue_index: number,
      };
      expect(decodeQueueStorage(input)).toStrictEqual(input);
    }
    for (const invalid of [...nonNumbers, undefined]) {
      expect(() =>
        decodeQueueStorage({ fp_queue: [{ ...video, durationSeconds: invalid }] }),
      ).toThrow(TypeError);
    }
    for (const invalid of nonNumbers) {
      expect(() => decodeQueueStorage({ fp_queue: [{ ...video, progress: invalid }] })).toThrow(
        TypeError,
      );
      if (invalid !== null) {
        expect(() => decodeQueueStorage({ fp_queue_index: invalid })).toThrow(TypeError);
      }
    }
  });

  test("accepts only supported sort/repeat values and boolean shuffle flags", () => {
    for (const sort of [
      "manual",
      "newest",
      "oldest",
      "duration-asc",
      "duration-desc",
      "title-asc",
      "title-desc",
    ]) {
      expect(decodeQueueStorage({ fp_queue_sort: sort })).toEqual({ fp_queue_sort: sort });
    }
    for (const repeat of ["none", "one", "all"]) {
      expect(decodeQueueStorage({ fp_queue_repeat: repeat })).toEqual({ fp_queue_repeat: repeat });
    }
    for (const field of ["fp_queue_sort", "fp_queue_repeat"]) {
      for (const invalid of ["", "unknown", 0, true, {}, []]) {
        expect(() => decodeQueueStorage({ [field]: invalid })).toThrow(TypeError);
      }
    }
    for (const shuffle of [true, false]) {
      expect(decodeQueueStorage({ fp_queue_shuffle: shuffle })).toEqual({
        fp_queue_shuffle: shuffle,
      });
    }
    for (const invalid of [null, 0, 1, "true", {}, []]) {
      expect(() => decodeQueueStorage({ fp_queue_shuffle: invalid })).toThrow(TypeError);
    }
  });

  test("rejects malformed envelopes and entire queues, including sparse arrays", () => {
    for (const invalid of [null, undefined, [], 0, "queue", true, () => {}]) {
      expect(() => decodeQueueStorage(invalid)).toThrow(TypeError);
    }
    for (const invalid of [0, "queue", true, {}, [null], [video, {}], Array(1)]) {
      expect(() => decodeQueueStorage({ fp_queue: invalid })).toThrow(TypeError);
    }
    expect(() => decodeQueueStorage({ fp_queue: [video], fp_queue_sort: "invalid" })).toThrow(
      TypeError,
    );
  });

  test("copies inherited known fields while ignoring prototype/unknown keys", () => {
    const inherited = Object.create({ ...video, creatorName: undefined });
    const input = Object.create({ fp_queue: [inherited], fp_queue_index: 2 });
    expect(decodeQueueStorage(input)).toStrictEqual({
      fp_queue: [{ ...video, creatorName: undefined }],
      fp_queue_index: 2,
    });
    const untrusted = JSON.parse('{"__proto__":{"polluted":true},"fp_queue":[]}');
    expect(decodeQueueStorage(untrusted)).toStrictEqual({ fp_queue: [] });
    expect(Object.getPrototypeOf(decodeQueueStorage(untrusted))).toBe(Object.prototype);
  });
});

describe("creator summary decoding", () => {
  test("copies only string id/title fields", () => {
    const input = { id: "creator", title: "Creator", extra: "discard" };
    expect(decodeCreatorSummary(input)).toStrictEqual({ id: "creator", title: "Creator" });
    expect(decodeCreatorSummary(input)).not.toBe(input);
    expect(decodeCreatorSummary({ id: "", title: "" })).toStrictEqual({ id: "", title: "" });
    expect(decodeCreatorSummary(Object.create(input))).toStrictEqual({
      id: "creator",
      title: "Creator",
    });
  });

  test("returns the existing undefined fallback for IDs or malformed summaries", () => {
    for (const invalid of [undefined, null, "creator-id", 0, false, [], {}, () => {}]) {
      expect(decodeCreatorSummary(invalid)).toBeUndefined();
    }
    for (const field of ["id", "title"]) {
      for (const invalid of [...nonStrings, undefined]) {
        expect(
          decodeCreatorSummary({ id: "creator", title: "Creator", [field]: invalid }),
        ).toBeUndefined();
      }
    }
  });
});
