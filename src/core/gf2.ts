/**
 * GF(2) 上的线性代数工具。向量用 bigint 表示，第 (channels - c) 位对应第 c 列。
 */

/** v > 0 时返回最高有效位的位序号（0 起）。 */
export function highestBit(v: bigint): number {
  return v.toString(2).length - 1;
}

/** 增量式线性基（行阶梯形），用于无关性判定。 */
export class LinearBasis {
  private rows = new Map<number, bigint>();
  size = 0;

  /** 尝试把 v 加入基中；v 与现有基线性无关时插入并返回 true，否则返回 false。 */
  add(v0: bigint): boolean {
    let v = v0;
    while (v !== 0n) {
      const lb = highestBit(v);
      const row = this.rows.get(lb);
      if (row === undefined) {
        this.rows.set(lb, v);
        this.size += 1;
        return true;
      }
      v ^= row;
    }
    return false;
  }
}

/** 向量集合在 GF(2) 上的秩。 */
export function rankOf(vecs: Iterable<bigint>): number {
  const basis = new LinearBasis();
  for (const v of vecs) basis.add(v);
  return basis.size;
}

/**
 * 高斯-若尔当消元，返回行最简形（RREF）的非零行与主元列（1 起）。
 * 结果唯一，与输入行的顺序无关，可作为行空间的规范见证。
 */
export function rref(vecs: bigint[], channels: number): { rows: bigint[]; pivots: number[] } {
  const rows = vecs.filter((v) => v !== 0n);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 1; c <= channels && r < rows.length; c++) {
    const bit = 1n << BigInt(channels - c);
    let piv = -1;
    for (let i = r; i < rows.length; i++) {
      if (rows[i] & bit) {
        piv = i;
        break;
      }
    }
    if (piv < 0) continue;
    const tmp = rows[r];
    rows[r] = rows[piv];
    rows[piv] = tmp;
    for (let i = 0; i < rows.length; i++) {
      if (i !== r && (rows[i] & bit)) rows[i] ^= rows[r];
    }
    pivots.push(c);
    r++;
  }
  return { rows: rows.slice(0, r), pivots };
}
