import { describe, it, expect, vi } from 'vitest';
import { loadOpenCV } from '@/cv/loadOpenCV';

// Mock opencv-js
vi.mock('@techstark/opencv-js', () => {
	let runtimeInitialized: (() => void) | null = null;

	const mockCv: any = {
		Mat: undefined,
		onRuntimeInitialized: null
	};

	Object.defineProperty(mockCv, 'onRuntimeInitialized', {
		set(fn) {
			runtimeInitialized = fn;
			setTimeout(() => {
				mockCv.Mat = function () {};
				fn();
			}, 10);
		}
	});

	return { default: mockCv };
});

describe('loadOpenCV', () => {
	it('resolves and returns a cv object', async () => {
		const cv = await loadOpenCV();

		expect(cv).toBeDefined();
		expect(cv.Mat).toBeDefined();
	});

	it('returns the same instance on multiple calls', async () => {
		const cv1 = await loadOpenCV();
		const cv2 = await loadOpenCV();

		expect(cv1).toBe(cv2);
	});
});
