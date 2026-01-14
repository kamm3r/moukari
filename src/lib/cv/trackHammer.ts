// src/lib/cv/trackHammer.ts

import type { TrackedPoint } from '$lib/types';
import { detectHammer } from '$lib/cv/hammerDetector';

export async function trackHammerOverFrames(
	videoElement: HTMLVideoElement,
	startFrame: number,
	fps: number,
	pixelsPerMeter: number,
	frameCount = 7
): Promise<TrackedPoint[]> {
	const points: TrackedPoint[] = [];

	for (let i = 0; i < frameCount; i++) {
		const frame = startFrame + i;
		videoElement.currentTime = frame / fps;

		await new Promise<void>((resolve) => {
			const handler = () => {
				videoElement.removeEventListener('seeked', handler);
				resolve();
			};
			videoElement.addEventListener('seeked', handler);
		});

		const hammer = await detectHammer(videoElement);
		if (!hammer) break;

		points.push({
			x: hammer.x / pixelsPerMeter,
			y: hammer.y / pixelsPerMeter,
			t: frame / fps
		});
	}

	return points;
}
