import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/basis';
import { rankOf } from '../src/core/gf2';
import { parseExposures } from '../src/core/parse';
import { SAMPLE_CHANNELS, SAMPLE_TEXT } from '../src/core/sample';
import type { Classification, Exposure } from '../src/core/types';

const exp = (id: string, cost: number, bits: string): Exposure => ({
  id,
  cost: BigInt(cost),
  bits: BigInt(`0b${bits}`),
  line: 0,
});

/** 暴力枚举全部大小为秩的无关子集，作为精确参照。 */
function bruteForce(exposures: Exposure[]) {
  const rank = rankOf(exposures.map((e) => e.bits));
  const n = exposures.length;
  let bestCost: bigint | null = null;
  let bestSets: string[][] = [];
  const picked: number[] = [];
  const rec = (start: number) => {
    if (picked.length === rank) {
      if (rankOf(picked.map((i) => exposures[i].bits)) !== rank) return;
      const cost = picked.reduce((s, i) => s + exposures[i].cost, 0n);
      const ids = picked.map((i) => exposures[i].id).sort();
      if (bestCost === null || cost < bestCost) {
        bestCost = cost;
        bestSets = [ids];
      } else if (cost === bestCost) {
        bestSets.push(ids);
      }
      return;
    }
    for (let i = start; i < n; i++) {
      picked.push(i);
      rec(i + 1);
      picked.pop();
    }
  };
  rec(0);
  expect(bestCost).not.toBeNull();
  bestSets.sort((a, b) => {
    for (let k = 0; k < a.length; k++) {
      if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
    }
    return 0;
  });
  const classes = new Map<string, Classification>();
  for (const e of exposures) {
    const inAll = bestSets.every((s) => s.includes(e.id));
    const inSome = bestSets.some((s) => s.includes(e.id));
    classes.set(e.id, inAll ? 'required' : inSome ? 'optional' : 'never');
  }
  return { rank, totalCost: bestCost!, canonicalIds: bestSets[0], classes };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const classEntries = (m: Map<string, Classification>) => [...m.entries()].sort();

describe('同代价基组分类', () => {
  it('代价全并列时：必选/可选/从不的归属与暴力枚举一致', () => {
    const exposures = [
      exp('a', 1, '100'),
      exp('b', 1, '010'),
      exp('c', 1, '001'),
      exp('d', 1, '110'),
      exp('e', 5, '100'),
    ];
    const result = analyze(exposures, 3);
    expect(result.totalCost).toBe(3n);
    expect(result.canonicalIds).toEqual(['a', 'b', 'c']);
    expect(result.classes.get('c')).toBe('required'); // 001 方向唯一
    expect(result.classes.get('a')).toBe('optional');
    expect(result.classes.get('b')).toBe('optional');
    expect(result.classes.get('d')).toBe('optional'); // 可替代 a 或 b
    expect(result.classes.get('e')).toBe('never'); // 代价过高
    const brute = bruteForce(exposures);
    expect(classEntries(result.classes)).toEqual(classEntries(brute.classes));
  });

  it('同向重复且同价：二者皆为可选', () => {
    const exposures = [exp('p', 2, '10'), exp('q', 2, '10'), exp('r', 3, '01')];
    const result = analyze(exposures, 2);
    expect(result.totalCost).toBe(5n);
    expect(result.canonicalIds).toEqual(['p', 'r']);
    expect(result.classes.get('p')).toBe('optional');
    expect(result.classes.get('q')).toBe('optional');
    expect(result.classes.get('r')).toBe('required');
  });
});

describe('规范裁决（同价并列取标识升序字典序最小）', () => {
  it('录入顺序不影响规范基组', () => {
    // 三条等价覆盖，任意两条都成基；规范解须为 [a, b]
    const exposures = [exp('c', 1, '11'), exp('a', 1, '01'), exp('b', 1, '10')];
    const result = analyze(exposures, 2);
    expect(result.totalCost).toBe(2n);
    expect(result.canonicalIds).toEqual(['a', 'b']);
  });

  it('多组同价并列时逐位取最小标识', () => {
    const exposures = [
      exp('x4', 2, '110'),
      exp('x3', 1, '001'),
      exp('x2', 2, '010'),
      exp('x1', 2, '100'),
    ];
    const result = analyze(exposures, 3);
    expect(result.totalCost).toBe(5n);
    expect(result.canonicalIds).toEqual(['x1', 'x2', 'x3']);
  });

  it('代价优先于标识：小代价大标识胜过反向组合', () => {
    // z 便宜但只能与 a 搭配；b 贵。最小代价唯一基组 {a, z}
    const exposures = [exp('z', 1, '10'), exp('b', 9, '10'), exp('a', 5, '01')];
    const result = analyze(exposures, 2);
    expect(result.totalCost).toBe(6n);
    expect(result.canonicalIds).toEqual(['a', 'z']);
    expect(result.classes.get('z')).toBe('required');
    expect(result.classes.get('b')).toBe('never');
  });
});

describe('录入顺序无关性', () => {
  it('示例数据打乱行序、插入空行注释，结论不变', () => {
    const base = parseExposures(SAMPLE_TEXT, Number(SAMPLE_CHANNELS));
    expect(base.issues).toEqual([]);
    const baseline = analyze(base.exposures, Number(SAMPLE_CHANNELS));

    const lines = SAMPLE_TEXT.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    const rnd = mulberry32(20260922);
    for (let round = 0; round < 20; round++) {
      const shuffled = [...lines];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const text = ['# 乱序重排', '', ...shuffled, '', '# 尾部注释'].join('\n');
      const parsed = parseExposures(text, Number(SAMPLE_CHANNELS));
      expect(parsed.issues).toEqual([]);
      const result = analyze(parsed.exposures, Number(SAMPLE_CHANNELS));
      expect(result.canonicalIds).toEqual(baseline.canonicalIds);
      expect(result.totalCost).toBe(baseline.totalCost);
      expect(classEntries(result.classes)).toEqual(classEntries(baseline.classes));
      expect(result.rrefRows).toEqual(baseline.rrefRows);
      expect(result.pivots).toEqual(baseline.pivots);
    }
  });
});

describe('随机实例对拍（暴力枚举参照）', () => {
  it('300 组随机实例：总代价、规范基组、分类、见证全部一致', () => {
    const rnd = mulberry32(123456789);
    for (let t = 0; t < 300; t++) {
      const channels = 2 + Math.floor(rnd() * 5); // 2..6
      const n = 2 + Math.floor(rnd() * 8); // 2..9
      const exposures: Exposure[] = [];
      for (let i = 0; i < n; i++) {
        const cost = 1 + Math.floor(rnd() * 6);
        const bits = (1 + Math.floor(rnd() * (2 ** channels - 1)))
          .toString(2)
          .padStart(channels, '0');
        exposures.push(exp(`e${i}`, cost, bits));
      }
      const result = analyze(exposures, channels);
      const brute = bruteForce(exposures);
      expect(result.totalCost).toBe(brute.totalCost);
      expect(result.canonicalIds).toEqual(brute.canonicalIds);
      expect(classEntries(result.classes)).toEqual(classEntries(brute.classes));
      expect(result.rank).toBe(brute.rank);
      expect(result.pivots).toHaveLength(result.rank);
      expect(result.sameSpan).toBe(true);
      // 规范基组恰为秩个，且都属于原集合
      expect(result.canonicalIds).toHaveLength(result.rank);
      for (const id of result.canonicalIds) {
        expect(exposures.some((e) => e.id === id)).toBe(true);
      }
    }
  });
});

describe('内置示例的结论', () => {
  it('示例：最小总代价 24，必选/可选/从不分布稳定', () => {
    const parsed = parseExposures(SAMPLE_TEXT, Number(SAMPLE_CHANNELS));
    const result = analyze(parsed.exposures, Number(SAMPLE_CHANNELS));
    expect(result.rank).toBe(6);
    expect(result.totalCost).toBe(24n);
    expect(result.canonicalIds).toEqual(['alpha', 'delta', 'eps', 'mix1', 'mix2', 'zeta']);
    const cls = (id: string) => result.classes.get(id);
    expect(cls('mix1')).toBe('required');
    expect(cls('mix2')).toBe('required');
    expect(cls('zeta')).toBe('required');
    for (const id of ['alpha', 'beta', 'gamma', 'delta', 'eps', 'epsB']) {
      expect(cls(id)).toBe('optional');
    }
    expect(cls('mix3')).toBe('never');
    expect(cls('dup')).toBe('never');
  });
});
