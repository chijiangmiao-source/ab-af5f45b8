import { RowReducer, highBit, rrefRows } from './gf2';
import type { Exposure } from './types';

/** 曝光归属：必选 = 所有最优基组成员；可选 = 部分最优基组成员；从不 = 不属任何最优基组。 */
export type Status = 'required' | 'optional' | 'never';

export interface EliminationStep {
  id: string;
  cost: number;
  selected: boolean;
  /** 入选时的主元列下标（bit 位）；未入选为 -1。 */
  pivot: number;
}

export interface ClassifiedExposure {
  id: string;
  cost: number;
  bits: bigint;
  status: Status;
  inCanonical: boolean;
}

export interface Analysis {
  channels: number;
  /** 全部曝光行空间的秩，即基组大小。 */
  rank: number;
  /** 最优（最小）总代价。 */
  totalCost: number;
  /** 规范基组，按贪心入选顺序。 */
  canonicalIds: string[];
  /** 规范基组，按标识升序（规范裁决的输出形态）。 */
  canonicalSortedIds: string[];
  /** 贪心消元主元见证：按 (代价升序, 标识升序) 的处理顺序逐条记录。 */
  steps: EliminationStep[];
  /** 规范基组的约化行阶梯形（主元见证矩阵）。 */
  rref: { pivot: number; bits: bigint }[];
  /** 每条曝光的归属，按标识升序。 */
  classification: ClassifiedExposure[];
}

/** 标识序：ASCII 码位升序。 */
export function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Vec {
  id: string;
  cost: number;
  bits: bigint;
}

interface BasisResult {
  ids: string[];
  cost: number;
  rank: number;
}

/**
 * 线性拟阵上的最小权基：按 (代价升序, 标识升序) 贪心取独立元。
 * 第一关键字精确最小化总代价；第二关键字等价于在同代价基组中
 * 最大化 Σ 2^(-标识名次)，即取标识升序序列字典序最小者——规范解。
 */
function minCostBasis(exps: Vec[]): BasisResult {
  const sorted = [...exps].sort((x, y) => x.cost - y.cost || cmpId(x.id, y.id));
  const red = new RowReducer();
  const ids: string[] = [];
  let cost = 0;
  for (const e of sorted) {
    if (red.add(e.bits) >= 0) {
      ids.push(e.id);
      cost += e.cost;
    }
  }
  return { ids, cost, rank: red.rank };
}

/**
 * GF(2) 线性拟阵的收缩 S/e：把其余向量投影到商空间 V/span(v_e)。
 * 取 v_e 的最高置位 p，把其他向量在 p 上的分量消去并删除该坐标。
 */
function contract(exps: Vec[], e: Vec): Vec[] {
  const p = BigInt(highBit(e.bits));
  const out: Vec[] = [];
  for (const f of exps) {
    if (f.id === e.id) continue;
    let b = f.bits;
    if (((b >> p) & 1n) === 1n) b ^= e.bits;
    const low = b & ((1n << p) - 1n);
    const high = b >> (p + 1n);
    out.push({ id: f.id, cost: f.cost, bits: (high << p) | low });
  }
  return out;
}

/**
 * 对全部曝光做审计。输入顺序无关：内部所有排序键都是全序且确定的，
 * 相同数据任意换行、任意录入顺序都得到逐字节相同的结论。
 */
export function analyze(channels: number, exposures: Exposure[]): Analysis {
  const all: Vec[] = exposures.map((e) => ({ id: e.id, cost: e.cost, bits: e.bits }));

  const opt = minCostBasis(all);

  // 规范基组 + 消元主元见证
  const sorted = [...all].sort((x, y) => x.cost - y.cost || cmpId(x.id, y.id));
  const red = new RowReducer();
  const steps: EliminationStep[] = [];
  const canonicalIds: string[] = [];
  for (const e of sorted) {
    const pivot = red.add(e.bits);
    const selected = pivot >= 0;
    steps.push({ id: e.id, cost: e.cost, selected, pivot });
    if (selected) canonicalIds.push(e.id);
  }
  const canonicalSet = new Set(canonicalIds);
  const rref = rrefRows(canonicalIds.map((id) => all.find((e) => e.id === id)!.bits));

  // 归属分类：收缩判“可入某些最优基组”，删除判“所有最优基组必选”。
  const classification: ClassifiedExposure[] = [...all]
    .sort((x, y) => cmpId(x.id, y.id))
    .map((e) => {
      const inSome = e.cost + minCostBasis(contract(all, e)).cost === opt.cost;
      let status: Status;
      if (!inSome) {
        status = 'never';
      } else {
        const rest = all.filter((f) => f.id !== e.id);
        const del = minCostBasis(rest);
        status = del.rank < opt.rank || del.cost > opt.cost ? 'required' : 'optional';
      }
      return { id: e.id, cost: e.cost, bits: e.bits, status, inCanonical: canonicalSet.has(e.id) };
    });

  return {
    channels,
    rank: opt.rank,
    totalCost: opt.cost,
    canonicalIds,
    canonicalSortedIds: [...canonicalIds].sort(cmpId),
    steps,
    rref,
    classification,
  };
}
