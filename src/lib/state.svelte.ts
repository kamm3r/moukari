// src/lib/state.svelte.ts

import type { Point, TimedPoint, AppStep, MeasureSubStep, CalculationResult } from '$lib/types';

class AppState {
	// ─────────────────────────────────────────────
	// APP FLOW
	// ─────────────────────────────────────────────
	currentStep = $state<AppStep>('upload');
	measureSubStep = $state<MeasureSubStep>('point1');

	// ─────────────────────────────────────────────
	// VIDEO STATE
	// ─────────────────────────────────────────────
	videoFile = $state<File | null>(null);
	videoUrl = $state<string>('');
	fps = $state<number>(60);

	currentTime = $state<number>(0);
	duration = $state<number>(0);

	videoWidth = $state<number>(0);
	videoHeight = $state<number>(0);

	// ─────────────────────────────────────────────
	// CALIBRATION STATE
	// ─────────────────────────────────────────────
	scalePoints = $state<Point[]>([]);
	realWorldDistance = $state<number>(2.135); // meters
	pixelsPerMeter = $state<number>(0);

	// ─────────────────────────────────────────────
	// MEASUREMENT STATE
	// ─────────────────────────────────────────────
	point1 = $state<TimedPoint | null>(null);
	point2 = $state<TimedPoint | null>(null);
	groundY = $state<number | null>(null);

	// ─────────────────────────────────────────────
	// RESULTS
	// ─────────────────────────────────────────────
	results = $state<CalculationResult | null>(null);

	// ─────────────────────────────────────────────
	// AUTOMATION UI STATE
	// ─────────────────────────────────────────────
	isProcessing = $state<boolean>(false);
	processingMessage = $state<string>('');
	processingProgress = $state<number>(0);

	autoDetectedHammer = $state<Point | null>(null);
	suggestedReleaseFrame = $state<number | null>(null);

	// ─────────────────────────────────────────────
	// DERIVED VALUES
	// ─────────────────────────────────────────────
	get totalFrames(): number {
		return Math.floor(this.duration * this.fps);
	}

	get currentFrame(): number {
		return Math.floor(this.currentTime * this.fps);
	}

	get releaseHeight(): number {
		if (this.point1 && this.groundY !== null && this.pixelsPerMeter > 0) {
			return Math.max(0, (this.groundY - this.point1.y) / this.pixelsPerMeter);
		}
		return 1.5;
	}

	get canCalculate(): boolean {
		return (
			this.point1 !== null &&
			this.point2 !== null &&
			this.groundY !== null &&
			this.pixelsPerMeter > 0
		);
	}

	// ─────────────────────────────────────────────
	// VIDEO ACTIONS
	// ─────────────────────────────────────────────
	setVideo(file: File): void {
		if (this.videoUrl) {
			URL.revokeObjectURL(this.videoUrl);
		}

		this.videoFile = file;
		this.videoUrl = URL.createObjectURL(file);
	}

	setVideoMetadata(width: number, height: number, duration: number): void {
		this.videoWidth = width;
		this.videoHeight = height;
		this.duration = duration;
	}

	// ─────────────────────────────────────────────
	// CALIBRATION ACTIONS
	// ─────────────────────────────────────────────
	addScalePoint(point: Point): void {
		if (this.scalePoints.length < 2) {
			this.scalePoints = [...this.scalePoints, point];
		}
	}

	clearScalePoints(): void {
		this.scalePoints = [];
		this.pixelsPerMeter = 0;
	}

	calculateScale(): void {
		if (this.scalePoints.length !== 2) return;

		const [a, b] = this.scalePoints;
		const dx = b.x - a.x;
		const dy = b.y - a.y;

		const pixelDistance = Math.sqrt(dx * dx + dy * dy);
		this.pixelsPerMeter = pixelDistance / this.realWorldDistance;
	}

	setScalePointsFromCircle(circle: { centerX: number; centerY: number; radius: number }): void {
		this.scalePoints = [
			{ x: circle.centerX - circle.radius, y: circle.centerY },
			{ x: circle.centerX + circle.radius, y: circle.centerY }
		];
	}

	// ─────────────────────────────────────────────
	// MEASUREMENT ACTIONS
	// ─────────────────────────────────────────────
	setPoint1(point: Point): void {
		this.point1 = { ...point, time: this.currentTime };
	}

	setPoint2(point: Point): void {
		this.point2 = { ...point, time: this.currentTime };
	}

	setGroundY(y: number): void {
		this.groundY = y;
	}

	clearMeasurements(): void {
		this.point1 = null;
		this.point2 = null;
		this.groundY = null;
		this.autoDetectedHammer = null;
		this.measureSubStep = 'point1';
	}

	// ─────────────────────────────────────────────
	// AUTOMATION UI ACTIONS
	// ─────────────────────────────────────────────
	setProcessing(active: boolean, message = '', progress = 0): void {
		this.isProcessing = active;
		this.processingMessage = message;
		this.processingProgress = progress;
	}

	setSuggestedReleaseFrame(frame: number): void {
		this.suggestedReleaseFrame = frame;
	}

	setAutoDetectedHammer(point: Point | null): void {
		this.autoDetectedHammer = point;
	}

	// ─────────────────────────────────────────────
	// NAVIGATION
	// ─────────────────────────────────────────────
	goToStep(step: AppStep): void {
		this.currentStep = step;
	}

	// ─────────────────────────────────────────────
	// RESET
	// ─────────────────────────────────────────────
	reset(): void {
		if (this.videoUrl) {
			URL.revokeObjectURL(this.videoUrl);
		}

		this.currentStep = 'upload';
		this.measureSubStep = 'point1';

		this.videoFile = null;
		this.videoUrl = '';
		this.currentTime = 0;
		this.duration = 0;
		this.videoWidth = 0;
		this.videoHeight = 0;

		this.scalePoints = [];
		this.realWorldDistance = 2.135;
		this.pixelsPerMeter = 0;

		this.point1 = null;
		this.point2 = null;
		this.groundY = null;

		this.results = null;
		this.autoDetectedHammer = null;
		this.suggestedReleaseFrame = null;

		this.isProcessing = false;
		this.processingMessage = '';
		this.processingProgress = 0;
	}
}

export const appState = new AppState();
