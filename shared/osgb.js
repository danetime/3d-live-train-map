/**
 * Convert OS National Grid eastings/northings (OSGB36 / Airy 1830) to WGS84
 * lat/long. Plain-JS source of truth shared by the client (src/data/osgb.ts)
 * and the coordinate build script (server/scripts/buildBerthCoords.js).
 *
 * Inverse Transverse Mercator projection + 7-parameter Helmert (OSGB36 → WGS84).
 * Accurate to a few metres without OSTN15 — ample for this stylised map.
 */
const sin = Math.sin;
const cos = Math.cos;
const tan = Math.tan;

export function osGridToLatLng(easting, northing) {
  const a = 6377563.396;
  const b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = (49 * Math.PI) / 180;
  const lon0 = (-2 * Math.PI) / 180;
  const N0 = -100000;
  const E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n * n * n;

  let lat = lat0;
  let M = 0;
  do {
    lat = (northing - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (lat - lat0);
    const Mb = (3 * n + 3 * n2 + (21 / 8) * n3) * sin(lat - lat0) * cos(lat + lat0);
    const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * sin(2 * (lat - lat0)) * cos(2 * (lat + lat0));
    const Md = (35 / 24) * n3 * sin(3 * (lat - lat0)) * cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(northing - N0 - M) >= 0.00001);

  const cosLat = cos(lat);
  const sinLat = sin(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;

  const tanLat = tan(lat);
  const tan2 = tanLat * tanLat;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;
  const secLat = 1 / cosLat;
  const nu3 = nu * nu * nu;
  const nu5 = nu3 * nu * nu;
  const nu7 = nu5 * nu * nu;

  const VII = tanLat / (2 * rho * nu);
  const VIII = (tanLat / (24 * rho * nu3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX = (tanLat / (720 * rho * nu5)) * (61 + 90 * tan2 + 45 * tan4);
  const X = secLat / nu;
  const XI = (secLat / (6 * nu3)) * (nu / rho + 2 * tan2);
  const XII = (secLat / (120 * nu5)) * (5 + 28 * tan2 + 24 * tan4);
  const XIIA = (secLat / (5040 * nu7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const dE = easting - E0;
  const dE2 = dE * dE;
  const latA = lat - VII * dE2 + VIII * dE2 * dE2 - IX * dE2 * dE2 * dE2;
  const lonA = lon0 + X * dE - XI * dE * dE2 + XII * dE * dE2 * dE2 - XIIA * dE * dE2 * dE2 * dE2;

  return helmertOsgb36ToWgs84(latA, lonA, a, b);
}

function helmertOsgb36ToWgs84(lat, lon, a, b) {
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = sin(lat);
  const cosLat = cos(lat);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  const x1 = nu * cosLat * cos(lon);
  const y1 = nu * cosLat * sin(lon);
  const z1 = (1 - e2) * nu * sinLat;

  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = -20.4894e-6;
  const rx = (-0.1502 / 3600) * (Math.PI / 180);
  const ry = (-0.247 / 3600) * (Math.PI / 180);
  const rz = (-0.8421 / 3600) * (Math.PI / 180);

  const x2 = tx + (1 + s) * x1 + -rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 + -rx * z1;
  const z2 = tz + -ry * x1 + rx * y1 + (1 + s) * z1;

  const aW = 6378137;
  const bW = 6356752.3142;
  const e2W = 1 - (bW * bW) / (aW * aW);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let latW = Math.atan2(z2, p * (1 - e2W));
  let latPrev;
  let nuW;
  do {
    latPrev = latW;
    nuW = aW / Math.sqrt(1 - e2W * sin(latW) * sin(latW));
    latW = Math.atan2(z2 + e2W * nuW * sin(latW), p);
  } while (Math.abs(latW - latPrev) > 1e-12);
  const lonW = Math.atan2(y2, x2);

  return { lat: (latW * 180) / Math.PI, lng: (lonW * 180) / Math.PI };
}
