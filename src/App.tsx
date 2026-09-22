import { useMemo, useRef, useState } from 'react';
import {
  MAX_CHANNELS,
  MAX_EXPOSURES,
  MIN_CHANNELS,
  MIN_EXPOSURES,
  parseChannels,
  parseExposures,
} from './core/parse';
import { analyze, sortById } from './core/basis';
import { SAMPLE_CHANNELS, SAMPLE_TEXT } from './core/sample';
import type { Analysis, Classification, Exposure, ParseIssue } from './core/types';

const CLASS_LABEL: Record<Classification, string> = {
  required: '必选',
  optional: '可选',
  never: '从不',
};

const CLASS_HINT: Record<Classification, string> = {
  required: '出现在所有最小代价基组中',
  optional: '出现在部分（而非全部）最小代价基组中',
  never: '不出现在任何最小代价基组中',
};

function bitAt(bits: bigint, channels: number, col1: number): boolean {
  return ((bits >> BigInt(channels - col1)) & 1n) === 1n;
}

function BitRow({
  bits,
  channels,
  pivots,
}: {
  bits: bigint;
  channels: number;
  pivots?: Set<number>;
}) {
  const cells = [];
  for (let c = 1; c <= channels; c++) {
    const on = bitAt(bits, channels, c);
    const cls = `bit ${on ? 'on' : 'off'}${pivots?.has(c) ? ' pivot' : ''}`;
    cells.push(
      <span key={c} className={cls}>
        {on ? '1' : '0'}
      </span>,
    );
  }
  return <span className="bitrow">{cells}</span>;
}

