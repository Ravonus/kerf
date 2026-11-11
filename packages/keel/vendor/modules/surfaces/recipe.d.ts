/** A direction as `[x, y]`, x to the right and y down; it need not be unit length. */
export type Axis = readonly [number, number];
/** Paper: fibre noise, flecks, soft stains and faint laid and chain lines. Tileable. */
export interface PaperRecipe {
    readonly kind: "paper";
    readonly tone: string;
    /** The flecks' colour and how many of the fleck cells hold one. */
    readonly fleck: string;
    readonly flecks: number;
    /** The stains' colour and how much they show. */
    readonly stain: string;
    readonly stains: number;
    /** Fibre cells across the tile (a whole number, 4..512), and how much the fibres show. */
    readonly cells: number;
    readonly fibres: number;
    /** The cloudy unevenness of the sheet: its contrast, and its lattice across the tile (a whole number, 1..64). */
    readonly mottle: number;
    readonly mottleScale: number;
    /** Laid lines across and chain lines down the tile (whole numbers, 0 for none), and how much they show. */
    readonly laid: number;
    readonly chain: number;
    readonly lines: number;
    /** Relief: how tall a height of 1 stands, as a share of the surface's height (0..4), for the normal. */
    readonly depth: number;
}
/** Rib knit: columns of knit stitches with purl between them, plied yarn and fuzz. Tileable. */
export interface KnitRecipe {
    readonly kind: "knit";
    readonly base: string;
    readonly shadow: string;
    readonly light: string;
    /** Ribs across and courses (rows of stitches) down the tile: whole numbers, 1..256. */
    readonly ribs: number;
    readonly courses: number;
    /** The share of a rib the knit column takes (0.3..0.9). */
    readonly knit: number;
    /** Ply turns along one leg of a stitch (0..8). */
    readonly twist: number;
    /** Loose fibres over the yarn, and how uneven the stitches are. */
    readonly fuzz: number;
    readonly jitter: number;
    readonly depth: number;
}
/** One soft painted mass on a painted ground: a petal, a leaf, a bloom, a bud. */
export interface Mass {
    /** Its centre as shares of the width and the height. */
    readonly at: Axis;
    /** Its half-length along `axis` and half-width across it, as shares of the height. */
    readonly size: Axis;
    readonly axis: Axis;
    /** The shadowed and the lit colour. */
    readonly colour: string;
    readonly light: string;
    /** How soft the edge is, how much the edge wanders, and how strong the brush streaks are in it. */
    readonly soft: number;
    readonly veneer: number;
    readonly streak: number;
    /** Streaks around the centre (a bloom's ruffled petals) instead of along the axis. */
    readonly ring?: boolean;
    /** How far the ends narrow to points: 0 an oval, 1 a leaf. */
    readonly point?: number;
}
/** Folded cloth under a painted ground: three crossing sets of creased folds with a sheen on their crests. */
export interface Folds {
    readonly axis: Axis;
    /** Folds per height (0.5..16), and how much they wander (0..2). */
    readonly count: number;
    readonly veneer: number;
    readonly deep: string;
    readonly mid: string;
    readonly light: string;
    readonly sheen: number;
}
/** A soft painted field: a ground, folds or masses over it, brush texture and a glaze. Any size; not tileable. */
export interface PaintedRecipe {
    readonly kind: "painted";
    readonly ground: string;
    /** How uneven the ground's colour is. */
    readonly variation: number;
    /** A thin transparent colour laid over everything, in broad patches. */
    readonly glaze: string;
    readonly glazeAmount: number;
    /** Brush texture: its direction, stroke cells per height (1..64), and how much it shows. */
    readonly brush: {
        readonly axis: Axis;
        readonly length: number;
        readonly amount: number;
    };
    readonly folds?: Folds;
    /** Up to ten masses, painted in order. */
    readonly masses: readonly Mass[];
    /** How far a seed moves a mass, as a share of the height (0..0.2). */
    readonly jitter: number;
    readonly depth: number;
}
/** Every recipe a painter takes. */
export type SurfaceRecipe = PaperRecipe | KnitRecipe | PaintedRecipe;
/** Planned: veneered-noise veins through a stone, as marble. Tileable. */
export interface VeinsRecipe {
    readonly kind: "veins";
    readonly base: string;
    readonly vein: string;
    /** Veins across the tile, how far they wander, and how sharp they are. */
    readonly count: number;
    readonly veneer: number;
    readonly sharpness: number;
    readonly depth: number;
}
/** Planned: a crackle of cells, as old varnish or dried paint. Tileable. */
export interface CracksRecipe {
    readonly kind: "cracks";
    readonly base: string;
    readonly crack: string;
    /** Cells across the tile, the cracks' width as a share of a cell, and how much they show. */
    readonly cells: number;
    readonly width: number;
    readonly amount: number;
    readonly depth: number;
}
/** Planned: a repeated motif with a gold ramp, as brocade or a printed pattern. Tileable. */
export interface MotifRecipe {
    readonly kind: "motif";
    readonly ground: string;
    /** The ramp the motif is coloured with, dark to light. */
    readonly ramp: readonly string[];
    /** Repeats across and down the tile, and a half-drop between columns. */
    readonly across: number;
    readonly down: number;
    readonly halfDrop: boolean;
    readonly depth: number;
}
/** A recipe for a painter that is planned and not built yet. */
export type PlannedRecipe = VeinsRecipe | CracksRecipe | MotifRecipe;
/** The planned painters' kinds. */
export declare const PLANNED: readonly PlannedRecipe["kind"][];
/** A pale grey-green paper with fibres, specks and faint laid lines: a list band's ground. */
export declare const PAPER: PaperRecipe;
/** A hot pink rib knit, eight ribs and eighteen courses a tile: seven tiles go once around a cap of 56 ribs. */
export declare const KNIT: KnitRecipe;
/** A painted flower close-up: white petals at the left, a plum bloom top right, ochre and crimson below. */
export declare const PAINTED_FLORAL: PaintedRecipe;
/** Dark green cloth in soft diagonal folds with a satin sheen along them. */
export declare const PAINTED_CLOTH: PaintedRecipe;
