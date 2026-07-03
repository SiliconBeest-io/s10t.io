import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * The living-airport simulation, ported from the approved Claude Design
 * component (Fediverse Airport.dc.html).
 *
 * A full departure turnaround: passengers board while the aircraft is on
 * stand, it pushes back, taxis Taxiway A, holds short of 09L, rolls, and
 * climbs into the federated sky. Arrivals land on 09R, vacate on the
 * rapid-exit, park nose-in, and deplane. Cargo carts are dispatched only
 * while an aircraft is on stand. Passengers wait in the gate lounge and
 * board only when a plane is actually parked.
 *
 * This is ambience, not data: the real numbers live in the beacons, the
 * counters, and the stat cards. Runs entirely client-side after mount, so
 * SSR markup stays deterministic. prefers-reduced-motion swaps the whole
 * loop for static vehicles.
 */

const NS = 'http://www.w3.org/2000/svg';

const PLANE =
	'<path d="M11,0 C11,1.5 8,2 5,2 L3,2 L-2,11 L-4,11 L-2,2 L-7,2 L-9,5 L-10.5,5 L-9.5,0 L-10.5,-5 L-9,-5 L-7,-2 L-2,-2 L-4,-11 L-2,-11 L3,-2 L5,-2 C8,-2 11,-1.5 11,0 Z" fill="#5B54E8" opacity="0.95"></path>';
const CART =
	'<g><rect x="-10" y="-3.5" width="7" height="7" rx="1.5" fill="#5B6472"></rect><rect x="-1.5" y="-3" width="6" height="6" rx="1" fill="#8B5CF6"></rect><rect x="5.5" y="-3" width="6" height="6" rx="1" fill="#C4B5FD"></rect></g>';
const person = (color: string) => `<circle r="3" fill="${color}"></circle>`;

const GUIDE_IDS = ['d2', 'd3', 'd4', 'a1', 'a2', 'a3', 'a4', 'w1', 'w2', 'w3', 'c1', 'c2'] as const;
type GuideId = (typeof GUIDE_IDS)[number];
type Guide = { el: SVGPathElement; len: number };

interface Mover {
	el: SVGGElement;
	phase: string;
	prev: string;
	t: number;
	d: number;
}

interface Pax {
	kind: 'dep' | 'arr';
	el: SVGGElement;
	path: GuideId;
	d: number;
	v: number;
	state: 'walk' | 'wait';
	bw: number | null;
	wx?: number;
	wy?: number;
}

interface Cart {
	el: SVGGElement;
	path: GuideId;
	d: number;
	state: 'fwd' | 'dwell' | 'back';
	ret: boolean;
	t?: number;
}

