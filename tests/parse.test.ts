import { describe, expect, it } from 'vitest';
import {
  MAX_CHANNELS,
  MAX_EXPOSURES,
  MIN_CHANNELS,
  parseChannels,
  parseExposures,
} from '../src/core/parse';

describe('通道数边界', () => {
  it.each([
    ['2', 2],
    ['40', 40],
    [' 6 ', 6],
  ] as const)('合法：%s', (raw, want) => {
    expect(parseChannels(raw)).toEqual({ value: want, issue: null });
  });

  it.each(['0', '1', '41', '100', '-3', '2.5', '', 'abc', '六'])('非法：%s', (raw) => {
    const { value, issue } = parseChannels(raw);
    expect(value).toBeNull();
    expect(issue).toBeTruthy();
  });

  it(`边界常量自洽：${MIN_CHANNELS}=2, ${MAX_CHANNELS}=40`, () => {
    expect(parseChannels(String(MIN_CHANNELS)).issue).toBeNull();
    expect(parseChannels(String(MAX_CHANNELS)).issue).toBeNull();
    expect(parseChannels(String(MIN_CHANNELS - 1)).issue).toBeTruthy();
    expect(parseChannels(String(MAX_CHANNELS + 1)).issue).toBeTruthy();
  });
});

describe('向量长度错误边界', () => {
  it('通道数 2：长度 1/3 均报错并指出行号，长度 2 合法', () => {
    const text = ['a 1 01', 'b 1 1', 'c 1 101'].join('\n');
    const { exposures, issues } = parseExposures(text, 2);
    expect(exposures.map((e) => e.id)).toEqual(['a']);
    const lenIssues = issues.filter((i) => i.message.includes('长度'));
    expect(lenIssues.map((i) => i.line)).toEqual([2, 3]);
    expect(lenIssues[0].message).toContain('须等于通道数 2');
  });

  it('通道数 40：39/41 位报错，40 位合法', () => {
    const ok = '1'.repeat(40);
    const short = '1'.repeat(39);
    const long = '1'.repeat(41);
    const { exposures, issues } = parseExposures(
      [`a 1 ${ok}`, `b 1 ${short}`, `c 1 ${long}`].join('\n'),
      40,
    );
    expect(exposures.map((e) => e.id)).toEqual(['a']);
    expect(issues.filter((i) => i.message.includes('长度')).map((i) => i.line)).toEqual([2, 3]);
  });

  it('通道数非法时仍解析其余字段但不结论长度', () => {
    const { issues } = parseExposures('a 1 0101\nb 2 11', null);
    expect(issues).toEqual([]);
  });
});

describe('字段合法性', () => {
  it('标识须为可打印 ASCII 且唯一', () => {
    const { issues } = parseExposures('好 1 01\na 1 10\na 2 01', 2);
    expect(issues.some((i) => i.line === 1 && i.message.includes('ASCII'))).toBe(true);
    expect(issues.some((i) => i.line === 3 && i.message.includes('第 2 行'))).toBe(true);
  });

  it('代价须为正整数', () => {
    const { issues } = parseExposures('a 0 01\nb -1 10\nc 1.5 11\nd x 01', 2);
    expect(issues.filter((i) => i.message.includes('代价')).map((i) => i.line)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('覆盖向量仅含 0/1 且非全零', () => {
    const { issues } = parseExposures('a 1 012\nb 1 00', 2);
    expect(issues.some((i) => i.line === 1 && i.message.includes('0/1'))).toBe(true);
    expect(issues.some((i) => i.line === 2 && i.message.includes('全为 0'))).toBe(true);
  });

  it('字段数须恰为 3', () => {
    const { issues } = parseExposures('a 1\nb 1 01 10', 2);
    expect(issues.filter((i) => i.line !== null).map((i) => i.line)).toEqual([1, 2]);
  });

  it('空行与整行注释被忽略', () => {
    const { exposures, issues } = parseExposures('\n# 注释\na 1 01\n\n  \nb 1 10\n', 2);
    expect(issues).toEqual([]);
    expect(exposures.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('曝光数量边界', () => {
  const line = (i: number) => `e${i} 1 ${i % 2 === 0 ? '01' : '10'}`;

  it('少于 2 条报错', () => {
    const { issues } = parseExposures(line(0), 2);
    expect(issues.some((i) => i.line === null && i.message.includes('不足下限'))).toBe(true);
  });

  it('恰为 160 条合法', () => {
    const text = Array.from({ length: MAX_EXPOSURES }, (_, i) => line(i)).join('\n');
    const { exposures, issues } = parseExposures(text, 2);
    expect(exposures).toHaveLength(MAX_EXPOSURES);
    expect(issues).toEqual([]);
  });

  it('161 条报错', () => {
    const text = Array.from({ length: MAX_EXPOSURES + 1 }, (_, i) => line(i)).join('\n');
    const { issues } = parseExposures(text, 2);
    expect(issues.some((i) => i.line === null && i.message.includes('超过上限'))).toBe(true);
  });
});

describe('录入顺序无关', () => {
  it('同样的数据任意换行/乱序得到同样的曝光集合', () => {
    const a = parseExposures('x 3 10\ny 1 11\nz 2 01', 2).exposures;
    const b = parseExposures('\n# 注释\nz 2 01\n\nx 3 10\ny 1 11\n', 2).exposures;
    const key = (list: typeof a) =>
      list
        .map((e) => `${e.id}|${e.cost}|${e.bits.toString(2)}`)
        .sort()
        .join(';');
    expect(key(a)).toBe(key(b));
  });
});
