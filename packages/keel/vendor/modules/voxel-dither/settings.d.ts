/** Threshold maps, in the order the shader numbers them. */
export declare const SCREENS: readonly ["none", "bayer2", "bayer4", "bayer8", "halftone", "lines", "diagonal", "hatch", "ign", "stipple", "checker"];
export type ScreenId = (typeof SCREENS)[number];
/** A screen, or "auto": chosen per depth band from the grid size. */
export type ScreenChoice = ScreenId | "auto";
/** "cel" swaps lit materials for stepped toon ramps; "smooth" leaves the scene's own lighting. */
export type Shading = "cel" | "smooth";
/** "rgb" steps each channel; "luma" steps lightness finer than colour, so shading reads as ramps. */
export type ColorMode = "rgb" | "luma";
export type DepthBand = "near" | "mid" | "far";
/** One depth band's screen: which map, read at 1/scale, with this much of its spread. */
export interface BandScreen {
    readonly screen: ScreenId;
    readonly scale: number;
    readonly amount: number;
}
export type BandScreens = Readonly<Record<DepthBand, BandScreen>>;
/** A complete, normalized look. Every member has a safe default. */
export interface DitherSettings {
    /** The preset this look started from. */
    readonly style: StyleId;
    readonly screen: ScreenChoice;
    /** CSS pixels per art pixel, 1 to 12; 0 picks one from the frame size. */
    readonly pixel: number;
    /**
     * The coarsest art pixel, in CSS pixels, of the parts tagged with
     * `tagDetail`: they are drawn on a grid that divides the look's own, so a
     * small animal keeps its shape in a coarse world. 0 draws them on the look's grid.
     */
    readonly detail: number;
    /** Tone steps per channel, 2 to 16 (ignored when a palette is set). */
    readonly levels: number;
    readonly color: ColorMode;
    /** Up to 32 #rrggbb entries; when set, every pixel is one of them. */
    readonly palette: readonly string[];
    /**
     * Up to 4 spot inks beside the palette. A pixel takes one only when it is
     * already clearly of that ink's hue (never the sky), so a four-tone palette
     * can keep a pink blossom without turning a pale sky pink.
     */
    readonly accent: readonly string[];
    /**
     * 0 to 3: the sky and far band's saturation, and how much their hue outweighs lightness when it picks a palette
     * entry, so a fixed palette finds its blue instead of greys.
     */
    readonly skySaturation: number;
    /** How much of the screen's spread is used, 0 (posterized) to 1. */
    readonly amount: number;
    /**
     * 0 to 0.9: how much of each step between two tones snaps flat instead of
     * dithering. 0 dithers every in-between tone; higher keeps flats clean and
     * leaves a short dithered seam where one tone meets the next, as pixel art does.
     */
    readonly snap: number;
    /** 0 to 0.3: lifts the darkest tones toward a cool blue, so night never crushes to black (ink stays dark). */
    readonly lift: number;
    /** 0 to 1: gathers sub-pixel speckle (leaves, blossom, turf) into masses of one tone; silhouettes stay sharp. */
    readonly clump: number;
    /** 0 to 1: hue-shifted ramps, as pixel artists paint them: lights lean warm, shadows cool. */
    readonly ramp: number;
    readonly shading: Shading;
    /** Cel light steps, 2 to 8. */
    readonly bands: number;
    /** Silhouette outline strength, 0 to 1. */
    readonly outline: number;
    /** A fixed outline ink, or null to darken each pixel's own colour. */
    readonly outlineColor: string | null;
    /** Inner voxel-edge strength, 0 to 1. */
    readonly crease: number;
    readonly contrast: number;
    readonly saturation: number;
    /** View distances where near turns mid and mid turns far. */
    readonly depthBands: readonly [number, number];
    /** God-ray strength multiplier, 0 (off) to 2. The rays themselves come from `setRays`. */
    readonly rays: number;
    /** View distance from which a pixel counts as open sky (it lets light through); 0 means the camera's far plane. */
    readonly skyDistance: number;
    /** CRT scanlines across every art-pixel row, 0 (off) to 1. */
    readonly scanlines: number;
    /** Colour fringe: red and blue drift sideways off the image, 0 (off) to 1. */
    readonly chroma: number;
    /**
     * Signal glitch, 0 (off) to 1: bursts that tear rows sideways and drop blocks
     * of the frame out of place. Higher means more often and more violent.
     * Bursts follow the time given to `setTime`, so a still frame never glitches.
     */
    readonly glitch: number;
}
/** Named looks. A setting given alongside `style` overrides the preset's. */
export declare const DITHER_STYLES: {
    readonly pixel: {
        readonly label: "3D pixel art";
        readonly screen: "bayer4";
        readonly pixel: 4;
        readonly levels: 5;
        readonly snap: 0.45;
        readonly lift: 0.07;
        readonly clump: 0.6;
        readonly ramp: 0.6;
        readonly color: "luma";
        readonly shading: "cel";
        readonly bands: 3;
        readonly outline: 1;
        readonly crease: 0.3;
        readonly contrast: 1.25;
        readonly saturation: 1.45;
    };
    readonly smart: {
        readonly label: "Smart voxel";
        readonly screen: "auto";
        readonly pixel: 0;
        readonly levels: 6;
        readonly lift: 0.03;
        readonly clump: 0.5;
        readonly ramp: 0.35;
        readonly color: "luma";
        readonly shading: "cel";
        readonly bands: 4;
        readonly outline: 0.9;
        readonly crease: 0.35;
        readonly contrast: 1.05;
        readonly saturation: 1.1;
    };
    readonly bayer: {
        readonly label: "Bayer 32";
        readonly screen: "bayer4";
        readonly pixel: 4;
        readonly palette: string[];
        readonly lift: 0.04;
        readonly shading: "cel";
        readonly bands: 3;
        readonly outline: 0.85;
        readonly crease: 0.25;
        readonly contrast: 1.1;
        readonly saturation: 1.25;
    };
    readonly soft: {
        readonly label: "Soft ordered";
        readonly screen: "bayer8";
        readonly pixel: 3;
        readonly levels: 5;
        readonly lift: 0.12;
        readonly clump: 0.4;
        readonly ramp: 0.3;
        readonly color: "luma";
        readonly shading: "smooth";
        readonly outline: 0.5;
        readonly crease: 0.2;
        readonly contrast: 0.92;
        readonly saturation: 0.95;
    };
    readonly halftone: {
        readonly label: "Riso print";
        readonly screen: "halftone";
        readonly pixel: 2;
        readonly palette: string[];
        readonly shading: "smooth";
        readonly outline: 0.7;
        readonly outlineColor: "#3e4597";
        readonly crease: 0;
        readonly contrast: 1.15;
        readonly saturation: 1.3;
    };
    readonly engraving: {
        readonly label: "Engraving";
        readonly screen: "hatch";
        readonly pixel: 2;
        readonly levels: 3;
        readonly color: "luma";
        readonly shading: "smooth";
        readonly outline: 1;
        readonly outlineColor: "#1d1a24";
        readonly crease: 0.3;
        readonly saturation: 0.55;
        readonly rays: 1.3;
    };
    readonly chunky: {
        readonly label: "Chunky 8-bit";
        readonly screen: "bayer2";
        readonly pixel: 6;
        readonly palette: string[];
        readonly amount: 0.4;
        readonly skySaturation: 2;
        readonly clump: 0.85;
        readonly shading: "cel";
        readonly bands: 3;
        readonly outline: 1;
        readonly crease: 0.4;
        readonly contrast: 1.15;
        readonly saturation: 1.3;
    };
    readonly grain: {
        readonly label: "Film grain";
        readonly screen: "ign";
        readonly pixel: 2;
        readonly levels: 6;
        readonly lift: 0.14;
        readonly ramp: 1;
        readonly color: "luma";
        readonly shading: "smooth";
        readonly outline: 0.4;
        readonly crease: 0.1;
        readonly contrast: 1.2;
        readonly saturation: 0.8;
    };
    readonly blossom: {
        readonly label: "Blossom 16";
        readonly screen: "bayer4";
        readonly pixel: 3;
        readonly palette: string[];
        readonly shading: "cel";
        readonly bands: 4;
        readonly outline: 0.9;
        readonly crease: 0.3;
    };
    readonly pocket: {
        readonly label: "Pocket green";
        readonly screen: "bayer4";
        readonly pixel: 4;
        readonly palette: readonly ["#0f2a1d", "#2f5a35", "#7a9a4a", "#cddc8a"];
        readonly accent: readonly ["#e8a6b8", "#a85a76"];
        readonly shading: "cel";
        readonly bands: 3;
        readonly outline: 0;
        readonly crease: 0;
        readonly saturation: 1;
        readonly rays: 0.6;
    };
    readonly clean: {
        readonly label: "Clean cel";
        readonly screen: "none";
        readonly pixel: 3;
        readonly levels: 5;
        readonly clump: 1;
        readonly lift: 0.05;
        readonly color: "luma";
        readonly shading: "cel";
        readonly bands: 3;
        readonly outline: 1;
        readonly outlineColor: "#241a2e";
        readonly crease: 0.5;
        readonly contrast: 1.15;
        readonly saturation: 1.35;
    };
    readonly crt: {
        readonly label: "CRT painted";
        readonly screen: "bayer8";
        readonly pixel: 2;
        readonly levels: 7;
        readonly snap: 0.75;
        readonly color: "luma";
        readonly shading: "smooth";
        readonly outline: 1;
        readonly outlineColor: "#0b0d22";
        readonly crease: 0.15;
        readonly contrast: 1.3;
        readonly saturation: 1.55;
        readonly scanlines: 0.55;
        readonly chroma: 0.5;
    };
};
export type StyleId = keyof typeof DITHER_STYLES;
export declare const STYLE_IDS: readonly StyleId[];
export declare const DEFAULT_DITHER_SETTINGS: DitherSettings;
export declare const HEX: RegExp;
export declare function bounded(value: unknown, min: number, max: number, fallback: number): number;
export declare function depthBandsOf(value: unknown, fallback: readonly [number, number]): readonly [number, number];
/**
 * Normalizes untrusted settings into a complete look. `style` picks a preset;
 * any other member given overrides it. Anything missing or malformed falls
 * back to the preset, then to the defaults.
 *
 * `limit: { levels, colours }` caps the finished look for a small target (a
 * look recipe's resolved limit; 0 is no limit): the preset's own tone steps
 * and palette are cut to fit, never raised.
 *
 * @param input Plain settings object (usually `KEEL_INPUTS["voxel-dither"]`), or undefined.
 */