export function useAirportSim(svgRef: Ref<SVGSVGElement | null>, reduced: Ref<boolean>) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let ready = false;
	let errorLogged = false;

	function setup(): void {
		const svg = svgRef.value;
		if (ready) return;
		if (!svg) {
			retry = setTimeout(setup, 300);
			return;
		}
		const layer = svg.querySelector<SVGGElement>('#fleet-layer');
		const P = {} as Record<GuideId, Guide>;
		for (const id of GUIDE_IDS) {
			const el = svg.querySelector<SVGPathElement>(`#p-${id}`);
			if (!el || !layer) {
				retry = setTimeout(setup, 300);
				return;
			}
			P[id] = { el, len: el.getTotalLength() };
		}
		ready = true;

		const mk = (html: string): SVGGElement => {
			const g = document.createElementNS(NS, 'g') as SVGGElement;
			g.innerHTML = html;
			layer!.appendChild(g);
			return g;
		};
		const rm = (g: SVGGElement): void => {
			try {
				layer!.removeChild(g);
			} catch {
				/* already detached */
			}
		};
		const setT = (g: SVGGElement, x: number, y: number, a: number): void => {
			g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})`);
		};
		const posOn = (p: Guide, dist: number) => {
			const d = Math.max(0, Math.min(p.len, dist));
			const pt = p.el.getPointAtLength(d);
			const pt2 = p.el.getPointAtLength(Math.min(p.len, d + 2));
			return { x: pt.x, y: pt.y, a: (Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180) / Math.PI };
		};

		if (reduced.value) {
			// Parked, not hidden: reduced motion still shows the operation.
			setT(mk(PLANE), 560, 516, 90);
			setT(mk(PLANE), 920, 516, 90);
			setT(mk(person('#1FA971')), 420, 752, 0);
			setT(mk(person('#8391A2')), 700, 866, 0);
			setT(mk(CART), 900, 600, 0);
			return;
		}

		const dep: Mover = { el: mk(PLANE), phase: 'boarding', prev: '', t: 0, d: 0 };
		const arr: Mover = { el: mk(PLANE), phase: 'gone', prev: '', t: 6, d: 0 };
		setT(dep.el, 560, 516, 90);
		arr.el.setAttribute('opacity', '0');

		const pax: Pax[] = [];
		const carts: Cart[] = [];
		// Variable-speed advance along a guide path (v0 → v1 over its length).
		const step = (o: Mover, p: Guide, v0: number, v1: number, dt: number): boolean => {
			const prog = p.len ? Math.min(1, o.d / p.len) : 1;
			o.d += (v0 + (v1 - v0) * prog) * dt;
			const c = posOn(p, o.d);
			setT(o.el, c.x, c.y, c.a);
			return o.d >= p.len;
		};
		let spawnT = 0.5;
		let arrSpawn: { n: number; t: number } | null = null;

		const update = (dt: number): void => {
			// ---- departure aircraft cycle ----
			dep.t += dt;
			if (dep.phase !== dep.prev) {
				dep.prev = dep.phase;
				if (dep.phase === 'boarding') {
					carts.push({ el: mk(CART), path: 'c1', d: 0, state: 'fwd', ret: true });
				}
			}
			if (dep.phase === 'boarding') {
				setT(dep.el, 560, 516, 90);
				if (dep.t > 10) {
					dep.phase = 'pushback';
					dep.t = 0;
				}
			} else if (dep.phase === 'pushback') {
				const p = Math.min(1, dep.t / 3);
				setT(dep.el, 560, 516 - 64 * p, 90 + 90 * p);
				if (p >= 1) {
					dep.phase = 'taxi';
					dep.d = 0;
				}
			} else if (dep.phase === 'taxi') {
				if (step(dep, P.d2, 80, 80, dt)) {
					dep.phase = 'hold';
					dep.t = 0;
				}
			} else if (dep.phase === 'hold') {
				if (dep.t > 2) {
					dep.phase = 'roll';
					dep.d = 0;
				}
			} else if (dep.phase === 'roll') {
				if (step(dep, P.d3, 60, 430, dt)) {
					dep.phase = 'climb';
					dep.d = 0;
				}
			} else if (dep.phase === 'climb') {
				if (step(dep, P.d4, 430, 640, dt)) {
					dep.phase = 'gone';
					dep.t = 0;
					dep.el.setAttribute('opacity', '0');
				}
			} else if (dep.phase === 'gone') {
				if (dep.t > 5) {
					dep.phase = 'boarding';
					dep.t = 0;
					dep.el.removeAttribute('opacity');
				}
			}

			// ---- arrival aircraft cycle ----
			arr.t += dt;
			if (arr.phase !== arr.prev) {
				arr.prev = arr.phase;
				if (arr.phase === 'deplaning') {
					arrSpawn = { n: 0, t: 0.6 };
					carts.push({ el: mk(CART), path: 'c2', d: 0, state: 'fwd', ret: false });
				}
			}
			if (arr.phase === 'gone') {
				if (arr.t > 7) {
					arr.phase = 'approach';
					arr.d = 0;
					arr.el.removeAttribute('opacity');
				}
			} else if (arr.phase === 'approach') {
				if (step(arr, P.a1, 320, 165, dt)) {
					arr.phase = 'rollout';
					arr.d = 0;
				}
			} else if (arr.phase === 'rollout') {
				if (step(arr, P.a2, 165, 60, dt)) {
					arr.phase = 'exit';
					arr.d = 0;
				}
			} else if (arr.phase === 'exit') {
				if (step(arr, P.a3, 66, 66, dt)) {
					arr.phase = 'park';
					arr.d = 0;
				}
			} else if (arr.phase === 'park') {
				if (step(arr, P.a4, 42, 28, dt)) {
					arr.phase = 'deplaning';
					arr.t = 0;
				}
			} else if (arr.phase === 'deplaning') {
				setT(arr.el, 920, 516, 90);
				if (arr.t > 10) {
					arr.phase = 'gone';
					arr.t = 0;
					arr.el.setAttribute('opacity', '0');
				}
			}

			// ---- departing passengers: walk, wait in lounge, board only when the plane is parked ----
			spawnT -= dt;
			if (spawnT <= 0 && pax.filter((x) => x.kind === 'dep').length < 8) {
				spawnT = 1.6 + Math.random() * 1.2;
				pax.push({
					kind: 'dep',
					el: mk(person('#1FA971')),
					path: 'w1',
					d: Math.random() * 30,
					v: 30 + Math.random() * 12,
					state: 'walk',
					bw: null,
				});
			}
			if (arrSpawn) {
				arrSpawn.t -= dt;
				if (arrSpawn.t <= 0) {
					arrSpawn.t = 0.9;
					arrSpawn.n++;
					pax.push({
						kind: 'arr',
						el: mk(person('#8391A2')),
						path: 'w3',
						d: 0,
						v: 32 + Math.random() * 10,
						state: 'walk',
						bw: null,
					});
					if (arrSpawn.n >= 6) arrSpawn = null;
				}
			}
			for (let i = pax.length - 1; i >= 0; i--) {
				const x = pax[i];
				if (!x) continue;
				if (x.state === 'walk') {
					const p = P[x.path];
					x.d += x.v * dt;
					if (x.d >= p.len) {
						if (x.path === 'w1') {
							x.state = 'wait';
							x.wx = 640 - (i % 5) * 10;
							x.wy = 604;
							setT(x.el, x.wx, x.wy, 0);
						} else {
							rm(x.el);
							pax.splice(i, 1);
							continue;
						}
					} else {
						const c = posOn(p, x.d);
						setT(x.el, c.x, c.y, 0);
					}
				} else if (x.state === 'wait') {
					if (dep.phase === 'boarding' && dep.t < 8) {
						if (x.bw == null) x.bw = Math.random() * 2.4;
						x.bw -= dt;
						if (x.bw <= 0) {
							x.state = 'walk';
							x.path = 'w2';
							x.d = 0;
							x.v = 36 + Math.random() * 8;
						}
					} else {
						x.bw = null;
					}
				}
			}

			// ---- cargo carts: dispatched only while an aircraft is on stand ----
			for (let i = carts.length - 1; i >= 0; i--) {
				const c = carts[i];
				if (!c) continue;
				const p = P[c.path];
				if (c.state === 'fwd') {
					c.d += 105 * dt;
					if (c.d >= p.len) {
						if (c.ret) {
							c.state = 'dwell';
							c.t = 3;
						} else {
							rm(c.el);
							carts.splice(i, 1);
							continue;
						}
					}
				} else if (c.state === 'dwell') {
					c.t! -= dt;
					if (c.t! <= 0) c.state = 'back';
				} else if (c.state === 'back') {
					c.d -= 105 * dt;
					if (c.d <= 0) {
						rm(c.el);
						carts.splice(i, 1);
						continue;
					}
				}
				const pos = posOn(p, c.d);
				setT(c.el, pos.x, pos.y, pos.a + (c.state === 'back' ? 180 : 0));
			}
		};

		let last = performance.now();
		timer = setInterval(() => {
			const now = performance.now();
			const dt = Math.min(0.06, (now - last) / 1000);
			last = now;
			try {
				update(dt);
			} catch (e) {
				if (!errorLogged) {
					errorLogged = true;
					console.error('[airport-sim] update error', e);
				}
			}
		}, 33);
	}

	onMounted(() => {
		setTimeout(setup, 120);
	});
	onBeforeUnmount(() => {
		if (timer) clearInterval(timer);
		if (retry) clearTimeout(retry);
	});
}
