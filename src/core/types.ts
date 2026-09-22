/** 一条曝光记录：唯一 ASCII 标识、正整数代价、非零二进制覆盖向量。 */
export interface Exposure {
  /** 唯一标识，可打印 ASCII（0x21–0x7E）。 */
  id: string;
  /** 正整数代价。 */
  cost: number;
  /**
   * 覆盖向量的位掩码。bit (channels - c) 对应第 c 个通道（1 起），
   * 即录入串最左字符为通道 1。
   */
  bits: bigint;
}

/** 输入非法时的定位错误。 */
export interface ParseError {
  line: number;
  col: number;
  token: string;
  message: string;
}

export interface ParseSuccess {
  ok: true;
  channels: number;
  exposures: Exposure[];
}

export interface ParseFailure {
  ok: false;
  errors: ParseError[];
}

export type ParseResult = ParseSuccess | ParseFailure;
