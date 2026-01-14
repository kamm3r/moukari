// src/lib/physics/velocityConfidence.ts

import type { TrackedPoint } from '$lib/types';

export function computeVelocityConfidence(points: TrackedPoint[], vx: number, vy: number): number {
	if (points.length < 3) return 0;

	let totalError = 0;

	for (const p of points) {
		const predictedX = vx * p.t;
		const predictedY = vy * p.t;

		const dx = p.x - predictedX;
		const dy = p.y - predictedY;

		totalError += Math.sqrt(dx * dx + dy * dy);
	}

	const avgError = totalError / points.length;

	// Map average residual error (meters) → confidence [0, 1]
	// < 5 cm  → very high confidence
	// ~15 cm → medium confidence
	// > 30 cm → poor confidence
	const confidence = 1 - avgError / 0.3;

	return Math.max(0, Math.min(confidence, 1));
}
