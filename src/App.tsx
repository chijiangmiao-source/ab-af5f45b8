import { useMemo, useState } from 'react';
import { parse } from './core/parse';
import { analyze, type Analysis, type Status } from './core/solve';

const SAMPLE = `channels 6
cal-A01 4 101101
cal-B02 4 011010
cal-C03 4 110011
cal-D04 7 100110
cal-E05 2 010101
cal-F06 9 111000
cal-G07 5 001111
cal-H08 6 110100`;

const STATUS_META: Record<Status, { label: string; cls: string; desc: string }> = {
  required: { label: '必选', cls: 'st-required', desc: '出现在所有最优基组中' },
  optional: { label: '可选', cls: 'st-optional', desc: '出现在部分最优基组中' },
  never: { label: '从不', cls: 'st-never', desc: '不出现在任何最优基组中' },
};

/** 通道 c（1 起，左为通道 1）上的覆盖位。 */
function bitAt(bits: bigint, channels: number, c: number): 0 | 1 {
  return Number((bits >> BigInt(channels - c)) & 1n) as 0 | 1;
}

/** bit 主元列下标 -> 通道号（1 起）。 */
const pivotChannel = (channels: number, pivot: number): number => channels - pivot;

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [audited, setAudited] = useState(SAMPLE);
  const [hover, setHover] = useState<string | null>(null);

  const parsed = useMemo(() => parse(audited), [audited]);
  const analysis = useMemo(
    () => (parsed.ok ? analyze(parsed.channels, parsed.exposures) : null),
    [parsed],
  );

  return (
    <div className="page">
      <header>
        <h1>射电阵列二相校准 · GF(2) 基组审计</h1>
        <p className="lede">
          在 GF(2) 上挑选与全部曝光张成同一行空间的基组：先精确最小化总代价，
          再按标识升序序列裁定规范解，并把每条曝光归为必选 / 可选 / 从不。
        </p>
      </header>

      <section className="card">
        <h2>录入</h2>
        <p className="hint">
          词元格式（任意空白/换行分隔）：<code>channels N</code>（2–40），随后每条曝光
          <code>标识 代价 覆盖向量</code> 三元组（2–160 条）。标识为唯一可打印 ASCII，
          代价为正整数，覆盖向量为长度 N 的非零 0/1 串（最左字符对应通道 1）。
          相同数据换行或调整录入顺序不影响结论。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={12}
        />
        <div className="toolbar">
          <button onClick={() => setAudited(text)}>运行审计</button>
          <button className="ghost" onClick={() => { setText(SAMPLE); setAudited(SAMPLE); }}>
            载入示例
          </button>
        </div>
        {!parsed.ok && (
          <div className="errors">
            <h3>非法输入（原文已保留，共 {parsed.errors.length} 处）</h3>
            <ul>
              {parsed.errors.map((e, i) => (
                <li key={i}>
                  <span className="pos">第 {e.line} 行第 {e.col} 列</span>
                  {e.token !== '' && <code className="tok">{e.token}</code>}
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {analysis && <Results analysis={analysis} hover={hover} setHover={setHover} />}

      <footer>
        纯浏览器本地计算，无任何网络调用。排序与规范裁决均按标识的 ASCII 码位升序。
      </footer>
    </div>
  );
}

function Results({
  analysis,
  hover,
  setHover,
}: {
  analysis: Analysis;
  hover: string | null;
  setHover: (id: string | null) => void;
}) {
  const { channels } = analysis;
  const counts: Record<Status, number> = { required: 0, optional: 0, never: 0 };
  for (const c of analysis.classification) counts[c.status] += 1;

  return (
    <>
      <section className="card summary">
        <div className="stat"><span className="k">通道数</span><span className="v">{channels}</span></div>
        <div className="stat"><span className="k">曝光条数</span><span className="v">{analysis.classification.length}</span></div>
        <div className="stat"><span className="k">行空间秩</span><span className="v">{analysis.rank}</span></div>
        <div className="stat"><span className="k">最小总代价</span><span className="v accent">{analysis.totalCost}</span></div>
        <div className="stat"><span className="k">必选 / 可选 / 从不</span>
          <span className="v">{counts.required} / {counts.optional} / {counts.never}</span></div>
      </section>

      <section className="card">
        <h2>规范基组</h2>
        <p className="hint">
          同一代价下按标识升序序列字典序最小裁定；以下为升序展示（入选顺序见消元见证）。
        </p>
        <div className="chips">
          {analysis.canonicalSortedIds.map((id) => (
            <span
              key={id}
              className={`chip ${hover === id ? 'hover' : ''}`}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
            >
              {id}
            </span>
          ))}
        </div>
        <p className="hint">总代价 = {analysis.totalCost}，基组大小 = 秩 = {analysis.rank}。</p>
      </section>

      <section className="card">
        <h2>覆盖矩阵</h2>
        <p className="hint">行按标识升序；高亮行为规范基组成员，末列为归属。</p>
        <div className="scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>标识</th>
                <th>代价</th>
                {Array.from({ length: channels }, (_, i) => (
                  <th key={i}>ch{i + 1}</th>
                ))}
                <th>归属</th>
              </tr>
            </thead>
            <tbody>
              {analysis.classification.map((row) => {
                const meta = STATUS_META[row.status];
                const cls = [
                  row.inCanonical ? 'basis-row' : '',
                  hover === row.id ? 'hover' : '',
                ].join(' ');
                return (
                  <tr
                    key={row.id}
                    className={cls}
                    onMouseEnter={() => setHover(row.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td className="id">{row.id}</td>
                    <td className="cost">{row.cost}</td>
                    {Array.from({ length: channels }, (_, i) => {
                      const b = bitAt(row.bits, channels, i + 1);
                      return <td key={i} className={b ? 'one' : 'zero'}>{b}</td>;
                    })}
                    <td><span className={`badge ${meta.cls}`} title={meta.desc}>{meta.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>消元主元见证</h2>
        <p className="hint">
          规范基组向量的约化行阶梯形（RREF），◆ 为主元列：
          主元通道 {analysis.rref.map((r) => `ch${pivotChannel(channels, r.pivot)}`).join('、')}。
        </p>
        <div className="scroll">
          <table className="matrix rref">
            <thead>
              <tr>
                {Array.from({ length: channels }, (_, i) => (
                  <th key={i}>ch{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.rref.map((row, ri) => (
                <tr key={ri}>
                  {Array.from({ length: channels }, (_, i) => {
                    const b = bitAt(row.bits, channels, i + 1);
                    const isPivot = pivotChannel(channels, row.pivot) === i + 1;
                    return (
                      <td key={i} className={`${b ? 'one' : 'zero'} ${isPivot ? 'pivot' : ''}`}>
                        {isPivot ? '◆' : b}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">贪心消元过程（按 代价升序、标识升序 处理）：</p>
        <div className="scroll">
          <table className="matrix steps">
            <thead>
              <tr><th>#</th><th>标识</th><th>代价</th><th>消元结果</th></tr>
            </thead>
            <tbody>
              {analysis.steps.map((s, i) => (
                <tr
                  key={s.id}
                  className={`${s.selected ? 'basis-row' : ''} ${hover === s.id ? 'hover' : ''}`}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <td>{i + 1}</td>
                  <td className="id">{s.id}</td>
                  <td className="cost">{s.cost}</td>
                  <td>{s.selected ? `入选 · 主元通道 ch${pivotChannel(channels, s.pivot)}` : '线性相关 · 跳过'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>归属分类</h2>
        <p className="hint">
          {(['required', 'optional', 'never'] as Status[]).map((s) => (
            <span key={s} className={`badge ${STATUS_META[s].cls}`}>
              {STATUS_META[s].label} {counts[s]}
            </span>
          ))}
        </p>
        <div className="scroll">
          <table className="matrix">
            <thead>
              <tr><th>标识</th><th>代价</th><th>规范基组</th><th>归属</th><th>含义</th></tr>
            </thead>
            <tbody>
              {analysis.classification.map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <tr
                    key={row.id}
                    className={`${row.inCanonical ? 'basis-row' : ''} ${hover === row.id ? 'hover' : ''}`}
                    onMouseEnter={() => setHover(row.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td className="id">{row.id}</td>
                    <td className="cost">{row.cost}</td>
                    <td>{row.inCanonical ? '✓' : '—'}</td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                    <td className="desc">{meta.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
