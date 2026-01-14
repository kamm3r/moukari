// src/lib/types.ts

export interface Point {
	x: number;
	y: number;
}

export interface TimedPoint extends Point {
	time: number;
}

export interface TrackedPoint {
	x: number; // meters
	y: number; // meters
	t: number; // seconds
}

export type AppStep = 'upload' | 'calibrate' | 'measure' | 'results';

export type MeasureSubStep = 'point1' | 'point2' | 'ground' | 'ready';

export interface DetectedCircle {
	centerX: number;
	centerY: number;
	radius: number;
	confidence: number;
}

export interface DetectedHammer {
	x: number;
	y: number;
	confidence: number;
}

export interface MotionFrame {
	frameNumber: number;
	motionScore: number;
}

export interface CalculationResult {
	distance: number; // meters
	velocity: number; // m/s
	angle: number; // degrees

	// Optional quality metric
	confidence?: number;
}
