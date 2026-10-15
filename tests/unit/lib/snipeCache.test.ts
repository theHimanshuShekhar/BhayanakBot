import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BhayanakClient, ExpiringBoundedMap, SNIPE_TTL_MS } from "../../../src/lib/BhayanakClient.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");

type Entry = { at: Date; text: string };
const entry = (text: string, ageMs = 0): Entry => ({ text, at: new Date(Date.now() - ageMs) });

describe("ExpiringBoundedMap", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function make(maxSize = 10) {
		return new ExpiringBoundedMap<string, Entry>(maxSize, SNIPE_TTL_MS, (e) => e.at);
	}

	it("keeps the ttl at ten minutes", () => {
		expect(SNIPE_TTL_MS).toBe(10 * 60 * 1000);
	});

	it("returns an entry while it is younger than the ttl", () => {
		const map = make();
		map.set("c1", entry("fresh"));
		vi.advanceTimersByTime(SNIPE_TTL_MS - 1);
		expect(map.get("c1")?.text).toBe("fresh");
	});

	it("returns nothing for an entry at or past the ttl, and removes it from the map", () => {
		const map = make();
		map.set("c1", entry("stale"));
		vi.advanceTimersByTime(SNIPE_TTL_MS);
		expect(map.get("c1")).toBeUndefined();
		expect(map.size).toBe(0);
	});

	it("measures age from the entry's own timestamp", () => {
		const map = make();
		map.set("c1", entry("already old", SNIPE_TTL_MS + 1));
		expect(map.get("c1")).toBeUndefined();
	});

	it("drops expired entries from other channels when something new is written", () => {
		const map = make();
		map.set("old", entry("old"));
		vi.advanceTimersByTime(SNIPE_TTL_MS + 1);
		map.set("new", entry("new"));
		expect([...map.keys()]).toEqual(["new"]);
	});

	it("replacing an entry refreshes its age and position", () => {
		const map = make();
		map.set("c1", entry("first"));
		map.set("c2", entry("second"));
		vi.advanceTimersByTime(SNIPE_TTL_MS - 1000);
		map.set("c1", entry("replacement"));
		vi.advanceTimersByTime(2000);
		expect(map.get("c1")?.text).toBe("replacement");
		expect(map.get("c2")).toBeUndefined();
	});

	it("still evicts the oldest entry when full", () => {
		const map = make(2);
		map.set("a", entry("a"));
		map.set("b", entry("b"));
		map.set("c", entry("c"));
		expect([...map.keys()]).toEqual(["b", "c"]);
	});
});

describe("client snipe caches", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("forget deletes and edits after the shared ttl", async () => {
		const client = new BhayanakClient();
		try {
			vi.useFakeTimers();
			vi.setSystemTime(NOW);
			client.snipeCache.set("c1", {
				content: "x",
				authorId: "a",
				authorTag: "a#1",
				authorAvatar: null,
				deletedAt: new Date(),
			});
			client.editSnipeCache.set("c1", {
				oldContent: "x",
				newContent: "y",
				authorId: "a",
				authorTag: "a#1",
				authorAvatar: null,
				editedAt: new Date(),
			});
			vi.advanceTimersByTime(SNIPE_TTL_MS - 1);
			expect(client.snipeCache.get("c1")).toBeDefined();
			expect(client.editSnipeCache.get("c1")).toBeDefined();
			vi.advanceTimersByTime(1);
			expect(client.snipeCache.get("c1")).toBeUndefined();
			expect(client.editSnipeCache.get("c1")).toBeUndefined();
		} finally {
			await client.destroy();
		}
	});
});
