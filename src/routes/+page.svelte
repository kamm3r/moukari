<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Slider } from '$lib/components/ui/slider';

	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import { appState } from '$lib/state.svelte';

	import { detectThrowingCircle, analyzeMotion, findReleaseFrame } from '$lib/cv';
	import { trackHammerOverFrames } from '$lib/cv/trackHammer';

	import { fitVelocity } from '$lib/physics/velocityFit';
	import { rejectOutliers } from '$lib/physics/cleanTrackedPoints';
	import { computeVelocityConfidence } from '$lib/physics/velocityConfidence';
	import { calculateThrowWithDragFromVelocity } from '$lib/physics';

	import type { Point } from '$lib/types';

	const HAMMER_MASS_KG = 7.26;
	const HAMMER_DIAMETER_MM = 110;

	let videoPlayer: VideoPlayer | undefined = $state();
	let sliderValue = $derived([appState.currentFrame]);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) {
			appState.setVideo(input.files[0]);
		}
	}

	function handleSliderChange(value: number[]) {
		videoPlayer?.seekToTime(value[0] / appState.fps);
	}

	function handleCalibrationClick(point: Point) {
		appState.addScalePoint(point);
	}

	function handleMeasurementClick(point: Point) {
		if (appState.measureSubStep === 'point1') {
			appState.setPoint1(point);
			appState.measureSubStep = 'point2';
		} else if (appState.measureSubStep === 'point2') {
			appState.setPoint2(point);
			appState.measureSubStep = 'ground';
		} else if (appState.measureSubStep === 'ground') {
			appState.setGroundY(point.y);
			appState.measureSubStep = 'ready';
		}
	}

	async function autoDetectCircle(): Promise<void> {
		const video = videoPlayer?.getVideoElement();
		if (!video) return;

		appState.setProcessing(true, 'Detecting throwing circle...');

		try {
			const circle = await detectThrowingCircle(video);
			if (circle) {
				appState.setScalePointsFromCircle(circle);
			} else {
				alert('Circle not detected. Place points manually.');
			}
		} catch (err) {
			console.error(err);
			alert('Circle detection failed.');
		} finally {
			appState.setProcessing(false);
		}
	}

	async function runAnalysis() {
		const video = videoPlayer?.getVideoElement();
		if (!video) return;

		appState.setProcessing(true, 'Analyzing release…', 0);

		try {
			const motion = await analyzeMotion(video, appState.fps, (p) => {
				appState.processingProgress = p;
			});

			const releaseFrame = findReleaseFrame(motion);
			videoPlayer?.seekToTime(releaseFrame / appState.fps);

			const tracked = await trackHammerOverFrames(
				video,
				releaseFrame,
				appState.fps,
				appState.pixelsPerMeter
			);

			const initial = fitVelocity(tracked);
			if (!initial) return;

			const cleaned = rejectOutliers(tracked, initial);
			const finalVel = fitVelocity(cleaned);
			if (!finalVel) return;

			const confidence = computeVelocityConfidence(cleaned, finalVel.vx, finalVel.vy);

			const result = calculateThrowWithDragFromVelocity(
				finalVel.vx,
				finalVel.vy,
				appState.releaseHeight,
				HAMMER_MASS_KG,
				HAMMER_DIAMETER_MM
			);

			appState.results = { ...result, confidence };
			appState.goToStep('results');
		} finally {
			appState.setProcessing(false);
		}
	}
</script>

<div class="min-h-screen bg-slate-50 p-4 flex flex-col items-center">
	<header class="w-full max-w-md mb-4 flex justify-between items-center">
		<h1 class="font-bold text-xl">HammerTrack</h1>
		{#if appState.currentStep !== 'upload'}
			<Button variant="ghost" size="sm" onclick={() => appState.reset()}>Reset</Button>
		{/if}
	</header>

	<main class="w-full max-w-md space-y-4">
		{#if appState.currentStep === 'upload'}
			<Card.Root>
				<Card.Header>
					<Card.Title>Upload Video</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Label>Video file</Label>
					<Input type="file" accept="video/*" onchange={handleFileSelect} />
					<Label>FPS</Label>
					<Input
						type="number"
						value={appState.fps}
						onchange={(e) => (appState.fps = +e.target.value)}
					/>
				</Card.Content>
				<Card.Footer>
					<Button
						class="w-full"
						disabled={!appState.videoUrl}
						onclick={() => appState.goToStep('calibrate')}
					>
						Start Calibration
					</Button>
				</Card.Footer>
			</Card.Root>
		{:else}
			<VideoPlayer
				bind:this={videoPlayer}
				onSvgClick={appState.currentStep === 'calibrate'
					? handleCalibrationClick
					: appState.currentStep === 'measure'
						? handleMeasurementClick
						: undefined}
			/>
		{/if}

		{#if appState.currentStep === 'calibrate'}
			<Card.Root>
				<Card.Content class="space-y-3">
					<p class="text-sm">Click two points with known distance (e.g. throwing circle).</p>
					<Button class="w-full" variant="secondary" onclick={autoDetectCircle}>
						Auto‑detect circle
					</Button>
					{#if appState.scalePoints.length === 2}
						<Label>Real distance (m)</Label>
						<Input
							type="number"
							value={appState.realWorldDistance}
							onchange={(e) => (appState.realWorldDistance = +e.target.value)}
						/>
						<Button
							class="w-full"
							onclick={() => {
								appState.calculateScale();
								appState.goToStep('measure');
							}}
						>
							Confirm Calibration
						</Button>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

		{#if appState.currentStep === 'measure'}
			<Card.Root>
				<Card.Content class="space-y-3">
					<Slider
						value={sliderValue}
						max={appState.totalFrames}
						step={1}
						onValueChange={handleSliderChange}
					/>

					<p class="text-sm">
						{#if appState.measureSubStep === 'point1'}
							Tap hammer just before release.
						{:else if appState.measureSubStep === 'point2'}
							Tap hammer again 1–2 frames later.
						{:else if appState.measureSubStep === 'ground'}
							Tap ground level.
						{:else}
							Ready to analyze.
						{/if}
					</p>

					<Button
						class="w-full"
						disabled={appState.measureSubStep !== 'ready'}
						onclick={runAnalysis}
					>
						Analyze Throw
					</Button>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if appState.currentStep === 'results' && appState.results}
			<Card.Root>
				<Card.Header>
					<Card.Title>Results</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2 text-sm">
					<p>Speed: {appState.results.velocity.toFixed(1)} m/s</p>
					<p>Angle: {appState.results.angle.toFixed(1)}°</p>
					<p class="text-lg font-bold">
						Distance: {appState.results.distance.toFixed(2)} m
					</p>
					{#if appState.results.confidence !== undefined}
						<p>
							Confidence:
							<strong>
								{appState.results.confidence > 0.75
									? 'High'
									: appState.results.confidence > 0.4
										? 'Medium'
										: 'Low'}
							</strong>
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</main>
</div>
