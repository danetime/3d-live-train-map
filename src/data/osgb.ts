/**
 * OSGB36 easting/northing → WGS84 lat/long.
 *
 * The implementation lives in shared/osgb.js so the Node coordinate-build script
 * (server/scripts/buildBerthCoords.js) and the browser app use exactly the same
 * maths. Verified against the Ordnance Survey worked example.
 */
export { osGridToLatLng } from "../../shared/osgb.js";
