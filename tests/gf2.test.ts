import { describe, expect, it } from 'vitest';
import { LinearBasis, rankOf, rref } from '../src/core/gf2';

const v = (bits: string) => BigInt(`0b${bits}`);

describe('GF(2) 线性基', () => {
  it('无关性判定与秩', () => {
    const basis = new LinearBasis();
    expect(basis.add(v('100'))).toBe(true);
    expect(basis.add(v('010'))).toBe(true);
    expect(basis.add(v('110'))).toBe(false); // 100 + 010
    expect(basis.add(v('001'))).toBe(true);
    expect(basis.size).toBe(3);
    expect(rankOf([v('100'), v('010'), v('110'), v('001')])).toBe(3);
    expect(rankOf([v('101'), v('101'), v('101')])).toBe(1);
  });

  it('行最简形：主元与规范形', () => {
    const { rows, pivots } = rref([v('110'), v('010'), v('001')], 3);
    expect(pivots).toEqual([1, 2, 3]);
    expect(rows).toEqual([v('100'), v('010'), v('001')]);
  });

  it('行最简形与行序无关', () => {
    const a = rref([v('110'), v('010'), v('001'), v('110')], 3);
    const b = rref([v('001'), v('110'), v('110'), v('010')], 3);
    expect(a.rows).toEqual(b.rows);
    expect(a.pivots).toEqual(b.pivots);
    expect(a.rows).toEqual([v('100'), v('010'), v('001')]);
  });

  it('秩亏集合的主元列', () => {
    const { rows, pivots } = rref([v('1010'), v('0101'), v('1111')], 4);
    expect(pivots).toEqual([1, 2]);
    expect(rows).toEqual([v('1010'), v('0101')]);
  });
});