function IssueList({ issues }: { issues: ParseIssue[] }) {
  return (
    <section className="panel issues">
      <h2>输入问题（{issues.length}）</h2>
      <p className="muted">非法输入已原样保留，修正以下位置后即可得到结论：</p>
      <ul>
        {issues.map((it, i) => (
          <li key={i}>
            {it.line === null ? (
              <span className="tag global">全局</span>
            ) : (
              <span className="tag line">第 {it.line} 行</span>
            )}
            {it.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Summary({ analysis, count }: { analysis: Analysis; count: number }) {
  const tally: Record<Classification, number> = { required: 0, optional: 0, never: 0 };
  for (const cls of analysis.classes.values()) tally[cls] += 1;
  return (
    <section className="panel">
      <h2>结论总览</h2>
      <div className="cards">
        <div className="card">
          <div className="card-value">{analysis.rank}</div>
          <div className="card-label">行秩 / 基组大小</div>
        </div>
        <div className="card accent">
          <div className="card-value">{analysis.totalCost.toString()}</div>
          <div className="card-label">最小总代价</div>
        </div>
        <div className="card">
          <div className="card-value">{count}</div>
          <div className="card-label">有效曝光条数</div>
        </div>
        <div className="card req">
          <div className="card-value">{tally.required}</div>
          <div className="card-label">必选</div>
        </div>
        <div className="card opt">
          <div className="card-value">{tally.optional}</div>
          <div className="card-label">可选</div>
        </div>
        <div className="card nev">
          <div className="card-value">{tally.never}</div>
          <div className="card-label">从不</div>
        </div>
      </div>
    </section>
  );
}

function CanonicalBasis({ analysis, exposures }: { analysis: Analysis; exposures: Exposure[] }) {
  const byIdMap = new Map(exposures.map((e) => [e.id, e]));
  return (
    <section className="panel">
      <h2>规范基组</h2>
      <p className="muted">
        先精确最小化总代价；并列最小代价的基组中，取标识升序序列字典序最小者。
      </p>
      <ol className="chips">
        {analysis.canonicalIds.map((id) => (
          <li key={id} className="chip">
            <span className="chip-id">{id}</span>
            <span className="chip-cost">代价 {byIdMap.get(id)?.cost.toString()}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Matrix({
  analysis,
  exposures,
  channels,
}: {
  analysis: Analysis;
  exposures: Exposure[];
  channels: number;
}) {
  const canon = new Set(analysis.canonicalIds);
  const head = [];
  for (let c = 1; c <= channels; c++) {
    head.push(
      <th key={c} className={analysis.pivots.includes(c) ? 'pivot-col' : ''}>
        {c}
      </th>,
    );
  }
  return (
    <section className="panel">
      <h2>覆盖矩阵</h2>
      <p className="muted">按标识升序展示（与录入顺序无关）；高亮行为规范基组成员，表头高亮列为主元列。</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标识</th>
              <th>代价</th>
              <th>归属</th>
              {head}
            </tr>
          </thead>
          <tbody>
            {sortById(exposures).map((e) => {
              const cls = analysis.classes.get(e.id)!;
              return (
                <tr key={e.id} className={canon.has(e.id) ? 'in-basis' : ''}>
                  <td className="mono">{e.id}</td>
                  <td className="mono">{e.cost.toString()}</td>
                  <td>
                    <span className={`badge ${cls}`} title={CLASS_HINT[cls]}>
                      {CLASS_LABEL[cls]}
                    </span>
                  </td>
                  {Array.from({ length: channels }, (_, i) => {
                    const c = i + 1;
                    const on = bitAt(e.bits, channels, c);
                    return (
                      <td key={c} className={`cell ${on ? 'on' : 'off'}`}>
                        {on ? '1' : '0'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="legend">
        {(Object.keys(CLASS_LABEL) as Classification[]).map((k) => (
          <li key={k}>
            <span className={`badge ${k}`}>{CLASS_LABEL[k]}</span>
            <span className="muted">{CLASS_HINT[k]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PivotWitness({ analysis, channels }: { analysis: Analysis; channels: number }) {
  const pivotSet = new Set(analysis.pivots);
  return (
    <section className="panel">
      <h2>消元主元见证</h2>
      <p className="muted">
        全部曝光在 GF(2) 上高斯-若尔当消元的行最简形（与行序无关的规范形），主元列：
        {analysis.pivots.map((c) => (
          <span key={c} className="tag pivot-tag">
            第 {c} 列
          </span>
        ))}
      </p>
      <div className="rref">
        {analysis.rrefRows.map((row, i) => (
          <div key={i} className="rref-row">
            <BitRow bits={row} channels={channels} pivots={pivotSet} />
          </div>
        ))}
      </div>
      <p className={analysis.sameSpan ? 'ok' : 'bad'}>
        {analysis.sameSpan
          ? '✓ 规范基组消元得到同一最简形，与全部曝光张成同一行空间。'
          : '✗ 规范基组与全部曝光的行空间不一致（不应出现，请反馈）。'}
      </p>
    </section>
  );
}

export default function App() {
  const [channelsRaw, setChannelsRaw] = useState(SAMPLE_CHANNELS);
  const [text, setText] = useState(SAMPLE_TEXT);
  const gutterRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    const ch = parseChannels(channelsRaw);
    const { exposures, issues } = parseExposures(text, ch.value);
    const allIssues: ParseIssue[] = [
      ...(ch.issue ? [{ line: null, message: `通道数：${ch.issue}` } as ParseIssue] : []),
      ...issues,
    ];
    const analysis =
      allIssues.length === 0 && ch.value !== null ? analyze(exposures, ch.value) : null;
    return { ch, exposures, issues: allIssues, analysis };
  }, [channelsRaw, text]);

  const badLines = new Set(parsed.issues.map((i) => i.line).filter((x): x is number => x !== null));
  const lineCount = text.split('\n').length;

  return (
    <div className="page">
      <header>
        <h1>射电阵列二相校准 · 基组审计</h1>
        <p className="muted">
          在 GF(2) 上挑选与全部曝光张成同一行空间的基组：先精确最小化总代价，再按标识升序序列取规范解；
          并将每条曝光归类为必选 / 可选 / 从不。全部计算在浏览器本地完成，无任何网络调用。
        </p>
      </header>

      <div className="layout">
        <section className="panel editor-panel">
          <h2>录入</h2>
          <label className="field">
            <span>
              通道数（{MIN_CHANNELS}–{MAX_CHANNELS}）
            </span>
            <input
              value={channelsRaw}
              inputMode="numeric"
              onChange={(e) => setChannelsRaw(e.target.value)}
              className={parsed.ch.issue ? 'invalid' : ''}
            />
          </label>
          <label className="field">
            <span>
              曝光（每行：标识 代价 覆盖向量；{MIN_EXPOSURES}–{MAX_EXPOSURES} 条；# 起首为注释）
            </span>
          </label>
          <div className="editor">
            <div className="gutter" ref={gutterRef} aria-hidden>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className={badLines.has(i + 1) ? 'bad-line' : ''}>
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              rows={18}
            />
          </div>
          <div className="toolbar">
            <button
              onClick={() => {
                setChannelsRaw(SAMPLE_CHANNELS);
                setText(SAMPLE_TEXT);
              }}
            >
              载入示例
            </button>
            <button onClick={() => setText('')}>清空</button>
            <span className="muted">有效曝光 {parsed.exposures.length} 条</span>
          </div>
        </section>

        <div className="results">
          {parsed.issues.length > 0 && <IssueList issues={parsed.issues} />}
          {parsed.analysis && parsed.ch.value !== null && (
            <>
              <Summary analysis={parsed.analysis} count={parsed.exposures.length} />
              <CanonicalBasis analysis={parsed.analysis} exposures={parsed.exposures} />
              <Matrix
                analysis={parsed.analysis}
                exposures={parsed.exposures}
                channels={parsed.ch.value}
              />
              <PivotWitness analysis={parsed.analysis} channels={parsed.ch.value} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
