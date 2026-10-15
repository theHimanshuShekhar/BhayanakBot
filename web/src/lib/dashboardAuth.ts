import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether a request may read the dashboard presence snapshot (ADR 0004 amendment).
 * With no token configured the endpoint stays open, so local development works.
 * Otherwise the header must be exactly `Bearer <token>`. Both sides are hashed first so
 * timingSafeEqual sees equal-length buffers and the token length is not leaked.
 */
export function isDashboardRequestAuthorized(authorization: string | null, token: string | undefined): boolean {
	if (!token) return true;
	const presented = /^bearer (\S+)$/i.exec(authorization ?? "")?.[1];
	if (presented === undefined) return false;
	return timingSafeEqual(digest(presented), digest(token));
}
