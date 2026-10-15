/** A Map that evicts the oldest entry once `maxSize` is reached. */
export class BoundedMap<K, V> extends Map<K, V> {
	constructor(private readonly maxSize: number) {
		super();
	}

	public override set(key: K, value: V): this {
		if (!this.has(key) && this.size >= this.maxSize) {
			this.delete(this.keys().next().value as K);
		}
		return super.set(key, value);
	}
}

/**
 * A BoundedMap whose entries also expire `ttlMs` after the time `timestampOf` reports for them.
 * Expired entries are removed (not just hidden): on read, and from the oldest end on every write.
 */
export class ExpiringBoundedMap<K, V> extends BoundedMap<K, V> {
	constructor(
		maxSize: number,
		private readonly ttlMs: number,
		private readonly timestampOf: (value: V) => Date,
	) {
		super(maxSize);
	}

	public override get(key: K): V | undefined {
		const value = super.get(key);
		if (value !== undefined && this.isExpired(value)) {
			this.delete(key);
			return undefined;
		}
		return value;
	}

	public override set(key: K, value: V): this {
		// Re-insert so iteration order stays oldest-first, then drop whatever has aged out.
		this.delete(key);
		for (const [oldKey, oldValue] of this) {
			if (!this.isExpired(oldValue)) break;
			this.delete(oldKey);
		}
		return super.set(key, value);
	}

	private isExpired(value: V): boolean {
		return Date.now() - this.timestampOf(value).getTime() >= this.ttlMs;
	}
}
