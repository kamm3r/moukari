import { describe, it, expect } from 'vitest';
import { calculateThrowWithDragFromVelocity } from './physics';
import type { TimedPoint } from './types';

function simulateThrow({
	velocity,
	angleDegrees,
	fps = 60,
	pixelsPerMeter = 100,
	releaseHeight = 1.8
}: {
	velocity: number;
	angleDegrees: number;
	fps?: number;
	pixelsPerMeter?: number;
	releaseHeight?: number;
}) {
	const angleRad = angleDegrees * (Math.PI / 180);
	const timePerFrame = 1 / fps;
	const groundPixelY = 500;
	const releasePixelY = groundPixelY - releaseHeight * pixelsPerMeter;

	const p1: TimedPoint = {
		x: 0,
		y: releasePixelY,
		time: 0
	};

	const distMeters = velocity * timePerFrame;
	const dx = distMeters * Math.cos(angleRad);
	const dy = distMeters * Math.sin(angleRad);

	const p2: TimedPoint = {
		x: dx * pixelsPerMeter,
		y: releasePixelY - dy * pixelsPerMeter,
		time: timePerFrame
	};

	return { p1, p2, pixelsPerMeter, releaseHeight };
}

describe('Physics Engine: calculateThrowWithDrag', () => {
	describe('Kinematics Verification', () => {
		it('accurately calculates velocity magnitude from pixel displacement', () => {
			const input = simulateThrow({ velocity: 25.0, angleDegrees: 0 });
			const result = calculateThrowWithDragFromVelocity(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight
			);

			expect(result.velocity).toBeCloseTo(25.0, 2);
		});

		it('accurately calculates launch angle from pixel coordinates', () => {
			const input = simulateThrow({ velocity: 20, angleDegrees: 42.5 });
			const result = calculateThrowWithDrag(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight
			);

			expect(result.angle).toBeCloseTo(42.5, 1);
		});

		it('returns zero output when time difference is zero', () => {
			const p1 = { x: 100, y: 100, time: 1.0 };
			const p2 = { x: 110, y: 90, time: 1.0 };

			const result = calculateThrowWithDrag(p1, p2, 100, 1.8);

			expect(result).toEqual({ velocity: 0, angle: 0, distance: 0 });
		});

		it('handles ultra-high-speed camera inputs (1000fps) without floating point collapse', () => {
			const input = simulateThrow({ velocity: 28, angleDegrees: 40, fps: 1000 });
			const result = calculateThrowWithDrag(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight
			);

			expect(result.velocity).toBeCloseTo(28, 1);
			expect(result.distance).toBeGreaterThan(60);
		});
	});

	describe('Trajectory Logic', () => {
		it('validates that 43-44 degrees provides optimal distance vs extreme angles', () => {
			const speed = 28;
			const low = simulateThrow({ velocity: speed, angleDegrees: 30 });
			const optimal = simulateThrow({ velocity: speed, angleDegrees: 43 });
			const high = simulateThrow({ velocity: speed, angleDegrees: 60 });

			const resLow = calculateThrowWithDrag(low.p1, low.p2, low.pixelsPerMeter, low.releaseHeight);
			const resOpt = calculateThrowWithDrag(
				optimal.p1,
				optimal.p2,
				optimal.pixelsPerMeter,
				optimal.releaseHeight
			);
			const resHigh = calculateThrowWithDrag(
				high.p1,
				high.p2,
				high.pixelsPerMeter,
				high.releaseHeight
			);

			expect(resOpt.distance).toBeGreaterThan(resLow.distance);
			expect(resOpt.distance).toBeGreaterThan(resHigh.distance);
		});

		it('confirms higher release points result in slightly increased distance', () => {
			const groundThrow = simulateThrow({
				velocity: 25,
				angleDegrees: 40,
				releaseHeight: 0
			});
			const highThrow = simulateThrow({
				velocity: 25,
				angleDegrees: 40,
				releaseHeight: 2.0
			});

			const resGround = calculateThrowWithDrag(
				groundThrow.p1,
				groundThrow.p2,
				groundThrow.pixelsPerMeter,
				groundThrow.releaseHeight
			);
			const resHigh = calculateThrowWithDrag(
				highThrow.p1,
				highThrow.p2,
				highThrow.pixelsPerMeter,
				highThrow.releaseHeight
			);

			expect(resHigh.distance).toBeGreaterThan(resGround.distance);
		});
	});

	describe('Aerodynamic Simulation', () => {
		it('confirms heavier implements fly further due to momentum/drag ratio', () => {
			const input = simulateThrow({ velocity: 29, angleDegrees: 42 });

			const lightResult = calculateThrowWithDrag(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight,
				4.0,
				95
			);

			const heavyResult = calculateThrowWithDrag(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight,
				7.26,
				110
			);

			expect(heavyResult.distance).toBeGreaterThan(lightResult.distance);
		});

		it('confirms drag results in lower distance than theoretical vacuum physics', () => {
			const v = 30;
			const input = simulateThrow({
				velocity: v,
				angleDegrees: 45,
				releaseHeight: 0
			});

			const dragResult = calculateThrowWithDrag(
				input.p1,
				input.p2,
				input.pixelsPerMeter,
				input.releaseHeight
			);

			const vacuumMax = (v * v) / 9.81;

			expect(dragResult.distance).toBeLessThan(vacuumMax);
		});
	});

	describe('Real World Benchmarks', () => {
		it('approximates Yuriy Sedykh World Record (86.74m) within acceptable margin', () => {
			const wrInput = simulateThrow({
				velocity: 30.7,
				angleDegrees: 41.5,
				releaseHeight: 1.8
			});

			const result = calculateThrowWithDrag(
				wrInput.p1,
				wrInput.p2,
				wrInput.pixelsPerMeter,
				wrInput.releaseHeight,
				7.26,
				110
			);

			expect(result.distance).toBeGreaterThan(84.0);
			expect(result.distance).toBeLessThan(88.0);
		});
	});
});
