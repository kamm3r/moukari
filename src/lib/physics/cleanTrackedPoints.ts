// src/lib/physics/cleanTrackedPoints.ts

import type { TrackedPoint } from '$lib/types';
import type { VelocityVector } from '$lib/physics/velocityFit';

export function rejectOutliers(
	points: TrackedPoint[],
	velocity: VelocityVector,
	maxErrorMeters = 0.15
): TrackedPoint[] {
	if (points.length < 3) return points;

	const filtered: TrackedPoint[] = [];

	for (const p of points) {
		const predictedX = velocity.vx * p.t;
		const predictedY = velocity.vy * p.t;

		const dx = p.x - predictedX;
		const dy = p.y - predictedY;

		const error = Math.sqrt(dx * dx + dy * dy);

		if (error <= maxErrorMeters) {
			filtered.push(p);
		}
	}

	return filtered;
}
