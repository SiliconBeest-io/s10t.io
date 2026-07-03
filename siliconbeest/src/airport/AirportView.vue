<script setup lang="ts">
/**
 * /airport — the Fediverse Airport page, implementing the approved
 * Claude Design component (Fediverse Airport.dc.html) against the real
 * GET /api/airport numbers. Light daylight palette by design, in every
 * app theme. Hovering a facility or a sky beacon swaps the info card.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHead, useRuntimeConfig } from '#imports';
import AirportScene from './components/AirportScene.vue';
import { useAirportStats } from './composables/useAirportStats';
import { formatBytes, type Beacon } from './lib/layout';

const { t } = useI18n();
const config = useRuntimeConfig();
const { stats, fetchFailed, refresh } = await useAirportStats();

const instanceTitle = computed(() => (config.public.instanceTitle as string) || 'SiliconBeest');

// Live clock — SSR renders the API timestamp; the client starts ticking
// after mount, so hydration never sees a mismatched time string.
const clockNow = ref<number | null>(null);
let clockTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
	clockNow.value = Date.now();
	clockTimer = setInterval(() => {
		clockNow.value = Date.now();
	}, 1000);
	if (!stats.value) void refresh();
});
onBeforeUnmount(() => {
	if (clockTimer) clearInterval(clockTimer);
});
const clock = computed(() => {
	if (clockNow.value != null) {
		const d = new Date(clockNow.value);
		const p2 = (n: number) => String(n).padStart(2, '0');
		return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
	}
	return stats.value ? `${stats.value.generatedAt.slice(11, 16)} UTC` : '—';
});

const statusLabel = computed(() => {
	if (fetchFailed.value) return t('airport.status.lastKnown');
	return stats.value ? t('airport.status.live') : t('airport.status.connecting');
});

const vm = computed(() => {
	const s = stats.value;
	const departures = s?.flights.departures ?? 0;
	const arrivals = s?.flights.arrivals ?? 0;
	const movements = departures + arrivals;
	const dlq = s?.dlq.parked ?? 0;
	return {
		departures,
		arrivals,
		transfers: s?.flights.transfers ?? 0,
		passports: s?.passport.registrations ?? 0,
		cargoOutBytes: formatBytes(s?.cargo.outBytes ?? 0),
		cargoOutCount: s?.cargo.outCount ?? 0,
		cargoInBytes: formatBytes(s?.cargo.inBytes ?? 0),
		cargoInCount: s?.cargo.inCount ?? 0,
		movements,
		announceN: movements,
		dlq,
	};
});

type Selection = { kind: 'term'; term: string } | { kind: 'star'; beacon: Beacon } | null;
const selection = ref<Selection>(null);

const TERM_KEYS = [
	'cloudflare', 'checkin', 'security', 'passport', 'gate', 'immigration', 'baggage',
	'exit', 'cargo', 'announce', 'tower', 'dlq', 'deprwy', 'arrrwy',
] as const;

const info = computed(() => {
	const v = vm.value;
	const params = {
		name: instanceTitle.value,
		departures: v.departures,
		arrivals: v.arrivals,
		movements: v.movements,
		announceN: v.announceN,
		cargoIn: v.cargoInBytes,
		cargoOut: v.cargoOutBytes,
		dlq: v.dlq,
	};
	const sel = selection.value;
	if (sel?.kind === 'star') {
		return {
			title: sel.beacon.label,
			body: t('airport.info.beaconBody'),
			stat: t('airport.info.beaconStat', { count: sel.beacon.arrivals }),
		};
	}
	if (sel?.kind === 'term' && (TERM_KEYS as readonly string[]).includes(sel.term)) {
		const base = `airport.info.${sel.term}`;
		let stat = t(`${base}.stat`, params);
		if (sel.term === 'dlq') {
			stat = v.dlq > 0 ? t('airport.info.dlq.statWaiting', params) : t('airport.info.dlq.statEmpty');
		}
		return { title: t(`${base}.title`), body: t(`${base}.body`, params), stat };
	}
	return {
		title: t('airport.info.default.title', params),
		body: t('airport.info.default.body'),
		stat: t('airport.info.default.stat'),
	};
});

const storyKeys = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

useHead({
	title: computed(() => t('airport.pageTitle', { name: instanceTitle.value })),
	link: [
		{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
		{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
		{
			rel: 'stylesheet',
			href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600&display=swap',
		},
	],
});
</script>

<template>
	<div class="apx-page">
		<div class="apx-shell">
			<header class="apx-header">
				<h1 class="apx-title">{{ t('airport.title', { name: instanceTitle }) }}</h1>
				<p class="apx-subtitle">{{ t('airport.subtitle') }}</p>
				<div class="apx-clock">
					<span class="apx-clock-dot" />{{ t('airport.asOf', { time: clock }) }} · {{ statusLabel }}
				</div>
			</header>

			<div class="apx-stage">
				<div class="apx-infocard" aria-live="polite">
					<div class="apx-infocard-title">{{ info.title }}</div>
					<div class="apx-infocard-body">{{ info.body }}</div>
					<div class="apx-infocard-stat">{{ info.stat }}</div>
				</div>
				<div class="apx-scene-scroll">
					<AirportScene :stats="stats" @select="selection = $event" />
				</div>
			</div>

			<div class="apx-cards">
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.departures') }}</div>
					<div class="apx-card-value">{{ vm.departures }}</div>
				</div>
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.arrivals') }}</div>
					<div class="apx-card-value">{{ vm.arrivals }}</div>
				</div>
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.transfers') }}</div>
					<div class="apx-card-value">{{ vm.transfers }}</div>
				</div>
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.cargoOut') }}</div>
					<div class="apx-card-value apx-card-cargo">{{ vm.cargoOutBytes }}</div>
					<div class="apx-card-sub">{{ t('airport.cards.items', { count: vm.cargoOutCount }) }}</div>
				</div>
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.cargoIn') }}</div>
					<div class="apx-card-value apx-card-cargo">{{ vm.cargoInBytes }}</div>
					<div class="apx-card-sub">{{ t('airport.cards.items', { count: vm.cargoInCount }) }}</div>
				</div>
				<div class="apx-card">
					<div class="apx-card-label">{{ t('airport.cards.passports') }}</div>
					<div class="apx-card-value">{{ vm.passports }}</div>
				</div>
			</div>

			<section class="apx-story">
				<h2 class="apx-story-title">{{ t('airport.story.title') }}</h2>
				<div class="apx-story-cols">
					<p v-for="key in storyKeys" :key="key" class="apx-story-p">
						<b>{{ t(`airport.story.${key}.lead`) }}</b>
						{{ t(`airport.story.${key}.body`) }}
					</p>
				</div>
			</section>
		</div>
	</div>
</template>

<style scoped>
.apx-page {
	min-height: 100vh;
	background: #eef1ec;
	color: #2b3648;
	font-family: 'Hanken Grotesk', system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
}

.apx-shell {
	max-width: 1500px;
	margin: 0 auto;
	padding: 26px 22px 56px;
}

.apx-header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 16px 22px;
	margin-bottom: 16px;
}

.apx-title {
	font-size: 27px;
	font-weight: 800;
	letter-spacing: -0.02em;
	margin: 0;
	white-space: nowrap;
}

.apx-subtitle {
	margin: 0;
	font-size: 14.5px;
	line-height: 1.4;
	color: #64748b;
	flex: 1;
	min-width: 280px;
}

.apx-clock {
	display: flex;
	align-items: center;
	gap: 9px;
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 12px;
	color: #64748b;
	white-space: nowrap;
}

.apx-clock-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #5b54e8;
	display: inline-block;
}

.apx-stage {
	position: relative;
	border-radius: 18px;
	overflow: hidden;
	box-shadow:
		0 1px 2px rgba(43, 54, 72, 0.08),
		0 12px 34px -18px rgba(43, 54, 72, 0.35);
}

.apx-infocard {
	position: absolute;
	top: 16px;
	left: 16px;
	width: 252px;
	max-width: 46%;
	background: rgba(255, 255, 255, 0.85);
	backdrop-filter: blur(8px);
	border: 1px solid rgba(43, 54, 72, 0.12);
	border-radius: 13px;
	padding: 12px 14px;
	z-index: 3;
	pointer-events: none;
	box-shadow: 0 6px 20px -12px rgba(43, 54, 72, 0.5);
}

.apx-infocard-title {
	font-size: 14px;
	font-weight: 700;
	letter-spacing: -0.01em;
	margin-bottom: 4px;
}

.apx-infocard-body {
	font-size: 12.5px;
	line-height: 1.45;
	color: #64748b;
}

.apx-infocard-stat {
	margin-top: 8px;
	display: inline-block;
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	color: #5b54e8;
	background: rgba(91, 84, 232, 0.1);
	border-radius: 20px;
	padding: 3px 10px;
}

.apx-scene-scroll {
	overflow-x: auto;
}

.apx-scene-scroll > :deep(svg) {
	min-width: 900px;
}

.apx-cards {
	display: grid;
	grid-template-columns: repeat(6, 1fr);
	gap: 14px;
	margin-top: 18px;
}

@media (max-width: 1080px) {
	.apx-cards {
		grid-template-columns: repeat(3, 1fr);
	}
}

@media (max-width: 560px) {
	.apx-cards {
		grid-template-columns: repeat(2, 1fr);
	}
}

.apx-card {
	background: #fcfdfe;
	border: 1px solid #d9dfe7;
	border-radius: 13px;
	padding: 14px 16px;
}

.apx-card-label {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	letter-spacing: 0.12em;
	color: #64748b;
	margin-bottom: 6px;
	text-transform: uppercase;
}

.apx-card-value {
	font-size: 30px;
	font-weight: 800;
	letter-spacing: -0.02em;
}

.apx-card-cargo {
	color: #7c3aed;
}

.apx-card-sub {
	margin-top: 2px;
	font-size: 12px;
	color: #94a3b8;
}

.apx-story {
	margin-top: 34px;
	border-top: 1.5px solid #cbd4df;
	padding-top: 16px;
}

.apx-story-title {
	font-size: 19px;
	font-weight: 800;
	letter-spacing: -0.01em;
	margin: 0 0 14px;
}

.apx-story-cols {
	columns: 3;
	column-gap: 40px;
	font-size: 14px;
	line-height: 1.6;
	color: #3d4657;
}

@media (max-width: 1080px) {
	.apx-story-cols {
		columns: 2;
	}
}

@media (max-width: 700px) {
	.apx-story-cols {
		columns: 1;
	}
}

.apx-story-p {
	margin: 0 0 13px;
	break-inside: avoid;
}
</style>
