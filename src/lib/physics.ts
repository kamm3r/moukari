/**
 * Physics engine for hammer throw trajectory calculation
 * Implements projectile motion with aerodynamic drag
 */

export interface PhysicsParams {
  vx0: number;
  vy0: number;
  releaseHeight: number;
  massKg: number;
  diameterMm: number;
}

export interface PhysicsResult {
  distance: number;
  flightTime: number;
  maxHeight: number;
  landingVelocity: number;
  trajectory: Array<{ x: number; y: number; t: number }>;
}

const G = 9.81;
const RHO_AIR = 1.225;
const DRAG_COEFFICIENT = 0.62;
const TIME_STEP = 0.001;

/**
 * Calculate cross-sectional area of hammer ball
 */
function calculateArea(diameterMm: number): number {
  const radiusM = diameterMm / 2000;
  return Math.PI * radiusM * radiusM;
}

/**
 * Calculate drag force magnitude
 */
function calculateDrag(v: number, _massKg: number, diameterMm: number): number {
  const area = calculateArea(diameterMm);
  return 0.5 * RHO_AIR * v * v * DRAG_COEFFICIENT * area;
}

/**
 * Simulate hammer throw trajectory with drag
 * Uses semi-implicit Euler integration
 */
export function calculateThrowWithDrag(params: PhysicsParams): PhysicsResult {
  const { vx0, vy0, releaseHeight, massKg, diameterMm } = params;
  
  let x = 0;
  let y = releaseHeight;
  let vx = vx0;
  let vy = vy0;
  let t = 0;
  let maxHeight = releaseHeight;
  
  const trajectory: Array<{ x: number; y: number; t: number }> = [
    { x, y, t },
  ];

  while (y > 0 && t < 10) {
    const v = Math.sqrt(vx * vx + vy * vy);
    const dragForce = calculateDrag(v, massKg, diameterMm);
    const dragAccel = dragForce / massKg;
    
    const ax = -(dragAccel * vx) / v;
    const ay = -G - (dragAccel * vy) / v;
    
    vx += ax * TIME_STEP;
    vy += ay * TIME_STEP;
    x += vx * TIME_STEP;
    y += vy * TIME_STEP;
    t += TIME_STEP;
    
    if (y > maxHeight) {
      maxHeight = y;
    }
    
    if (trajectory.length % 100 === 0) {
      trajectory.push({ x, y, t });
    }
  }

  trajectory.push({ x, y: 0, t });

  const landingV = Math.sqrt(vx * vx + vy * vy);

  return {
    distance: x,
    flightTime: t,
    maxHeight,
    landingVelocity: landingV,
    trajectory,
  };
}

/**
 * Fit velocity from tracked positions using linear regression
 * More accurate than simple two-point calculation
 */
export function fitVelocityFromPositions(
  positions: Array<{ x: number; y: number; t: number }>,
  pixelsPerMeter: number
): { vx: number; vy: number; confidence: number } {
  if (positions.length < 3) {
    return { vx: 0, vy: 0, confidence: 0 };
  }

  const n = positions.length;
  
  // Convert to meters
  const meters = positions.map(p => ({
    x: p.x / pixelsPerMeter,
    y: p.y / pixelsPerMeter,
    t: p.t,
  }));

  // Linear regression for x(t) = vx * t + x0
  let sumT = 0, sumX = 0, sumY = 0;
  let sumTT = 0, sumTX = 0, sumTY = 0;

  for (const p of meters) {
    sumT += p.t;
    sumX += p.x;
    sumY += p.y;
    sumTT += p.t * p.t;
    sumTX += p.t * p.x;
    sumTY += p.t * p.y;
  }

  const denominator = n * sumTT - sumT * sumT;
  
  if (Math.abs(denominator) < 1e-10) {
    return { vx: 0, vy: 0, confidence: 0 };
  }

  const vx = (n * sumTX - sumT * sumX) / denominator;
  const vy = (n * sumTY - sumT * sumY) / denominator;

  // Calculate R² as confidence metric
  const xMean = sumX / n;
  const yMean = sumY / n;
  
  let ssResX = 0, ssTotX = 0;
  let ssResY = 0, ssTotY = 0;

  for (const p of meters) {
    const xPred = vx * p.t + (sumX - vx * sumT) / n;
    const yPred = vy * p.t + (sumY - vy * sumT) / n;
    
    ssResX += Math.pow(p.x - xPred, 2);
    ssTotX += Math.pow(p.x - xMean, 2);
    ssResY += Math.pow(p.y - yPred, 2);
    ssTotY += Math.pow(p.y - yMean, 2);
  }

  const r2X = ssTotX > 0 ? 1 - ssResX / ssTotX : 0;
  const r2Y = ssTotY > 0 ? 1 - ssResY / ssTotY : 0;
  const confidence = Math.min(r2X, r2Y);

  return { vx, vy, confidence };
}

/**
 * Detect camera angle from trajectory shape
 */
export function detectCameraAngle(
  positions: Array<{ x: number; y: number }>
): { type: 'side' | 'angled'; confidence: number } {
  if (positions.length < 10) {
    return { type: 'side', confidence: 0.5 };
  }

  // Calculate trajectory curvature
  let totalCurvature = 0;
  for (let i = 2; i < positions.length; i++) {
    const p1 = positions[i - 2];
    const p2 = positions[i - 1];
    const p3 = positions[i];

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    
    if (Math.abs(v1x) > 1 || Math.abs(v1y) > 1) {
      totalCurvature += Math.abs(Math.atan2(cross, dot));
    }
  }

  const avgCurvature = totalCurvature / (positions.length - 2);
  
  // Side view has low curvature, angled view has higher curvature
  const isAngled = avgCurvature > 0.1;
  const confidence = isAngled 
    ? Math.min(avgCurvature * 5, 0.95)
    : Math.min(0.95, 1 - avgCurvature * 5);

  return {
    type: isAngled ? 'angled' : 'side',
    confidence,
  };
}

/**
 * Estimate implement type from velocity characteristics
 * Men's throws typically 24-30 m/s, Women's 20-26 m/s
 */
export function estimateImplementType(velocity: number): { type: 'men' | 'women'; confidence: number } {
  const menCenter = 27;
  const womenCenter = 23;
  const stdDev = 3;

  const menProb = Math.exp(-Math.pow(velocity - menCenter, 2) / (2 * stdDev * stdDev));
  const womenProb = Math.exp(-Math.pow(velocity - womenCenter, 2) / (2 * stdDev * stdDev));

  const total = menProb + womenProb;
  const menConf = menProb / total;
  const womenConf = womenProb / total;

  if (menConf > womenConf) {
    return { type: 'men', confidence: menConf };
  } else {
    return { type: 'women', confidence: womenConf };
  }
}