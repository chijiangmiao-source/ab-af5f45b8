import type { Exposure, ParseIssue } from './types';

export const MIN_CHANNELS = 2;
export const MAX_CHANNELS = 40;
export const MIN_EXPOSURES = 2;
export const MAX_EXPOSURES = 160;

/** 标识：1–32 个可打印 ASCII 字符（不含空白与控制字符）。 */
export const ID_PATTERN = /^[!-~]{1,32}$/;

export function parseChannels(raw: string): { value: number | null; issue: string | null } {
  const t = raw.trim();
  if (!/^[0-9]+$/.test(t)) {
    return { value: null, issue: `通道数须为 ${MIN_CHANNELS}–${MAX_CHANNELS} 的整数` };
  }
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < MIN_CHANNELS || n > MAX_CHANNELS) {
    return { value: null, issue: `通道数 ${t} 越界：须在 ${MIN_CHANNELS}–${MAX_CHANNELS} 之间` };
  }
  return { value: n, issue: null };
}

/**
 * 解析曝光文本：每行一条，格式为「标识 代价 覆盖向量」，
 * 空行与以 # 开头的整行注释被忽略。解析与行序无关：
 * 同样的数据任意换行/乱序录入得到同样的曝光集合与问题列表（按行号呈现）。
 */
export function parseExposures(
  text: string,
  channels: number | null,
): { exposures: Exposure[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const exposures: Exposure[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 3) {
      issues.push({
        line: lineNo,
        message: `应为 3 个字段（标识 代价 覆盖向量），实际为 ${parts.length} 个`,
      });
      return;
    }
    const [id, costRaw, bitsRaw] = parts;
    let bad = false;

    if (!ID_PATTERN.test(id)) {
      issues.push({
        line: lineNo,
        message: `标识 "${id}" 非法：须为 1–32 个可打印 ASCII 字符（不含空白）`,
      });
      bad = true;
    } else if (seen.has(id)) {
      issues.push({ line: lineNo, message: `标识 "${id}" 与第 ${seen.get(id)} 行重复` });
      bad = true;
    }

    let cost = 0n;
    if (!/^[0-9]+$/.test(costRaw)) {
      issues.push({ line: lineNo, message: `代价 "${costRaw}" 非法：须为正整数` });
      bad = true;
    } else {
      cost = BigInt(costRaw);
      if (cost < 1n) {
        issues.push({ line: lineNo, message: `代价 "${costRaw}" 非法：须为正整数（≥ 1）` });
        bad = true;
      }
    }

    let bits = 0n;
    if (!/^[01]+$/.test(bitsRaw)) {
      issues.push({ line: lineNo, message: `覆盖向量 "${bitsRaw}" 非法：仅允许字符 0/1` });
      bad = true;
    } else {
      if (channels !== null && bitsRaw.length !== channels) {
        issues.push({
          line: lineNo,
          message: `覆盖向量长度为 ${bitsRaw.length}，须等于通道数 ${channels}`,
        });
        bad = true;
      }
      bits = BigInt(`0b${bitsRaw}`);
      if (bits === 0n) {
        issues.push({ line: lineNo, message: '覆盖向量不能全为 0' });
        bad = true;
      }
    }

    if (bad) return;
    seen.set(id, lineNo);
    exposures.push({ id, cost, bits, line: lineNo });
  });

  if (exposures.length > MAX_EXPOSURES) {
    issues.push({
      line: null,
      message: `有效曝光 ${exposures.length} 条，超过上限 ${MAX_EXPOSURES}`,
    });
  } else if (exposures.length < MIN_EXPOSURES) {
    issues.push({
      line: null,
      message: `有效曝光 ${exposures.length} 条，不足下限 ${MIN_EXPOSURES}`,
    });
  }

  return { exposures, issues };
}
