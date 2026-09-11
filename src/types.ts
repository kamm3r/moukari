export type Job = { id:string; state:'queued'|'processing'|'complete'|'failed'; progress:number; message:string }
export type Turn = {number:number; start:number; end:number; duration:number; rps:number; degreesPerSecond:number; method:string}
export type Sample = {t:number; angle:number|null; points:number[][]|null}
export type Metric = {value:number|null; reason:string}
export type Result = {version:number; duration:number; fps:number|null; coverage:number; sampleCount:number; turns:Turn[]; samples:Sample[]; notes:string[]; predictedDistance:Metric; landingDistance:Metric; hammerSpeed:Metric}
