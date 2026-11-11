/**
 * A small world model for light: where the sun and moon really are for a
 * place and an instant, and what the sky, the key light, the ambient fill,
 * the fog and the god rays look like there, given the season, the climate
 * and the weather. MIT.
 *
 *   const place = locateTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
 *  const light = worldLight({ timestamp: Date.now(), lat: place.lat, lon: place.lon, season: "autumn", climate:
 * "maritime", weather: "clear" });
 *   light.sun.direction   -> [x, y, z], +y up, -z north
 *   light.sky.horizon     -> "#f4a259"
 *   light.rays            -> { source: "sun", strength, color, decay, density }
 *
 * Pure and deterministic: everything is a function of its input. Colours are
 * sRGB hex, directions unit vectors, so any renderer can use it; nothing here
 * touches a clock, a global or a GPU.
 */
/** Where a body sits in the sky, in degrees: elevation above the horizon and azimuth clockwise from north. */
export interface SkyPosition {
    readonly elevation: number;
    readonly azimuth: number;
}
export interface SolarPosition extends SkyPosition {
    readonly declination: number;
    /** Local solar hour angle, degrees (0 at solar noon, negative in the morning). */
    readonly hourAngle: number;
}
/**
 * The sun's position for a place and instant (the low-precision almanac
 * formulae, good to about a degree, plenty for light).
 *
 * @param timestamp Milliseconds since the Unix epoch.
 * @param lat Latitude, degrees north.
 * @param lon Longitude, degrees east.
 */
export declare function solarPosition(timestamp: number, lat: number, lon: number): SolarPosition;
export interface MoonState extends SkyPosition {
    /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
    readonly phase: number;
    /** Lit fraction of the disc, 0 to 1. */
    readonly illumination: number;
}
/**
 * The moon's phase and an approximate position: it trails the sun by its
 * phase of a day (full moon opposite the sun), on the sun's declination.
 * Accurate enough to light a scene; not an ephemeris.
 */
export declare function moonState(timestamp: number, lat: number, lon: number): MoonState;
/** A unit vector toward a sky position: +y up, -z north, +x east. */
export declare function skyDirection(position: SkyPosition): readonly [number, number, number];
/** A place for the sky: coordinates and a name. `exact` is false when only the UTC offset placed it. */
export interface Place {
    readonly lat: number;
    readonly lon: number;
    readonly place: string;
    readonly exact: boolean;
}
/**
 * A place for a time zone: its own city when the zone is known, otherwise a
 * longitude from the UTC offset (15° an hour) at a temperate northern latitude.
 *
 * @param timeZone IANA zone, e.g. from Intl.DateTimeFormat().resolvedOptions().timeZone.
 * @param utcOffsetMinutes The zone's offset from UTC now, used only when the zone is unknown.
 */
export declare function locateTimeZone(timeZone: string, utcOffsetMinutes?: number): Place;
/** Every zone the table places exactly. */
export declare const KNOWN_ZONES: readonly string[];
/** Mixes two #rrggbb colours in sRGB. */
export declare function mixHex(from: string, to: string, amount: number): string;
export type Weather = "clear" | "wind" | "leaves" | "rain" | "snow";
export type Climate = "temperate" | "maritime" | "alpine" | "monsoon" | "highland" | "desert";
export type LightPhase = "night" | "twilight" | "blue hour" | "golden hour" | "day" | "high sun";
export interface WorldLightInput {
    readonly timestamp: number;
    readonly lat: number;
    readonly lon: number;
    readonly season?: string | undefined;
    readonly climate?: Climate | undefined;
    readonly weather?: Weather | undefined;
}
export interface LightSource {
    readonly direction: readonly [number, number, number];
    readonly elevation: number;
    readonly azimuth: number;
    readonly color: string;
    readonly intensity: number;
}
/** God rays: which body casts them, how strong, their colour, and how they fall off along the ray. */
export interface Rays {
    readonly source: "sun" | "moon" | "none";
    readonly direction: readonly [number, number, number];
    readonly strength: number;
    readonly color: string;
    /** Per-sample falloff along a ray (0.9 short shafts, 0.98 long ones). */
    readonly decay: number;
    /** How far toward the source a ray reaches, as a fraction of the way (0..1). */
    readonly density: number;
}
export interface WorldLight {
    readonly phase: LightPhase;
    readonly sun: LightSource;
    readonly moon: LightSource & {
        readonly phase: number;
        readonly illumination: number;
    };
    readonly sky: {
        readonly top: string;
        readonly horizon: string;
        readonly ground: string;
    };
    readonly fill: {
        readonly sky: string;
        readonly ground: string;
        readonly intensity: number;
    };
    readonly fog: {
        readonly color: string;
        readonly near: number;
        readonly far: number;
    };
    /** 0 clear air to 1 thick haze; morning mist and wet seasons raise it. */
    readonly haze: number;
    /** 0 day to 1 full night (stars). */
    readonly night: number;
    readonly rays: Rays;
}
export declare function lightPhase(elevation: number): LightPhase;
/**
 * The light of a place at an instant: the real sun and moon for its
 * latitude, longitude and date (so season and place change the sun's path),
 * bent by the season's, climate's and weather's mood.
 */
export declare function worldLight(input: WorldLightInput): WorldLight;
