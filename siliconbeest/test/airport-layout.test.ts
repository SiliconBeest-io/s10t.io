import { describe, it, expect } from 'vitest';
import { computeBeacons, formatBytes } from '@/airport/lib/layout';

describe('airport layout helpers', () => {
	it('formats bytes readably', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
	});

	it('places beacons deterministically inside the sky band', () => {
		const peers = [
			{ domain: 'misskey.io', arrivals: 87 },
			{ domain: 'mastodon.social', arrivals: 60 },
			{ domain: 'planet.moe', arrivals: 23 },
		];

		const first = computeBeacons(peers);
		const second = computeBeacons(peers.map((p) => ({ ...p })));
		expect(first).toEqual(second);

		for (const b of first) {
			expect(b.cx).toBeGreaterThanOrEqual(130);
			expect(b.cx).toBeLessThanOrEqual(1470);
			expect(b.cy).toBeGreaterThanOrEqual(56);
			expect(b.cy).toBeLessThanOrEqual(204);
		}
	});

	it('sizes beacons by digit count and labels only the top five', () => {
		const peers = Array.from({ length: 8 }, (_, i) => ({
			domain: `peer-${i}.example`,
			arrivals: i === 0 ? 120 : 8 - i,
		}));
		const beacons = computeBeacons(peers);

		const big = beacons.find((b) => b.label === 'peer-0.example');
		const small = beacons.find((b) => b.label === 'peer-7.example');
		expect(big!.r).toBeGreaterThan(small!.r);

		expect(beacons.filter((b) => b.labeled)).toHaveLength(5);
		expect(big!.labeled).toBe(true);
		expect(small!.labeled).toBe(false);
	});
});
