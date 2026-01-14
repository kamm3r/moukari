// src/lib/physics.ts

import type { CalculationResult } from '$lib/types';

export function calculateThrowWithDragFromVelocity(
	vx0: number,
	vy0: number,
	releaseHeight: number,
	massKg: number,
	diameterMm: number
): CalculationResult {
	const g = 9.81; // m/s²
	const rho = 1.225; // air density kg/m³
	const Cd = 0.62; // effective drag coefficient

	const radius = diameterMm / 1000 / 2;
	const area = Math.PI * radius * radius;

	let x = 0;
	let y = releaseHeight;

	let vx = vx0;
	let vy = vy0;

	const dt = 0.01; // seconds

	while (y > 0) {
		const v = Math.sqrt(vx * vx + vy * vy);
		if (v === 0) break;

		const dragAccel = (0.5 * rho * Cd * area * v * v) / massKg;

		const ax = -dragAccel * (vx / v);
		const ay = -g - dragAccel * (vy / v);

		// Semi‑implicit Euler (velocity first)
		vx += ax * dt;
		vy += ay * dt;

		x += vx * dt;
		y += vy * dt;
	}

	const speed = Math.sqrt(vx0 * vx0 + vy0 * vy0);
	const angle = Math.atan2(vy0, vx0) * (180 / Math.PI);

	return {
		distance: x,
		velocity: speed,
		angle
	};
}
