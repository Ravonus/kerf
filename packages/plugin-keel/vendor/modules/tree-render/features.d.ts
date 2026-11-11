export declare const TREE_FEATURES: readonly ["roots", "leaves", "flowers", "fruit", "deadwood", "litter", "snow", "fallers", "sway", "shadows", "crownShade", "bark", "sprays", "clumps", "rootSink", "rootBreak"];
export type TreeFeature = (typeof TREE_FEATURES)[number];
export type TreeFeatures = Readonly<Record<TreeFeature, boolean>>;
/**
 * Feature switches, all on by default. Pass an object ({ roots: false }) or a
 * plugin string: "-roots,-fruit" turns those off, "roots=off" too, and a bare
 * name or "name=on" turns one back on. Unknown names are ignored.
 */
export declare function treeFeatures(input?: Partial<Record<TreeFeature, boolean>> | string): TreeFeatures;
