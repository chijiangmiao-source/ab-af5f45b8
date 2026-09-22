/**
 * GF(2) 上的线性代数原语。向量以 bigint 位掩码表示，
 * bit 位置即列下标（0 起），最高置位即主元列。
 */

/** x 的最高置位下标；x 必须为非零。 */
export function highBit(x: bigint): number {
  return x.toString(2).length - 1;
}

/** 增量式高斯消元：维护一组按主元列对齐的行阶梯。 */
export class RowReducer {
  /** pivotBit -> 已约化行（该行最高置位为 pivotBit，且不含其他主元列）。 */
  private pivots = new Map<number, bigint>();

  /** 用现有主元行约化 x，返回残余（0 表示线性相关）。 */
  reduce(x: bigint): bigint {
    let r = x;
    while (r !== 0n) {
      const hb = highBit(r);
      const p = this.pivots.get(hb);
      if (p === undefined) return r;
      r ^= p;
    }
    return 0n;
  }

  /**
   * 尝试把 x 加入行空间。
   * 线性独立：纳入并返回新主元列下标；线性相关：返回 null。
   */
  add(x: bigint): number {
    const r = this.reduce(x);
    if (r === 0n) return -1;
    const hb = highBit(r);
    // 保持行阶梯形态：从既有主元行中消去新主元列。
    for (const [bit, row] of this.pivots) {
      if (((row >> BigInt(hb)) & 1n) === 1n) this.pivots.set(bit, row ^ r);
    }
    this.pivots.set(hb, r);
    return hb;
  }

  get rank(): number {
    return this.pivots.size;
  }

  /** 当前行阶梯（RREF）快照，按主元列降序（自上而下即阶梯形）。 */
  rows(): { pivot: number; bits: bigint }[] {
    return [...this.pivots.entries()]
      .map(([pivot, bits]) => ({ pivot, bits }))
      .sort((a, b) => b.pivot - a.pivot);
  }
}

/**
 * 把一组向量化为约化行阶梯形（RREF）。
 * 返回按主元列降序排列的行（自上而下即阶梯形）。
 */
export function rrefRows(vectors: bigint[]): { pivot: number; bits: bigint }[] {
  const red = new RowReducer();
  for (const v of vectors) red.add(v);
  return red.rows();
}
