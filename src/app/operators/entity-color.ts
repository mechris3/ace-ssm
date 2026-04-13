/**
 * @fileoverview Entity Type Color Assignment — topology-based color coding.
 *
 * Assigns colors to entity types based on their structural position in the
 * Task Structure graph, without any domain-specific knowledge. The algorithm
 * computes three topological metrics per entity type and maps them to HSL
 * color space:
 *
 *   1. Source ratio (outDegree / totalDegree) → Hue
 *      Pure sources (Disease) get warm hues (red/orange).
 *      Pure sinks (Question) get cool hues (blue/indigo).
 *      Balanced types (Finding) get green/teal.
 *
 *   2. Connectivity (totalDegree / maxDegree) → Saturation
 *      Highly connected types are vivid; isolated types are muted.
 *
 *   3. Depth (shortest path from root / maxDepth) → Lightness
 *      Shallow types (near roots) are brighter; deep types are darker.
 *
 * This is fully domain-independent: the same algorithm assigns warm hues
 * to "Disorder" in a vehicle domain and "Disease" in a medical domain,
 * because they occupy the same topological position (pure source).
 *
 * The color map is computed once when the Task Structure loads and passed
 * to graph components as an input. No colors are stored in the data model.
 *
 * Pure function — no side effects, no service dependencies.
 */

import { IRelation } from '../models/task-structure.model';

/**
 * Converts HSL values to a hex color string.
 * @param h Hue in degrees (0–360)
 * @param s Saturation as fraction (0–1)
 * @param l Lightness as fraction (0–1)
 */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Classifies entity types by their topological metrics in the Task Structure
 * and assigns colors from a continuous HSL mapping.
 *
 * @param entityTypes - All entity type names from the Task Structure
 * @param relations - All relations from the Task Structure
 * @returns A map from entity type name to [fillColor, strokeColor]
 */
