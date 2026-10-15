import { describe, expect, it } from "vitest";
import { isDashboardRequestAuthorized } from "../../../web/src/lib/dashboardAuth.js";

describe("isDashboardRequestAuthorized", () => {
	const token = "s3cret-token";

	it("accepts the correct bearer token", () => {
		expect(isDashboardRequestAuthorized(`Bearer ${token}`, token)).toBe(true);
	});

	it("accepts a case-insensitive scheme", () => {
		expect(isDashboardRequestAuthorized(`bearer ${token}`, token)).toBe(true);
	});

	it("rejects a wrong token, including ones of a different length or a prefix of the real one", () => {
		expect(isDashboardRequestAuthorized("Bearer nope", token)).toBe(false);
		expect(isDashboardRequestAuthorized(`Bearer ${token}x`, token)).toBe(false);
		expect(isDashboardRequestAuthorized(`Bearer ${token.slice(0, -1)}`, token)).toBe(false);
	});

	it("rejects a missing or empty Authorization header", () => {
		expect(isDashboardRequestAuthorized(null, token)).toBe(false);
		expect(isDashboardRequestAuthorized("", token)).toBe(false);
	});

	it("rejects malformed headers", () => {
		expect(isDashboardRequestAuthorized(token, token)).toBe(false);
		expect(isDashboardRequestAuthorized("Bearer", token)).toBe(false);
		expect(isDashboardRequestAuthorized("Bearer ", token)).toBe(false);
		expect(isDashboardRequestAuthorized(`Basic ${token}`, token)).toBe(false);
		expect(isDashboardRequestAuthorized(`Bearer  ${token}`, token)).toBe(false);
		expect(isDashboardRequestAuthorized(`Bearer ${token} extra`, token)).toBe(false);
	});

	it("allows every request when no token is configured", () => {
		expect(isDashboardRequestAuthorized(null, undefined)).toBe(true);
		expect(isDashboardRequestAuthorized("Bearer anything", undefined)).toBe(true);
	});
});
