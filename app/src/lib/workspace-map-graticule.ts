/** Interval grid «bagus» (1, 2, 5 × 10^n) untuk garis derajat. */
export function niceDegreeStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;
  const pow10 = 10 ** Math.floor(Math.log10(roughStep));
  const n = roughStep / pow10;
  if (n < 1.5) return pow10;
  if (n < 3.5) return 2 * pow10;
  if (n < 7.5) return 5 * pow10;
  return 10 * pow10;
}

export function degreeDecimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  if (step >= 0.01) return 2;
  if (step >= 0.001) return 3;
  return 4;
}

export function formatDegreeLabel(value: number, step: number): string {
  return `${value.toFixed(degreeDecimals(step))}°`;
}

const MAX_LINES_PER_AXIS = 24;

export type GraticuleGrid = {
  latStep: number;
  lngStep: number;
  latLines: number[];
  lngLines: number[];
};

export function buildGraticuleGrid(args: {
  south: number;
  north: number;
  west: number;
  east: number;
}): GraticuleGrid {
  const { south, north, west, east } = args;
  const latSpan = Math.max(1e-8, north - south);
  const lngSpan = Math.max(1e-8, east - west);

  const latStep = niceDegreeStep(latSpan / MAX_LINES_PER_AXIS);
  const lngStep = niceDegreeStep(lngSpan / MAX_LINES_PER_AXIS);

  const latStart = Math.ceil(south / latStep) * latStep;
  const latEnd = Math.floor(north / latStep) * latStep;
  const lngStart = Math.ceil(west / lngStep) * lngStep;
  const lngEnd = Math.floor(east / lngStep) * lngStep;

  const latLines: number[] = [];
  for (let lat = latStart; lat <= latEnd + latStep * 0.001; lat += latStep) {
    if (lat >= south - 1e-9 && lat <= north + 1e-9) {
      latLines.push(Number(lat.toFixed(8)));
    }
    if (latLines.length > MAX_LINES_PER_AXIS) break;
  }

  const lngLines: number[] = [];
  for (let lng = lngStart; lng <= lngEnd + lngStep * 0.001; lng += lngStep) {
    if (lng >= west - 1e-9 && lng <= east + 1e-9) {
      lngLines.push(Number(lng.toFixed(8)));
    }
    if (lngLines.length > MAX_LINES_PER_AXIS) break;
  }

  return { latStep, lngStep, latLines, lngLines };
}

export const GRATICULE_PANE = "workspaceGraticulePane";