export function buildEntityColorMap(
  entityTypes: string[],
  relations: IRelation[]
): Map<string, [string, string]> {
  const colorMap = new Map<string, [string, string]>();

  if (entityTypes.length === 0) return colorMap;

  // ═══════════════════════════════════════════════════════════════════
  // Step 1: Build directed type-level graph
  //
  // Self-loops (e.g., Disease SUBTYPE_OF Disease) are tracked separately.
  // They don't contribute to hierarchical position (in/out degree between
  // types) but they DO carry structural information: a type with a
  // self-loop has internal hierarchy (subtypes, subsumption), which
  // distinguishes it from types without self-loops.
  // ═══════════════════════════════════════════════════════════════════
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const selfLoopCount = new Map<string, number>();
  const outNeighbors = new Map<string, Set<string>>();
  const inNeighbors = new Map<string, Set<string>>();

  // Initialize all types with zero degree
  for (const t of entityTypes) {
    outDegree.set(t, 0);
    inDegree.set(t, 0);
    selfLoopCount.set(t, 0);
    outNeighbors.set(t, new Set());
    inNeighbors.set(t, new Set());
  }

  for (const r of relations) {
    if (r.from === r.to) {
      // Self-loop: track separately
      selfLoopCount.set(r.from, (selfLoopCount.get(r.from) ?? 0) + 1);
      continue;
    }

    outDegree.set(r.from, (outDegree.get(r.from) ?? 0) + 1);
    inDegree.set(r.to, (inDegree.get(r.to) ?? 0) + 1);
    outNeighbors.get(r.from)!.add(r.to);
    inNeighbors.get(r.to)!.add(r.from);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 2: Compute topological metrics for each entity type
  //
  // Metric 1 — Source Ratio: outDegree / (inDegree + outDegree)
  //   1.0 = pure source (only originates relations → root/explaining type)
  //   0.0 = pure sink (only receives relations → leaf/terminal type)
  //   0.5 = balanced (both originates and receives → bridge/observable type)
  //
  // Metric 2 — Depth: BFS shortest path from any root type (pure source)
  //   0 = root type itself
  //   1 = directly connected to a root
  //   2+ = deeper in the hierarchy
  //   Normalized to [0, 1] by dividing by max depth.
  //
  // Metric 3 — Connectivity: totalDegree / maxTotalDegree
  //   1.0 = most connected type (hub)
  //   0.0 = least connected type (peripheral)
  //
  // Metric 4 — Self-Referentiality: number of self-loop relations
  //   0 = no internal hierarchy (Question, Entry_Point)
  //   1+ = has internal hierarchy (Disease SUBTYPE_OF, Finding SUBSUMES)
  //   Types with self-loops get a hue shift to distinguish them from
  //   types at the same depth/connectivity without self-loops.
  // ═══════════════════════════════════════════════════════════════════

  // Metric 1: Source ratio
  const sourceRatio = new Map<string, number>();
  for (const t of entityTypes) {
    const out = outDegree.get(t) ?? 0;
    const inp = inDegree.get(t) ?? 0;
    const total = out + inp;
    sourceRatio.set(t, total > 0 ? out / total : 0.5);
  }

  // Metric 2: Depth via BFS from root types (pure sources with inDegree 0)
  const depth = new Map<string, number>();
  const roots = entityTypes.filter(t => (inDegree.get(t) ?? 0) === 0 && (outDegree.get(t) ?? 0) > 0);

  // BFS from all roots simultaneously
  const queue: [string, number][] = roots.map(r => [r, 0]);
  const visited = new Set<string>(roots);
  for (const r of roots) depth.set(r, 0);

  while (queue.length > 0) {
    const [current, d] = queue.shift()!;
    const neighbors = outNeighbors.get(current) ?? new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        depth.set(neighbor, d + 1);
        queue.push([neighbor, d + 1]);
      }
    }
  }

  // Assign depth to any unvisited types (disconnected from roots)
  for (const t of entityTypes) {
    if (!depth.has(t)) depth.set(t, 0);
  }

  const maxDepth = Math.max(1, ...Array.from(depth.values()));
  const normalizedDepth = new Map<string, number>();
  for (const t of entityTypes) {
    normalizedDepth.set(t, (depth.get(t) ?? 0) / maxDepth);
  }

  // Metric 3: Connectivity (total degree normalized)
  const totalDegree = new Map<string, number>();
  let maxTotalDegree = 1;
  for (const t of entityTypes) {
    const total = (outDegree.get(t) ?? 0) + (inDegree.get(t) ?? 0);
    totalDegree.set(t, total);
    if (total > maxTotalDegree) maxTotalDegree = total;
  }

  const connectivity = new Map<string, number>();
  for (const t of entityTypes) {
    connectivity.set(t, (totalDegree.get(t) ?? 0) / maxTotalDegree);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 3: Map metrics to HSL color space
  //
  // Hue (0–360°) from source ratio:
  //   1.0 (pure source/root)    → 20°  (orange-red, warm)
  //   0.5 (balanced/bridge)     → 160° (teal-green, neutral)
  //   0.0 (pure sink/leaf)      → 250° (blue-indigo, cool)
  //
  //   Self-referentiality shifts the hue by +25° per self-loop.
  //   This separates Organ_System (SUBSUMES self-loop → hue ~275°, purple)
  //   from Question (no self-loop → hue 250°, indigo) even though both
  //   are pure sinks at the same depth.
  //
  // Saturation (0–1) from connectivity:
  //   High connectivity → 70–85% (vivid, attention-grabbing)
  //   Low connectivity  → 40–55% (muted, background)
  //
  // Lightness (0–1) from depth:
  //   Shallow (depth 0) → 55–60% (bright, prominent)
  //   Deep (max depth)  → 40–45% (darker, recessive)
  //
  // The stroke color is a darker variant of the fill (lightness - 12%).
  // ═══════════════════════════════════════════════════════════════════
  for (const t of entityTypes) {
    const sr = sourceRatio.get(t) ?? 0.5;
    const conn = connectivity.get(t) ?? 0.5;
    const dp = normalizedDepth.get(t) ?? 0;
    const selfLoops = selfLoopCount.get(t) ?? 0;

    // Hue: piecewise linear from source ratio
    // sr=1.0 → 20° (orange), sr=0.5 → 160° (teal), sr=0.0 → 250° (indigo)
    let hue: number;
    if (sr >= 0.5) {
      // Source-heavy: interpolate 160° → 20° as sr goes 0.5 → 1.0
      hue = 160 - (sr - 0.5) * 2 * (160 - 20);
    } else {
      // Sink-heavy: interpolate 250° → 160° as sr goes 0.0 → 0.5
      hue = 250 - sr * 2 * (250 - 160);
    }

    // Self-referentiality hue shift: types with internal hierarchy
    // (self-loops) get pushed toward purple/magenta, distinguishing them
    // from flat types at the same position. +25° per self-loop.
    hue = (hue + selfLoops * 25) % 360;

    // Saturation: 45% base + up to 40% from connectivity
    const saturation = 0.45 + conn * 0.40;

    // Lightness: 58% base, decreasing with depth (max -15%)
    const lightness = 0.58 - dp * 0.15;

    const fillColor = hslToHex(hue, saturation, lightness);
    const strokeColor = hslToHex(hue, saturation, Math.max(0.25, lightness - 0.12));

    colorMap.set(t, [fillColor, strokeColor]);
  }

  return colorMap;
}
