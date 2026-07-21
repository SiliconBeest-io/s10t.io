<script setup lang="ts">
/**
 * The airport scene, ported from the approved Claude Design component
 * (Fediverse Airport.dc.html). Every drawn path still corresponds 1:1 to
 * real server wiring:
 *
 *   access road + Cloudflare gate   custom-domain front door (edge)
 *   check-in                        rate limiting
 *   security                        anti-bot (Turnstile)
 *   passport control                HTTP signature / auth
 *   departure runway 09L            QUEUE_FEDERATION → queue-consumer → remote inboxes
 *   arrival runway 09R              /inbox (fedify)
 *   immigration                     inbound HTTP signature verification
 *   baggage claim                   remote media attachments
 *   cargo terminal                  R2 MEDIA_BUCKET
 *   announcements booth             STREAMING_DO broadcast
 *   control tower                   ops / federation queue sequencing
 *   DLQ holding apron               federation_dlq_parked backlog
 *
 * The moving fleet is a client-only simulation (useAirportSim); the SSR
 * markup is fully deterministic. Hovering any [data-term] element or a sky
 * beacon reports it upward so the view can show the matching info card.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AirportStats } from '../composables/useAirportStats';
import { useAirportSim } from '../composables/useAirportSim';
import { computeBeacons, type Beacon } from '../lib/layout';

const props = defineProps<{ stats: AirportStats | null }>();
const emit = defineEmits<{
	(e: 'select', v: { kind: 'term'; term: string } | { kind: 'star'; beacon: Beacon } | null): void;
}>();

const { t } = useI18n();

const svgRef = ref<SVGSVGElement | null>(null);

const reduced = ref(false);
let motionQuery: MediaQueryList | undefined;
const onMotionChange = (e: MediaQueryListEvent) => {
	reduced.value = e.matches;
};
onMounted(() => {
	motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	reduced.value = motionQuery.matches;
	motionQuery.addEventListener('change', onMotionChange);
});
onBeforeUnmount(() => {
	motionQuery?.removeEventListener('change', onMotionChange);
});

useAirportSim(svgRef, reduced);

const beacons = computed(() =>
	computeBeacons(
		(props.stats?.destinations ?? []).map((d) => ({ domain: d.domain, arrivals: d.arrivals })),
	),
);

const departures = computed(() => props.stats?.flights.departures ?? 0);
const arrivals = computed(() => props.stats?.flights.arrivals ?? 0);
const movements = computed(() => departures.value + arrivals.value);
const announceN = computed(() => movements.value);
const dlqCount = computed(() => props.stats?.dlq.parked ?? 0);
const dlqLabel = computed(() =>
	dlqCount.value > 0 ? String(dlqCount.value) : t('airport.scene.dlqClear'),
);

function onHover(e: MouseEvent) {
	const target = e.target as Element | null;
	const term = target?.closest?.('[data-term]') as HTMLElement | null;
	if (term?.dataset.term) {
		emit('select', { kind: 'term', term: term.dataset.term });
		return;
	}
	const star = target?.closest?.('[data-star]') as HTMLElement | null;
	if (star?.dataset.star != null) {
		const beacon = beacons.value[Number(star.dataset.star)];
		if (beacon) emit('select', { kind: 'star', beacon });
	}
}
</script>

<template>
	<svg
		ref="svgRef"
		viewBox="0 0 1600 1000"
		class="apx-scene"
		role="img"
		:aria-label="t('airport.sceneLabel')"
		@mouseover="onHover"
		@mouseleave="emit('select', null)"
	>
		<defs>
			<linearGradient id="apx-sky" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#C9DEF5" /><stop offset="0.65" stop-color="#DCE9F4" /><stop offset="1" stop-color="#E8F0EA" />
			</linearGradient>
			<linearGradient id="apx-ground" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#E5EFD7" /><stop offset="1" stop-color="#DAE7CB" />
			</linearGradient>
			<linearGradient id="apx-rw" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#525C6C" /><stop offset="1" stop-color="#3D4552" />
			</linearGradient>
		</defs>

		<rect x="0" y="0" width="1600" height="292" fill="url(#apx-sky)" />
		<rect x="0" y="288" width="1600" height="712" fill="url(#apx-ground)" />
		<text x="800" y="42" text-anchor="middle" class="apx-skytitle">{{ t('airport.scene.sky') }}</text>

		<!-- federation beacons: sky only -->
		<g v-for="b in beacons" :key="b.label" :data-star="b.idx">
			<circle :cx="b.cx" :cy="b.cy" :r="b.glow" fill="#5B54E8" opacity="0.08" />
			<circle :cx="b.cx" :cy="b.cy" :r="b.r" fill="#6F68E0" opacity="0.85" class="apx-twk" />
			<text v-if="b.labeled" :x="b.cx" :y="b.ty" text-anchor="middle" class="apx-beacon-label">{{ b.label }}</text>
		</g>

		<!-- flight arcs (air) -->
		<path d="M1148,313 C1240,288 1312,192 1392,66" fill="none" stroke="#5B54E8" stroke-width="1.5" stroke-dasharray="3 8" opacity="0.45" />
		<path d="M330,56 C264,180 214,320 246,374" fill="none" stroke="#5B54E8" stroke-width="1.5" stroke-dasharray="3 8" opacity="0.45" />

		<!-- ===== sim guide paths (invisible) ===== -->
		<path id="p-d2" d="M560,452 L222,452 C210,452 205,446 205,434 L205,340" fill="none" stroke="none" />
		<path id="p-d3" d="M205,340 C205,320 218,313 246,313 L1148,313" fill="none" stroke="none" />
		<path id="p-d4" d="M1148,313 C1240,288 1312,192 1392,66" fill="none" stroke="none" />
		<path id="p-a1" d="M330,56 C264,180 214,320 246,374 C254,378 264,379 278,379" fill="none" stroke="none" />
		<path id="p-a2" d="M278,379 L798,379" fill="none" stroke="none" />
		<path id="p-a3" d="M798,379 C840,388 856,420 860,448 C861,451 866,452 872,452 L914,452" fill="none" stroke="none" />
		<path id="p-a4" d="M914,452 C919,452 920,456 920,464 L920,514" fill="none" stroke="none" />
		<path id="p-w1" d="M150,752 L744,752 C762,752 768,744 768,720 L768,640 C768,620 750,606 720,606 L648,604" fill="none" stroke="none" />
		<path id="p-w2" d="M648,604 L576,602 C566,602 560,594 560,582 L560,532" fill="none" stroke="none" />
		<path id="p-w3" d="M920,532 L920,584 C920,598 910,604 896,606 L888,608 C882,614 880,626 880,648 L880,804 C880,846 854,866 812,866 L348,866" fill="none" stroke="none" />
		<path id="p-c1" d="M1284,606 C1080,606 800,570 576,528" fill="none" stroke="none" />
		<path id="p-c2" d="M926,526 C1040,550 1150,575 1250,598" fill="none" stroke="none" />

		<!-- ===== ground: taxiways first, runways on top ===== -->
		<path d="M205,452 L1180,452" fill="none" stroke="#C4CDB6" stroke-width="14" stroke-linecap="round" />
		<path d="M205,452 L205,394" stroke="#C4CDB6" stroke-width="14" stroke-linecap="round" />
		<path d="M205,364 L205,328" stroke="#C4CDB6" stroke-width="14" stroke-linecap="round" />
		<path d="M800,394 L862,452" stroke="#C4CDB6" stroke-width="13" stroke-linecap="round" />
		<path d="M560,452 L560,494 M920,452 L920,494 M1160,452 L1160,484" stroke="#C4CDB6" stroke-width="12" stroke-linecap="round" />
		<path d="M205,452 L1180,452 M205,448 L205,396 M205,364 L205,330 M802,398 L858,450" fill="none" stroke="#E8B93A" stroke-width="1.5" stroke-dasharray="5 12" />
		<path d="M560,456 L560,492 M920,456 L920,492 M1160,456 L1160,482" stroke="#E8B93A" stroke-width="1.3" stroke-dasharray="5 12" />
		<rect x="292" y="436" width="20" height="15" rx="2" fill="#2B3648" />
		<text x="302" y="447" text-anchor="middle" class="apx-taxisign">A</text>
		<!-- hold-short markings (2 solid + 2 dashed) -->
		<g stroke="#E8B93A" stroke-width="1.5">
			<line x1="196" y1="334" x2="214" y2="334" /><line x1="196" y1="337" x2="214" y2="337" />
			<line x1="196" y1="341" x2="214" y2="341" stroke-dasharray="3 3" /><line x1="196" y1="344" x2="214" y2="344" stroke-dasharray="3 3" />
			<line x1="196" y1="400" x2="214" y2="400" /><line x1="196" y1="403" x2="214" y2="403" />
			<line x1="196" y1="407" x2="214" y2="407" stroke-dasharray="3 3" /><line x1="196" y1="410" x2="214" y2="410" stroke-dasharray="3 3" />
		</g>

		<!-- service roads (ramp) -->
		<path d="M1284,606 C1080,606 800,570 576,528" fill="none" stroke="#B9C2AC" stroke-width="1.5" stroke-dasharray="2 5" opacity="0.8" />
		<path d="M926,526 C1040,550 1150,575 1250,598" fill="none" stroke="#B9C2AC" stroke-width="1.5" stroke-dasharray="2 5" opacity="0.8" />

		<!-- runways -->
		<g data-term="deprwy">
			<rect x="150" y="300" width="1050" height="26" rx="5" fill="url(#apx-rw)" />
			<rect x="160" y="305" width="5" height="16" rx="1" class="apx-thr" /><rect x="168" y="305" width="5" height="16" rx="1" class="apx-thr" /><rect x="176" y="305" width="5" height="16" rx="1" class="apx-thr" />
			<rect x="1186" y="305" width="5" height="16" rx="1" class="apx-thr" /><rect x="1178" y="305" width="5" height="16" rx="1" class="apx-thr" /><rect x="1170" y="305" width="5" height="16" rx="1" class="apx-thr" />
			<line x1="252" y1="313" x2="1150" y2="313" stroke="#EEF2F7" stroke-width="2.2" stroke-dasharray="26 22" opacity="0.9" />
			<text x="216" y="318" text-anchor="middle" class="apx-rwnum">09L</text>
		</g>
		<text x="150" y="290" class="apx-facility">{{ t('airport.scene.runwayDep') }} <tspan class="apx-facility-sub">{{ t('airport.scene.runwayDepSub') }}</tspan></text>

		<g data-term="arrrwy">
			<rect x="150" y="366" width="1050" height="26" rx="5" fill="url(#apx-rw)" />
			<rect x="160" y="371" width="5" height="16" rx="1" class="apx-thr" /><rect x="168" y="371" width="5" height="16" rx="1" class="apx-thr" /><rect x="176" y="371" width="5" height="16" rx="1" class="apx-thr" />
			<rect x="1186" y="371" width="5" height="16" rx="1" class="apx-thr" /><rect x="1178" y="371" width="5" height="16" rx="1" class="apx-thr" /><rect x="1170" y="371" width="5" height="16" rx="1" class="apx-thr" />
			<line x1="252" y1="379" x2="1150" y2="379" stroke="#EEF2F7" stroke-width="2.2" stroke-dasharray="26 22" opacity="0.9" />
			<text x="216" y="384" text-anchor="middle" class="apx-rwnum">09R</text>
		</g>
		<text x="150" y="416" class="apx-facility">{{ t('airport.scene.runwayArr') }} <tspan class="apx-facility-sub">{{ t('airport.scene.runwayArrSub') }}</tspan></text>

		<!-- windsock -->
		<g>
			<line x1="1268" y1="332" x2="1268" y2="374" stroke="#8A94A3" stroke-width="2.4" stroke-linecap="round" />
			<g class="apx-sway" style="transform-origin: 1268px 334px">
				<path d="M1268,330 L1300,334 L1300,340 L1268,344 Z" fill="#E36A2E" />
				<path d="M1268,331 L1284,333 L1284,341 L1268,343 Z" fill="#F4F1EA" />
			</g>
		</g>

		<!-- stands, pier, jet bridges -->
		<rect x="530" y="492" width="60" height="46" rx="6" fill="none" stroke="#B4C2A2" stroke-width="1.3" stroke-dasharray="5 5" />
		<rect x="890" y="492" width="60" height="46" rx="6" fill="none" stroke="#B4C2A2" stroke-width="1.3" stroke-dasharray="5 5" />
		<rect x="556" y="540" width="8" height="48" rx="2" fill="#C6D0DC" />
		<rect x="916" y="540" width="8" height="48" rx="2" fill="#C6D0DC" />
		<rect x="500" y="588" width="460" height="30" rx="8" fill="#F2F4EE" stroke="#CBD4C4" stroke-width="1.3" />
		<text x="560" y="609" text-anchor="middle" data-term="gate" class="apx-gatelabel">{{ t('airport.scene.gateA1') }}</text>
		<text x="920" y="609" text-anchor="middle" class="apx-gatelabel">{{ t('airport.scene.gateA2') }}</text>

		<!-- DLQ holding apron: on the ground, connected to Taxiway A -->
		<g data-term="dlq">
			<rect x="1088" y="484" width="150" height="56" rx="8" fill="rgba(224,69,58,.05)" stroke="#E0453A" stroke-width="1.5" stroke-dasharray="6 6" />
			<text x="1163" y="477" text-anchor="middle" class="apx-dlqtitle">{{ t('airport.scene.dlqHolding') }}</text>
			<text x="1226" y="516" text-anchor="end" class="apx-dlqcount">{{ dlqCount }}</text>
			<g v-if="dlqCount > 0" transform="translate(1140,512) rotate(90) scale(0.85)" class="apx-twk">
				<path d="M11,0 C11,1.5 8,2 5,2 L3,2 L-2,11 L-4,11 L-2,2 L-7,2 L-9,5 L-10.5,5 L-9.5,0 L-10.5,-5 L-9,-5 L-7,-2 L-2,-2 L-4,-11 L-2,-11 L3,-2 L5,-2 C8,-2 11,-1.5 11,0 Z" fill="#E0453A" />
			</g>
		</g>

		<!-- control tower (west, overlooking thresholds) -->
		<g data-term="tower">
			<ellipse cx="90" cy="432" rx="26" ry="5" fill="#2B3648" opacity="0.1" />
			<path d="M83,430 L97,430 L94,322 L86,322 Z" fill="#FBFCFE" stroke="#C6CFDA" stroke-width="1.2" />
			<path d="M74,322 L106,322 L101,288 L79,288 Z" fill="#5B54E8" />
			<rect x="77" y="295" width="26" height="12" rx="2" fill="#3F39C4" />
			<rect x="72" y="284" width="36" height="5" rx="2.5" fill="#3F39C4" />
			<line x1="90" y1="284" x2="90" y2="266" stroke="#5B54E8" stroke-width="2" />
			<circle cx="90" cy="263" r="3" fill="#E0453A" class="apx-blink" />
		</g>
		<text x="24" y="454" class="apx-facility-sm">{{ t('airport.scene.tower') }} <tspan class="apx-facility-sub">{{ t('airport.scene.towerSub') }}</tspan></text>
		<text x="24" y="472" class="apx-monoline">{{ t('airport.scene.towerLine', { movements, dlq: dlqLabel }) }}</text>

		<!-- cargo terminal (R2) -->
		<g data-term="cargo">
			<rect x="1240" y="560" width="290" height="150" rx="14" fill="#FCFBFF" stroke="#C7BEEB" stroke-width="1.4" />
			<rect x="1268" y="628" width="52" height="52" rx="6" fill="#6D28D9" />
			<rect x="1330" y="628" width="52" height="52" rx="6" fill="#8B5CF6" />
			<rect x="1392" y="628" width="52" height="52" rx="6" fill="#C4B5FD" />
			<text x="1385" y="590" text-anchor="middle" class="apx-facility">{{ t('airport.scene.cargo') }}</text>
			<text x="1385" y="608" text-anchor="middle" class="apx-cargosub">{{ t('airport.scene.cargoSub') }}</text>
		</g>

		<!-- access road: how users reach the terminal -->
		<path d="M96,1000 C100,900 108,820 130,764" fill="none" stroke="#C9CDC4" stroke-width="14" stroke-linecap="round" />
		<path d="M96,1000 C100,900 108,820 130,764" fill="none" stroke="#FCFDFE" stroke-width="1.4" stroke-dasharray="8 10" />
		<text x="66" y="974" class="apx-citylabel">{{ t('airport.scene.city') }}</text>

		<!-- terminal building -->
		<rect x="150" y="660" width="940" height="280" rx="20" fill="#FCFDFE" stroke="#CBD4DF" stroke-width="1.4" />
		<line x1="176" y1="808" x2="1064" y2="808" stroke="#E4E8EE" stroke-width="1.2" />
		<text x="176" y="690" class="apx-landside">{{ t('airport.scene.landsideDep') }}</text>
		<text x="1064" y="842" text-anchor="end" class="apx-landside">{{ t('airport.scene.landsideArr') }}</text>
		<!-- walkways -->
		<path d="M150,752 L744,752 C762,752 768,744 768,720 L768,662" fill="none" stroke="#1FA971" stroke-width="1.2" stroke-dasharray="2 6" opacity="0.4" />
		<path d="M880,662 L880,804 C880,846 854,866 812,866 L348,866" fill="none" stroke="#8391A2" stroke-width="1.2" stroke-dasharray="2 6" opacity="0.45" />
		<!-- connectors terminal<->pier -->
		<path d="M756,618 L756,752 L784,752 L784,618 Z" fill="#EFF1F6" stroke="#C6CFDA" stroke-width="1.2" />
		<path d="M762,744 L762,722 M770,744 L770,714 M778,744 L778,706" stroke="#9AA6B4" stroke-width="2" />
		<path d="M866,618 L866,752 L894,752 L894,618 Z" fill="#EFF1F6" stroke="#C6CFDA" stroke-width="1.2" />
		<path d="M872,744 L872,722 M880,744 L880,714 M888,744 L888,706" stroke="#9AA6B4" stroke-width="2" />

		<g data-term="cloudflare">
			<rect x="106" y="714" width="9" height="38" rx="2" fill="#5B54E8" /><rect x="150" y="714" width="9" height="38" rx="2" fill="#5B54E8" /><rect x="100" y="706" width="66" height="11" rx="4" fill="#5B54E8" />
		</g>
		<text x="132" y="698" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.cloudflare') }}</text>

		<g data-term="checkin">
			<rect x="266" y="726" width="28" height="30" rx="5" class="apx-booth" /><rect x="300" y="726" width="28" height="30" rx="5" class="apx-booth" /><rect x="334" y="726" width="28" height="30" rx="5" class="apx-booth" />
		</g>
		<text x="314" y="712" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.checkin') }}</text>

		<g data-term="security">
			<rect x="464" y="740" width="10" height="26" rx="2" fill="#8A94A3" /><rect x="469" y="726" width="48" height="8" rx="4" fill="#E0453A" transform="rotate(-22 469 730)" />
		</g>
		<text x="482" y="712" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.security') }}</text>

		<g data-term="passport">
			<rect x="610" y="724" width="72" height="34" rx="7" class="apx-booth" />
			<rect x="618" y="731" width="28" height="20" rx="3" fill="#EEF1F6" />
		</g>
		<text x="646" y="712" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.passport') }}</text>
		<text x="770" y="774" text-anchor="middle" class="apx-flowhint">{{ t('airport.scene.boarding') }}</text>
		<text x="880" y="774" text-anchor="middle" class="apx-flowhint">{{ t('airport.scene.arrivalsDown') }}</text>

		<!-- announcements booth (streaming) inside terminal -->
		<g data-term="announce">
			<circle cx="980" cy="726" r="9" fill="#5B54E8" opacity="0.4" class="apx-pa" style="transform-origin: 980px 726px" />
			<circle cx="980" cy="726" r="9" fill="#5B54E8" opacity="0.4" class="apx-pa" style="transform-origin: 980px 726px; animation-delay: 1.2s" />
			<rect x="920" y="700" width="120" height="52" rx="9" fill="#FCFDFE" stroke="#CBD4DF" stroke-width="1.3" />
			<rect x="932" y="711" width="40" height="30" rx="3" fill="#EEF0FB" />
			<rect x="936" y="716" width="32" height="3.4" rx="1.7" fill="#8E88EE" /><rect x="936" y="723" width="24" height="3.4" rx="1.7" fill="#B7B2F0" /><rect x="936" y="730" width="28" height="3.4" rx="1.7" fill="#B7B2F0" />
			<text x="1008" y="724" text-anchor="middle" class="apx-announce-n">{{ announceN }}</text>
			<text x="1008" y="740" text-anchor="middle" class="apx-announce-sub">{{ t('airport.scene.today') }}</text>
		</g>
		<text x="980" y="692" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.announce') }} <tspan class="apx-facility-sub">{{ t('airport.scene.announceSub') }}</tspan></text>

		<g data-term="exit">
			<rect x="310" y="864" width="40" height="36" rx="6" class="apx-booth" />
			<path d="M322,882 l14,0 m-6,-6 l6,6 l-6,6" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</g>
		<text x="330" y="854" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.exit') }}</text>

		<g data-term="baggage">
			<circle cx="520" cy="882" r="30" fill="none" stroke="#AAB4C0" stroke-width="2" />
			<circle cx="520" cy="882" r="17" fill="none" stroke="#BCC5D0" stroke-width="1.5" />
			<circle cx="520" cy="882" r="7" fill="#8A94A3" />
			<g>
				<rect x="516" y="847" width="8" height="8" rx="1.5" fill="#8B5CF6" />
				<animateTransform
					v-if="!reduced"
					attributeName="transform"
					type="rotate"
					from="0 520 882"
					to="360 520 882"
					dur="9s"
					repeatCount="indefinite"
				/>
			</g>
		</g>
		<text x="520" y="934" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.baggage') }}</text>

		<g data-term="immigration">
			<rect x="655" y="862" width="90" height="40" rx="8" class="apx-booth" />
			<path d="M667,882 l7,7 l13,-15" fill="none" stroke="#1FA971" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
		</g>
		<text x="700" y="852" text-anchor="middle" class="apx-facility-sm">{{ t('airport.scene.immigration') }} <tspan class="apx-facility-sub">{{ t('airport.scene.immigrationSub') }}</tspan></text>

		<!-- live fleet (client-side simulation) -->
		<g id="fleet-layer" />
	</svg>
</template>

<style scoped>
.apx-scene {
	width: 100%;
	height: auto;
	display: block;
	font-family: 'Hanken Grotesk', system-ui, sans-serif;
}

@keyframes apx-twk {
	0%,
	100% {
		opacity: 0.85;
	}
	50% {
		opacity: 0.4;
	}
}
@keyframes apx-pa {
	0% {
		opacity: 0.5;
		transform: scale(0.6);
	}
	100% {
		opacity: 0;
		transform: scale(1.9);
	}
}
@keyframes apx-sway {
	0%,
	100% {
		transform: rotate(-5deg);
	}
	50% {
		transform: rotate(8deg);
	}
}
@keyframes apx-blink {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.2;
	}
}

.apx-twk {
	animation: apx-twk 7s ease-in-out infinite;
}
.apx-pa {
	animation: apx-pa 2.4s ease-out infinite;
}
.apx-sway {
	animation: apx-sway 4s ease-in-out infinite;
}
.apx-blink {
	animation: apx-blink 1.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
	.apx-twk,
	.apx-pa,
	.apx-sway,
	.apx-blink {
		animation: none;
	}
}

.apx-skytitle {
	font-size: 15px;
	font-weight: 700;
	letter-spacing: 0.02em;
	fill: #3e5170;
}
.apx-beacon-label {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	fill: #5b6b86;
}
.apx-taxisign {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 10px;
	font-weight: 600;
	fill: #e8b93a;
}
.apx-thr {
	fill: #eef2f7;
	opacity: 0.8;
}
.apx-rwnum {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	fill: #eef2f7;
	opacity: 0.8;
	letter-spacing: 0.05em;
}
.apx-facility {
	font-size: 13px;
	font-weight: 600;
	fill: #3b4554;
}
.apx-facility-sm {
	font-size: 12px;
	font-weight: 600;
	fill: #3b4554;
}
.apx-facility-sub {
	fill: #64748b;
	font-weight: 500;
}
.apx-monoline {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	fill: #64748b;
}
.apx-gatelabel {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 11px;
	fill: #5b6b86;
}
.apx-dlqtitle {
	font-size: 12px;
	font-weight: 600;
	fill: #b23a31;
}
.apx-dlqcount {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 14px;
	font-weight: 600;
	fill: #e0453a;
}
.apx-cargosub {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 10px;
	fill: #7c6bb0;
}
.apx-citylabel {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 10px;
	letter-spacing: 0.14em;
	fill: #8a9576;
}
.apx-landside {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 10px;
	letter-spacing: 0.16em;
	fill: #9aa6b4;
}
.apx-flowhint {
	font-size: 11.5px;
	font-weight: 600;
	fill: #64748b;
}
.apx-booth {
	fill: #ffffff;
	stroke: #b7c0cd;
	stroke-width: 1.3;
}
.apx-announce-n {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 13px;
	font-weight: 600;
	fill: #5b54e8;
}
.apx-announce-sub {
	font-family: 'Spline Sans Mono', ui-monospace, monospace;
	font-size: 8.5px;
	fill: #7c6bb0;
}
</style>
