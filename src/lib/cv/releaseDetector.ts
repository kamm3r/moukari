// src/lib/cv/releaseDetector.ts

import type { MotionFrame } from '$lib/types';
import { loadOpenCV } from '$lib/cv/loadOpenCV';

export async function analyzeMotion(
	videoElement: HTMLVideoElement,
	fps: number,
	onProgress?: (progress: number) => void
): Promise<MotionFrame[]> {
	const cv = await loadOpenCV();

	const results: MotionFrame[] = [];

	const canvas = document.createElement('canvas');
	canvas.width = videoElement.videoWidth;
	canvas.height = videoElement.videoHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) return results;

	let prevGray: cv.Mat | null = null;

	const totalFrames = Math.floor(videoElement.duration * fps);
	const sampleInterval = Math.max(3, Math.floor(fps / 10));

	try {
		for (let frame = 0; frame < totalFrames; frame += sampleInterval) {
			videoElement.currentTime = frame / fps;

			await new Promise<void>((resolve) => {
				const handler = () => {
					videoElement.removeEventListener('seeked', handler);
					resolve();
				};
				videoElement.addEventListener('seeked', handler);
			});

			ctx.drawImage(videoElement, 0, 0);

			const src = cv.imread(canvas);
			const gray = new cv.Mat();

			cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

			if (prevGray) {
				const diff = new cv.Mat();
				cv.absdiff(prevGray, gray, diff);

				const sum = cv.sumElems(diff);
				const motionScore = sum[0] + sum[1] + sum[2];

				results.push({
					frameNumber: frame,
					motionScore
				});

				diff.delete();
			}

			prevGray?.delete();
			prevGray = gray.clone();

			src.delete();
			gray.delete();

			onProgress?.((frame / totalFrames) * 100);
		}
	} catch (err) {
		console.error('Motion analysis failed', err);
	} finally {
		prevGray?.delete();
	}

	return results;
}

export function findReleaseFrame(motionData: MotionFrame[]): number {
	if (motionData.length === 0) return 0;

	let maxMotion = 0;
	let releaseFrame = 0;

	for (const data of motionData) {
		if (data.motionScore > maxMotion) {
			maxMotion = data.motionScore;
			releaseFrame = data.frameNumber;
		}
	}

	// Release is typically just before max motion spike
	return Math.max(0, releaseFrame - 5);
}
