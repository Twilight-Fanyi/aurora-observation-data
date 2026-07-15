export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

export function darknessFactor(solarElevation) {
  return clamp((-6 - solarElevation) / 12);
}

export function skyFactor(cloudCover, visibilityKm) {
  return 0.8 * (1 - clamp(cloudCover, 0, 100) / 100) +
    0.2 * clamp((visibilityKm - 2) / 28);
}

export function scoreCurrent(input) {
  const ovation = clamp(input.ovation / 40);
  const kpFit = smoothstep(
    input.referenceKp - 1.5,
    input.referenceKp + 0.5,
    input.currentKp
  );
  const bzBoost = clamp(-input.bzGsm / 12);
  const space = 0.55 * ovation + 0.30 * kpFit + 0.15 * bzBoost;
  return Math.round(
    100 *
    space *
    skyFactor(input.cloudCover, input.visibilityKm) *
    darknessFactor(input.solarElevation)
  );
}

export function scoreForecast(input) {
  const space = smoothstep(
    input.referenceKp - 1.5,
    input.referenceKp + 0.5,
    input.forecastKp
  );
  return Math.round(
    100 *
    space *
    skyFactor(input.cloudCover, input.visibilityKm) *
    darknessFactor(input.solarElevation)
  );
}

export function resolveLevel(score) {
  if (score < 20) {
    return 'quiet';
  }
  if (score < 45) {
    return 'faint';
  }
  if (score < 75) {
    return 'active';
  }
  return 'storm';
}

export function currentConfidence(input) {
  let confidence = 0;
  if (input.ovationAvailable) {
    confidence += input.ovationDistanceDegrees <= 1.5 ? 35 : 20;
  }
  if (input.kpAvailable) {
    confidence += 25;
  }
  if (input.weatherAvailable) {
    confidence += 25;
  }
  if (input.solarWindAvailable) {
    confidence += 15;
  }
  return confidence;
}

export function forecastConfidence(input) {
  let coverage = 0;
  if (input.kpAvailable) {
    coverage += 50;
  }
  if (input.weatherAvailable) {
    coverage += 50;
  }
  const decay = Math.round(30 * clamp(input.hourOffset / 12));
  return Math.max(0, coverage - decay);
}

export function selectBestWindow(hourly) {
  let best = null;
  for (let start = 0; start < hourly.length - 1; start += 1) {
    for (let end = start + 1; end < hourly.length; end += 1) {
      const slice = hourly.slice(start, end + 1);
      const average = slice.reduce((sum, hour) => sum + hour.score, 0) / slice.length;
      if (best === null || average > best.average) {
        best = {
          startUtc: slice[0].timeUtc,
          endUtc: slice[slice.length - 1].timeUtc,
          average
        };
      }
    }
  }
  if (best === null || Math.max(...hourly.map((hour) => hour.score)) < 20) {
    return null;
  }
  return {
    startUtc: best.startUtc,
    endUtc: best.endUtc
  };
}
