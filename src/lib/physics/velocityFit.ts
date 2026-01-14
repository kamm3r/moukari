// src/lib/physics/velocityFit.ts

import type { TrackedPoint } from '$lib/types';

export interface VelocityVector {
	vx: number; // m/s
	vy: number; // m/s
}

export function fitVelocity(points: TrackedPoint[]): VelocityVector | null {
	const n = points.length;
	if (n < 2) return null;

	let sumT = 0;
	let sumTT = 0;
	let sumX = 0;
	let sumXT = 0;
	let sumY = 0;
	let sumYT = 0;

	for (const p of points) {
		sumT += p.t;
		sumTT += p.t * p.t;
		sumX += p.x;
		sumXT += p.x * p.t;
		sumY += p.y;
		sumYT += p.y * p.t;
	}

	const denom = n * sumTT - sumT * sumT;
	if (denom === 0) return null;

	const vx = (n * sumXT - sumT * sumX) / denom;
	const vy = (n * sumYT - sumT * sumY) / denom;

	return { vx, vy };
}
