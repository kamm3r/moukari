// src/lib/cv/hammerDetector.ts

import type { DetectedHammer } from '$lib/types';
import { loadOpenCV } from '$lib/cv/loadOpenCV';

export async function detectHammer(videoElement: HTMLVideoElement): Promise<DetectedHammer | null> {
	const cv = await loadOpenCV();

	const canvas = document.createElement('canvas');
	canvas.width = videoElement.videoWidth;
	canvas.height = videoElement.videoHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(videoElement, 0, 0);

	let src: cv.Mat | null = null;
	let hsv: cv.Mat | null = null;
	let mask: cv.Mat | null = null;
	let contours: cv.MatVector | null = null;
	let hierarchy: cv.Mat | null = null;

	try {
		src = cv.imread(canvas);
		hsv = new cv.Mat();
		mask = new cv.Mat();

		cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

		// Metallic / low‑saturation bright object
		const lowHSV = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 150, 0]);
		const highHSV = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 60, 255, 0]);

		cv.inRange(hsv, lowHSV, highHSV, mask);

		lowHSV.delete();
		highHSV.delete();

		// Clean noise
		const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
		cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
		cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
		kernel.delete();

		contours = new cv.MatVector();
		hierarchy = new cv.Mat();

		cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

		let best: DetectedHammer | null = null;
		let bestScore = 0;

		const frameArea = src.rows * src.cols;
		const minArea = frameArea * 0.0003;
		const maxArea = frameArea * 0.03;

		for (let i = 0; i < contours.size(); i++) {
			const contour = contours.get(i);
			const area = cv.contourArea(contour);

			if (area < minArea || area > maxArea) continue;

			const rect = cv.boundingRect(contour);
			const aspectRatio = rect.width / rect.height;

			if (aspectRatio < 0.5 || aspectRatio > 2.0) continue;

			const moments = cv.moments(contour);
			if (moments.m00 === 0) continue;

			const cx = moments.m10 / moments.m00;
			const cy = moments.m01 / moments.m00;

			const score = area * (1 - Math.abs(1 - aspectRatio));

			if (score > bestScore) {
				bestScore = score;
				best = {
					x: cx,
					y: cy,
					confidence: Math.min(1, score / (maxArea * 0.5))
				};
			}
		}

		return best;
	} catch (err) {
		console.error('Hammer detection failed', err);
		return null;
	} finally {
		src?.delete();
		hsv?.delete();
		mask?.delete();
		contours?.delete();
		hierarchy?.delete();
	}
}
