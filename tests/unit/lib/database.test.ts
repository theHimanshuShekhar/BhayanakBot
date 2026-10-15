import { describe, expect, it } from "vitest";
import { buildPoolConfig } from "../../../src/lib/database.js";

describe("buildPoolConfig", () => {
	it("fails fast on connect, cuts off runaway queries, and names the application", () => {
		const config = buildPoolConfig("postgresql://example/db");

		expect(config.connectionString).toBe("postgresql://example/db");
		expect(config.application_name).toBe("bhayanakbot");
		expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
		expect(config.idleTimeoutMillis).toBeGreaterThan(0);
		expect(config.statement_timeout).toBeGreaterThan(0);
	});

	it("keeps the statement timeout above the slowest expected personality and archive queries", () => {
		expect(buildPoolConfig("postgresql://example/db").statement_timeout).toBeGreaterThanOrEqual(30_000);
	});

	it("pins every connection to UTC", () => {
		expect(buildPoolConfig("postgresql://example/db").options).toContain("TimeZone=UTC");
	});
});
