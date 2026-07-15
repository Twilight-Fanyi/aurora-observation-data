const RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function solarElevation(date, latitude, longitude) {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - yearStart) / 86400000);
  const minutes = date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (minutes / 60 - 12) / 24);
  const equationOfTime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const solarMinutes = (
    minutes +
    equationOfTime +
    4 * longitude +
    1440
  ) % 1440;
  const hourAngle = (solarMinutes / 4 - 180) * RAD;
  const latitudeRad = latitude * RAD;
  const cosineZenith =
    Math.sin(latitudeRad) * Math.sin(declination) +
    Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle);
  return 90 - Math.acos(clamp(cosineZenith, -1, 1)) / RAD;
}
