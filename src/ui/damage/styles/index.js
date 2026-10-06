import { GlassDamage } from "./GlassDamage.js";
import { HullDamage } from "./HullDamage.js";
import { KintsugiDamage } from "./KintsugiDamage.js";
import { CorruptionDamage } from "./CorruptionDamage.js";
import { ConcreteDamage } from "./ConcreteDamage.js";

/** Damage styles by id: what BaseTheme.damage names. Glass (GMS) is the fallback. */
export const DAMAGE_STYLES = Object.fromEntries(
  [GlassDamage, HullDamage, KintsugiDamage, CorruptionDamage, ConcreteDamage].map(style => [style.id, style])
);
