import type { DetectedCircle } from '$lib/types';
import { loadOpenCV } from '$lib/cv/loadOpenCV';

export async function detectThrowingCircle(
	videoElement: HTMLVideoElement
): Promise<DetectedCircle | null> {
	const { cv } = await loadOpenCV();

	const canvas = document.createElement('canvas');
	canvas.width = Math.round(videoElement.videoWidth);
	canvas.height = Math.round(videoElement.videoHeight);

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

	let src: cv.Mat | null = null;
	let gray: cv.Mat | null = null;
	let blurred: cv.Mat | null = null;
	let circles: cv.Mat | null = null;

	try {
		src = cv.imread(canvas);
		gray = new cv.Mat();
		blurred = new cv.Mat();

		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
		cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2);

		circles = new cv.Mat();

		cv.HoughCircles(
			blurred,
			circles,
			cv.HOUGH_GRADIENT,
			1,
			gray.rows / 8,
			120,
			40,
			gray.rows / 10,
			gray.rows / 2
		);

		let best: DetectedCircle | null = null;

		for (let i = 0; i < circles.cols; ++i) {
			const cx = circles.data32F[i * 3];
			const cy = circles.data32F[i * 3 + 1];
			const r = circles.data32F[i * 3 + 2];

			// Prefer circles lower in the frame
			if (cy < gray.rows * 0.3) continue;

			if (!best || r > best.radius) {
				best = {
					centerX: cx,
					centerY: cy,
					radius: r,
					confidence: 0.8
				};
			}
		}

		return best;
	} catch (err) {
		console.error('Circle detection failed', err);
		return null;
	} finally {
		src?.delete();
		gray?.delete();
		blurred?.delete();
		circles?.delete();
	}
}
