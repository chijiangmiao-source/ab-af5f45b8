import type { Exposure, ParseError, ParseResult } from './types';

export const MIN_CHANNELS = 2;
export const MAX_CHANNELS = 40;
export const MIN_EXPOSURES = 2;
export const MAX_EXPOSURES = 160;

interface Token {
  text: string;
  line: number;
  col: number;
}

const isWs = (c: string): boolean => /\s/.test(c);

/**
 * 把输入切为带行列位置的词元。任意空白（含换行）都是分隔符，
 * 因此同样的数据换行或折叠到一行，解析结果完全一致。
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (isWs(c)) {
      if (c === '\n') {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
      i += 1;
      continue;
    }
    const startCol = col;
    const startLine = line;
    let j = i;
    while (j < input.length && !isWs(input[j])) j += 1;
    tokens.push({ text: input.slice(i, j), line: startLine, col: startCol });
    col += j - i;
    i = j;
  }
  return tokens;
}

const err = (t: Token, message: string): ParseError => ({
  line: t.line,
  col: t.col,
  token: t.text,
  message,
});

/**
 * 文法（词元流，与换行无关）：
 *   channels <N>            —— N ∈ [2, 40]
 *   (<id> <cost> <bits>)*   —— 每条曝光一个三元组，条数 ∈ [2, 160]
 * 任何非法输入都会保留在原文本中，并在此报告全部出错位置。
 */
export function parse(input: string): ParseResult {
  const tokens = tokenize(input);
  const errors: ParseError[] = [];

  if (tokens.length === 0) {
    return {
      ok: false,
      errors: [
        { line: 1, col: 1, token: '', message: '输入为空：需要 channels <N> 头部与曝光三元组' },
      ],
    };
  }

  // ---- 头部：channels <N> ----
  const head = tokens[0];
  let channels = Number.NaN;
  if (head.text !== 'channels') {
    errors.push(err(head, '首个词元必须是 channels'));
  }
  const nTok = tokens[1];
  if (nTok === undefined) {
    errors.push(err(head, '缺少通道数（channels <N>）'));
  } else if (!/^\d+$/.test(nTok.text)) {
    errors.push(err(nTok, '通道数必须是正整数'));
  } else {
    channels = Number(nTok.text);
    if (channels < MIN_CHANNELS || channels > MAX_CHANNELS) {
      errors.push(err(nTok, `通道数 ${channels} 超出范围 [${MIN_CHANNELS}, ${MAX_CHANNELS}]`));
    }
  }
  const channelsValid = Number.isInteger(channels) && channels >= MIN_CHANNELS && channels <= MAX_CHANNELS;

  // ---- 曝光三元组 ----
  const rest = tokens.slice(2);
  const dangling = rest.length % 3;
  const complete = rest.length - dangling;
  const exposures: Exposure[] = [];
  const seen = new Map<string, Token>();

  for (let k = 0; k < complete; k += 3) {
    const idTok = rest[k];
    const costTok = rest[k + 1];
    const bitsTok = rest[k + 2];

    let idOk = true;
    if (!/^[\x21-\x7e]+$/.test(idTok.text)) {
      errors.push(err(idTok, '标识必须是非空可打印 ASCII（不允许空白与控制字符）'));
      idOk = false;
    } else {
      const first = seen.get(idTok.text);
      if (first !== undefined) {
        errors.push(
          err(idTok, `标识 "${idTok.text}" 重复（首次出现于第 ${first.line} 行第 ${first.col} 列）`),
        );
        idOk = false;
      } else {
        seen.set(idTok.text, idTok);
      }
    }

    let cost = Number.NaN;
    let costOk = true;
    if (!/^\d+$/.test(costTok.text)) {
      errors.push(err(costTok, '代价必须是正整数'));
      costOk = false;
    } else {
      cost = Number(costTok.text);
      if (!Number.isSafeInteger(cost) || cost < 1) {
        errors.push(err(costTok, '代价必须是 ≥ 1 的安全整数'));
        costOk = false;
      }
    }

    let bits = 0n;
    let bitsOk = true;
    if (!/^[01]+$/.test(bitsTok.text)) {
      errors.push(err(bitsTok, '覆盖向量只能由 0/1 组成'));
      bitsOk = false;
    } else if (channelsValid && bitsTok.text.length !== channels) {
      errors.push(
        err(bitsTok, `覆盖向量长度 ${bitsTok.text.length} 与通道数 ${channels} 不一致`),
      );
      bitsOk = false;
    } else if (!bitsTok.text.includes('1')) {
      errors.push(err(bitsTok, '覆盖向量不能全为零'));
      bitsOk = false;
    } else {
      for (let i = 0; i < bitsTok.text.length; i += 1) {
        if (bitsTok.text[i] === '1') bits |= 1n << BigInt(bitsTok.text.length - 1 - i);
      }
    }

    if (idOk && costOk && bitsOk) exposures.push({ id: idTok.text, cost, bits });
  }

  if (dangling > 0) {
    const t = rest[complete];
    errors.push(
      err(t, `曝光记录不完整：从此处起缺少 ${3 - dangling} 个词元（每条记录需 标识/代价/覆盖向量 三元组）`),
    );
  }

  const count = complete / 3;
  if (errors.length === 0 && (count < MIN_EXPOSURES || count > MAX_EXPOSURES)) {
    errors.push(err(head, `曝光条数 ${count} 超出范围 [${MIN_EXPOSURES}, ${MAX_EXPOSURES}]`));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, channels, exposures };
}
