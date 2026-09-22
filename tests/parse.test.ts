import { describe, expect, it } from 'vitest';
import { parse, tokenize } from '../src/core/parse';

const ok = (input: string) => {
  const r = parse(input);
  if (!r.ok) throw new Error(`预期合法，实际报错: ${JSON.stringify(r.errors)}`);
  return r;
};

const bad = (input: string) => {
  const r = parse(input);
  if (r.ok) throw new Error('预期非法，实际通过');
  return r.errors;
};

describe('词元化与换行无关性', () => {
  it('任意空白（空格/制表/换行）切分结果一致', () => {
    const a = ok('channels 3\na 1 101\nb 2 010');
    const b = ok('channels\t3 a 1 101\r\n\r\n b   2 010\n');
    const c = ok('  channels 3 a 1 101 b 2 010  ');
    expect(a.exposures).toEqual(b.exposures);
    expect(a.exposures).toEqual(c.exposures);
    expect(a.channels).toBe(3);
  });

  it('换行折叠不改变位掩码语义：最左字符对应通道 1', () => {
    const r = ok('channels 4 a 1 1000 b 1 0001');
    expect(r.exposures[0].bits).toBe(0b1000n);
    expect(r.exposures[1].bits).toBe(0b0001n);
  });

  it('tokenize 报告正确的行列位置', () => {
    const toks = tokenize('channels 2\n  x 1 10');
    expect(toks[2]).toMatchObject({ text: 'x', line: 2, col: 3 });
  });
});

describe('头部校验', () => {
  it('空输入', () => {
    expect(bad('   \n ')[0].message).toContain('输入为空');
  });
  it('首词元必须是 channels', () => {
    expect(bad('channel 3 a 1 101 b 1 010')[0].message).toContain('channels');
  });
  it('通道数边界：2 与 40 合法，1 与 41 非法', () => {
    expect(ok('channels 2 a 1 10 b 1 01').channels).toBe(2);
    expect(ok(`channels 40 a 1 ${'1'.padStart(40, '0')} b 1 ${'1'.padStart(40, '0')}`).channels).toBe(40);
    expect(bad('channels 1 a 1 1 b 1 1').some((e) => e.message.includes('超出范围'))).toBe(true);
    expect(bad('channels 41 a 1 1 b 1 1').some((e) => e.message.includes('超出范围'))).toBe(true);
  });
  it('通道数必须是整数', () => {
    expect(bad('channels x a 1 10 b 1 01').some((e) => e.message.includes('正整数'))).toBe(true);
  });
});

describe('曝光三元组校验', () => {
  it('条数边界：2 与 160 合法，1 与 161 非法', () => {
    expect(ok('channels 2 a 1 10 b 1 01').exposures).toHaveLength(2);
    const many = Array.from({ length: 160 }, (_, i) => `e${i} 1 ${'1'.padEnd(6, '0')}`).join(' ');
    expect(ok(`channels 6 ${many}`).exposures).toHaveLength(160);
    expect(bad('channels 2 a 1 10').some((e) => e.message.includes('超出范围'))).toBe(true);
    const tooMany = Array.from({ length: 161 }, (_, i) => `e${i} 1 ${'1'.padEnd(6, '0')}`).join(' ');
    expect(bad(`channels 6 ${tooMany}`).some((e) => e.message.includes('超出范围'))).toBe(true);
  });

  it('标识必须唯一且为可打印 ASCII', () => {
    const errs = bad('channels 2 a 1 10 a 2 01');
    expect(errs.some((e) => e.message.includes('重复') && e.message.includes('第 1 行'))).toBe(true);
    expect(bad('channels 2 甲 1 10 b 1 01').some((e) => e.message.includes('ASCII'))).toBe(true);
  });

  it('代价必须是 ≥1 的整数', () => {
    expect(bad('channels 2 a 0 10 b 1 01').some((e) => e.message.includes('代价'))).toBe(true);
    expect(bad('channels 2 a x 10 b 1 01').some((e) => e.message.includes('代价'))).toBe(true);
    expect(bad('channels 2 a -3 10 b 1 01').some((e) => e.message.includes('代价'))).toBe(true);
  });

  it('覆盖向量长度边界：N±1 报错并定位，恰为 N 通过', () => {
    const short = bad('channels 4 a 1 101 b 1 0101');
    expect(short).toHaveLength(1);
    expect(short[0].message).toContain('长度 3 与通道数 4 不一致');
    expect(short[0]).toMatchObject({ line: 1, col: 16, token: '101' });
    const long = bad('channels 4 a 1 10101 b 1 0101');
    expect(long[0].message).toContain('长度 5 与通道数 4 不一致');
    expect(ok('channels 4 a 1 1010 b 1 0101').exposures).toHaveLength(2);
  });

  it('覆盖向量只能含 0/1 且不能全零', () => {
    expect(bad('channels 2 a 1 1x b 1 01').some((e) => e.message.includes('0/1'))).toBe(true);
    expect(bad('channels 2 a 1 00 b 1 01').some((e) => e.message.includes('全为零'))).toBe(true);
  });

  it('残缺三元组报错并指出起始位置', () => {
    const errs = bad('channels 2 a 1 10 b 1');
    expect(errs.some((e) => e.message.includes('不完整') && e.token === 'b')).toBe(true);
  });

  it('多处错误一次性全部报告', () => {
    const errs = bad('channels 2 a 0 10 a 1 0x c 1 01');
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
});
