<script lang="ts">
	import { appState } from '$lib/state.svelte';
	import type { Point } from '$lib/types';

	// Callback passed from +page.svelte
	export let onSvgClick: ((point: Point) => void) | undefined;

	let videoEl: HTMLVideoElement;
	let containerEl: HTMLDivElement;

	// Convert mouse / touch event to video‑space coordinates
	function getPointFromEvent(event: MouseEvent | TouchEvent): Point | null {
		if (!containerEl || !videoEl) return null;

		const rect = containerEl.getBoundingClientRect();

		let clientX: number;
		let clientY: number;

		if ('touches' in event && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else if ('changedTouches' in event && event.changedTouches.length > 0) {
			clientX = event.changedTouches[0].clientX;
			clientY = event.changedTouches[0].clientY;
		} else if ('clientX' in event) {
			clientX = event.clientX;
			clientY = event.clientY;
		} else {
			return null;
		}

		const x = clientX - rect.left;
		const y = clientY - rect.top;

		const scaleX = videoEl.videoWidth / rect.width;
		const scaleY = videoEl.videoHeight / rect.height;

		return {
			x: x * scaleX,
			y: y * scaleY
		};
	}

	function handleSvgClick(event: MouseEvent | TouchEvent) {
		if (!onSvgClick) return;
		event.preventDefault();

		const point = getPointFromEvent(event);
		if (point) {
			onSvgClick(point);
		}
	}

	// Expose minimal video controls to parent
	export function seekToTime(time: number) {
		if (videoEl) {
			videoEl.currentTime = Math.max(0, Math.min(time, appState.duration));
		}
	}

	export function stepFrame(direction: -1 | 1) {
		const frameTime = 1 / appState.fps;
		seekToTime(videoEl.currentTime + direction * frameTime);
	}

	export function getVideoElement(): HTMLVideoElement | undefined {
		return videoEl;
	}

	function handleLoadedMetadata() {
		appState.setVideoMetadata(videoEl.videoWidth, videoEl.videoHeight, videoEl.duration);
	}

	function handleTimeUpdate() {
		appState.currentTime = videoEl.currentTime;
	}
</script>

<div
	bind:this={containerEl}
	class="relative w-full aspect-video bg-black rounded-lg overflow-hidden"
>
	<video
		bind:this={videoEl}
		src={appState.videoUrl}
		class="w-full h-full object-contain"
		playsinline
		preload="metadata"
		onloadedmetadata={handleLoadedMetadata}
		ontimeupdate={handleTimeUpdate}
	/>

	<!-- SVG overlay -->
	{#if appState.videoWidth > 0 && appState.videoHeight > 0}
		<svg
			class="absolute inset-0 w-full h-full cursor-crosshair"
			viewBox={`0 0 ${appState.videoWidth} ${appState.videoHeight}`}
			onclick={handleSvgClick}
			ontouchstart={handleSvgClick}
			style="touch-action: none;"
		>
			<!-- Calibration points -->
			{#if appState.currentStep === 'calibrate'}
				{#each appState.scalePoints as p, i}
					<circle cx={p.x} cy={p.y} r={10} fill="yellow" stroke="black" stroke-width="2" />
					<text
						x={p.x + 12}
						y={p.y - 12}
						fill="yellow"
						font-size="16"
						stroke="black"
						stroke-width="1"
					>
						{i === 0 ? 'A' : 'B'}
					</text>
				{/each}

				{#if appState.scalePoints.length === 2}
					<line
						x1={appState.scalePoints[0].x}
						y1={appState.scalePoints[0].y}
						x2={appState.scalePoints[1].x}
						y2={appState.scalePoints[1].y}
						stroke="yellow"
						stroke-width="3"
						stroke-dasharray="8,4"
					/>
				{/if}
			{/if}

			<!-- Measurement points -->
			{#if appState.currentStep === 'measure' || appState.currentStep === 'results'}
				{#if appState.point1}
					<circle
						cx={appState.point1.x}
						cy={appState.point1.y}
						r={10}
						fill="red"
						stroke="white"
						stroke-width="3"
					/>
				{/if}

				{#if appState.point2}
					<circle
						cx={appState.point2.x}
						cy={appState.point2.y}
						r={10}
						fill="blue"
						stroke="white"
						stroke-width="3"
					/>
				{/if}

				{#if appState.point1 && appState.point2}
					<line
						x1={appState.point1.x}
						y1={appState.point1.y}
						x2={appState.point2.x}
						y2={appState.point2.y}
						stroke="lime"
						stroke-width="3"
					/>
				{/if}

				{#if appState.groundY !== null}
					<line
						x1={0}
						y1={appState.groundY}
						x2={appState.videoWidth}
						y2={appState.groundY}
						stroke="orange"
						stroke-width="3"
						stroke-dasharray="12,6"
					/>
				{/if}
			{/if}
		</svg>
	{/if}
</div>
