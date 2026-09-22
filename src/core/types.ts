/** 一条校准曝光记录。bits 的第 (channels - c) 位对应第 c 个通道（1 起）。 */
export interface Exposure {
  id: string;
  cost: bigint;
  bits: bigint;
  /** 录入文本中的行号（1 起），用于错误定位与展示。 */
  line: number;
}

export interface ParseIssue {
  /** 出错行号（1 起）；null 表示全局问题（如数量越界、通道数非法）。 */
  line: number | null;
  message: string;
}

/** required=所有最优基组必选；optional=部分最优基组可选；never=从不入选。 */
export type Classification = 'required' | 'optional' | 'never';

export interface Analysis {
  /** 全部曝光在 GF(2) 上的行秩。 */
  rank: number;
  /** 最优（最小）总代价。 */
  totalCost: bigint;
  /** 规范基组：最小代价基组中按标识升序字典序最小者，此处按标识升序给出。 */
  canonicalIds: string[];
  /** 每条曝光的归属分类。 */
  classes: Map<string, Classification>;
  /** 全部曝光行最简形（RREF）的非零行，按主元列升序。 */
  rrefRows: bigint[];
  /** 主元列（1 起）。 */
  pivots: number[];
  /** 规范基组的 RREF 与全部曝光的 RREF 是否一致（同一行空间的见证）。 */
  sameSpan: boolean;
}
