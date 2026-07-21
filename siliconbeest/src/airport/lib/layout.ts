/**
 * Pure, deterministic helpers for the /airport scene.
 *
 * Nothing here may use Math.random(), Date.now() or any other
 * non-deterministic input: the SVG is rendered on the server and hydrated
 * on the client, and both must produce identical markup for the same data.
 */

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = -1;
	do {
		value /= 1024;
		unit++;
	} while (value >= 1024 && unit < units.length - 1);
	return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export interface BeaconInput {
	domain: string;
	arrivals: number;
}

export interface Beacon {
	idx: number;
	label: string;
	arrivals: number;
	cx: number;
	cy: number;
	/** Dot radius — grows with the digit count of arrivals. */
	r: number;
	glow: number;
	/** Label baseline y, just above the dot. */
	ty: number;
	/** Only the top-5 busiest beacons carry a visible domain label. */
	labeled: boolean;
}

/** FNV-1a — matches the hash used by the approved Claude Design layout. */
function fnv1a(s: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h;
}

/**
 * Place federation beacons in the sky band of the 1600×1000 scene.
 * Position derives from the domain hash, so the same domain always shines
 * in the same spot; size follows the digit count of its 24h arrivals.
 */
export function computeBeacons(peers: BeaconInput[]): Beacon[] {
	const top = [...peers]
		.sort((a, b) => b.arrivals - a.arrivals)
		.slice(0, 5)
		.map((p) => p.domain);

	return peers.map((p, idx) => {
		const h = fnv1a(p.domain);
		const cx = 130 + (((h >>> 3) % 1000) / 1000) * 1340;
		const cy = 56 + (((h >>> 13) % 1000) / 1000) * 148;
		const digits = String(Math.max(0, p.arrivals)).length;
		const r = 2.5 + digits * 1.6;
		return {
			idx,
			label: p.domain,
			arrivals: p.arrivals,
			cx: +cx.toFixed(1),
			cy: +cy.toFixed(1),
			r: +r.toFixed(1),
			glow: +(r + 7).toFixed(1),
			ty: +(cy - r - 6).toFixed(1),
			labeled: top.indexOf(p.domain) >= 0,
		};
	});
}
