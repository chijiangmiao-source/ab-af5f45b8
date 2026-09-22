import { LinearBasis, rankOf, rref } from './gf2';
import type { Analysis, Classification, Exposure } from './types';

/** 按（代价升序, 标识升序）全序排列；标识唯一，故为全序。 */
function byCostThenId(a: Exposure, b: Exposure): number {
  if (a.cost !== b.cost) return a.cost < b.cost ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byId(a: Exposure, b: Exposure): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface GreedyOut {
  feasible: boolean;
  cost: bigint;
  ids: string[];
}

/**
 * 拟阵贪心：按（代价, 标识）升序扫描，凡与已选集合线性无关者即选入。
 * 对「主目标总代价最小、次目标标识升序序列字典序最小」的组合权重
 * W(e) = cost(e)·K − 2^(M−rank_id(e)) 而言，该顺序即 W 升序，
 * 故贪心结果同时是精确最小代价基组与规范（字典序最小）基组。
 * 可强制包含 include、强制排除 excludeId（用于分类判定）。
 */
function greedyBasis(
  sorted: Exposure[],
  rank: number,
  include?: Exposure,
  excludeId?: string,
): GreedyOut {
  const basis = new LinearBasis();
  let cost = 0n;
  const ids: string[] = [];
  if (include !== undefined) {
    basis.add(include.bits);
    cost += include.cost;
    ids.push(include.id);
  }
  for (const e of sorted) {
    if (e.id === excludeId || (include !== undefined && e.id === include.id)) continue;
    if (basis.add(e.bits)) {
      cost += e.cost;
      ids.push(e.id);
    }
  }
  return { feasible: basis.size === rank, cost, ids };
}

/**
 * 全量分析：规范基组、最小总代价、每条曝光的归属分类与消元主元见证。
 * 输入顺序不影响任何结论。
 */
export function analyze(exposures: Exposure[], channels: number): Analysis {
  const sorted = [...exposures].sort(byCostThenId);
  const rank = rankOf(exposures.map((e) => e.bits));

  const canonical = greedyBasis(sorted, rank);
  const canonicalIds = canonical.ids.slice().sort();
  const totalCost = canonical.cost;

  const classes = new Map<string, Classification>();
  for (const e of exposures) {
    const withE = greedyBasis(sorted, rank, e, undefined);
    const withoutE = greedyBasis(sorted, rank, undefined, e.id);
    let cls: Classification;
    if (!withoutE.feasible || withoutE.cost > totalCost) {
      // 排除它后无法达到最小代价（甚至无法张成同一空间）→ 所有最优基组必选
      cls = 'required';
    } else if (withE.feasible && withE.cost === totalCost) {
      // 存在包含它的最优基组，也存在不含它的最优基组 → 部分可选
      cls = 'optional';
    } else {
      cls = 'never';
    }
    classes.set(e.id, cls);
  }

  const full = rref(
    exposures.map((e) => e.bits),
    channels,
  );
  const canonSet = new Set(canonical.ids);
  const canonRref = rref(
    [...exposures].filter((e) => canonSet.has(e.id)).map((e) => e.bits),
    channels,
  );
  const sameSpan =
    full.rows.length === canonRref.rows.length &&
    full.rows.every((row, i) => row === canonRref.rows[i]);

  return {
    rank,
    totalCost,
    canonicalIds,
    classes,
    rrefRows: full.rows,
    pivots: full.pivots,
    sameSpan,
  };
}

/** 供界面按标识升序稳定展示。 */
export function sortById(exposures: Exposure[]): Exposure[] {
  return [...exposures].sort(byId);
}
