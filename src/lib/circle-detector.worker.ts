import cv from "@techstark/opencv-js"; // or however you load opencv in worker

self.onmessage = async (e: MessageEvent) => {
  const { imageData, processWidth, processHeight } = e.data;

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  let circles: any = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, blurred, 5);

    circles = new cv.Mat();

    const minR = Math.round(
      Math.min(processWidth, processHeight) * 0.09
    );
    const maxR = Math.round(
      Math.min(processWidth, processHeight) * 0.3
    );

    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1.2,
      gray.rows / 6,
      120,
      35,
      minR,
      maxR
    );

    const count = circles.cols ?? 0;
    const results: Array<{
      x: number;
      y: number;
      radius: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      results.push({
        x: circles.data32F[i * 3],
        y: circles.data32F[i * 3 + 1],
        radius: circles.data32F[i * 3 + 2],
      });
    }

    self.postMessage({ type: "result", circles: results });
  } catch (err: any) {
    self.postMessage({ type: "error", message: err.message });
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    circles?.delete();
  }
};