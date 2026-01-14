import cvModule from '@techstark/opencv-js';

export async function loadOpenCV(): Promise<{ cv: typeof cvModule }> {
	let cv: typeof cvModule;
	if (cvModule instanceof Promise) {
		cv = await cvModule;
	} else {
		if (cvModule.Mat) {
			cv = cvModule;
		} else {
			await new Promise<void>((resolve) => {
				cvModule.onRuntimeInitialized = () => resolve();
			});
			cv = cvModule;
		}
	}
	return { cv };
}