export declare function ditherSettings(input?: unknown): DitherSettings;
/** The art-pixel grid for a frame: its size, the device pixels each art pixel covers, and where it starts. */
export interface PixelGrid {
    readonly width: number;
    readonly height: number;
    /** Device pixels per art pixel (a whole number, so every pixel is the same size). */
    readonly pixel: number;
    /** Device-pixel offset that centres the grid in the frame (zero or negative). */
    readonly originX: number;
    readonly originY: number;
    /** Detail pixels along each side of an art pixel, 1 to 4 (1: detail parts share the grid). */
    readonly detail: number;
}
/** CSS pixels per art pixel when `pixel` is 0: about 210 art pixels on the short side, 2 to 6 px each. */
export declare function autoPixel(cssWidth: number, cssHeight: number): number;
/**
 * Resolves the art-pixel grid for a frame. Art pixels are a whole number of
 * device pixels, so the picture never has uneven rows; the grid overhangs the
 * frame by under one art pixel and is centred.
 */
export declare function resolveGrid(cssWidth: number, cssHeight: number, devicePixelRatio: number, settings: DitherSettings): PixelGrid;
/**
 * The screens a look wears in each depth band. A fixed screen is worn
 * everywhere, softer with distance. "auto" picks by grid size: a small grid
 * needs a 2x2 lattice to have room for tone, a large one can afford a fine
 * matrix throughout and a fine grain only far away. Distance always flattens
 * the screen's spread, so far things snap to calm fills.
 */
export declare function bandScreens(settings: DitherSettings, gridShort: number): BandScreens;
