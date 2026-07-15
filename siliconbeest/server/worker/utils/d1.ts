const D1_MAX_LIKE_PATTERN_BYTES = 50;

export function toD1LikePattern(value: string): string | null {
	const pattern = `%${value}%`;
	return new TextEncoder().encode(pattern).byteLength <= D1_MAX_LIKE_PATTERN_BYTES
		? pattern
		: null;
}
