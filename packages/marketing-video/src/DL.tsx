// External data upload video: 30 s of marketing, then how a file gets into the forecast.
// Flow follows a real NSPB Data Integration setup (file-based integration → import → map → validate → load → rule);
// every file, member and number is invented demo data.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing-dl.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {Drop, EASE, Flash, LightStage, Marker, Slam, Stage, hash, mix, ramp} from './fx';
import {BlurWords, Big, Eyebrow2, Relay, Sfx, Source2} from './V2';
import {Cursor} from './WF';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL_DL = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['d03_promise', 'd06_open', 'd13_cta']);
const money = (n: number) => n.toLocaleString('en-US');
const RED = '#E0734A';

// Invented CRM pipeline export
const CSV_HEAD = ['Product', 'Region', 'Month', 'Amount', 'Probability'];
const CSV: string[][] = [
  ['Pro Plan', 'NA', 'Jan-27', '420,000', '60%'], ['Pro Plan', 'EMEA', 'Jan-27', '180,000', '50%'], ['Enterprise', 'NA', 'Feb-27', '950,000', '40%'],
  ['Enterprise', 'LATAM', 'Feb-27', '260,000', '70%'], ['Starter', 'APJ', 'Mar-27', '90,000', '80%'], ['Pro Plan', 'NA', 'Mar-27', '510,000', '60%'],
];
const MAPS: [string, string][] = [['Pro Plan', 'Subscriptions · Pro'], ['Enterprise', 'Subscriptions · Enterprise'], ['Starter', 'Subscriptions · Starter'], ['NA', 'North America'], ['EMEA', 'Europe'], ['LATAM', 'Latin America']];

// ======================= 1. HOOK =======================
const S01: React.FC = () => {
  const f = useCurrentFrame();
  const l = L('d01_hook');
  return (
    <Stage>
      {f < 30 && (
        <AbsoluteFill style={{overflow: 'hidden', background: '#0B1F2B', perspective: 900}}>
          <div style={{position: 'absolute', left: -200, top: -100, transform: `rotateX(38deg) rotateZ(-12deg) translateY(${-f * 24}px)`, display: 'grid',
            gridTemplateColumns: 'repeat(10, 250px)', gap: 4}}>
            {Array.from({length: 10 * 18}).map((_, i) => (
              <div key={i} style={{height: 56, background: i % 10 === 0 ? '#1D445A' : 'rgba(255,255,255,0.06)', color: hash(i) > 0.8 ? C.gold : 'rgba(175,200,216,0.7)',
                fontSize: 24, display: 'flex', alignItems: 'center', paddingLeft: 14, fontFamily: 'Consolas, monospace'}}>
                {i % 10 === 0 ? `row_${1000 + i}` : hash(i) > 0.3 ? ['"Pro Plan"', '"NA"', '420000', '0.6', '"Jan-27"', '"EMEA"'][Math.floor(hash(i * 5) * 6)] + ',' : ''}
              </div>
            ))}
          </div>
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 30%, rgba(5,14,20,0.85))'}} />
        </AbsoluteFill>
      )}
      {f >= 30 && f < 36 && <AbsoluteFill style={{background: '#050E14'}} />}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
          <Slam from={at(l, 0, 2)} style={{fontSize: 120, fontWeight: 700, letterSpacing: -5}}>
            Only as good as <span style={{color: C.gold}}>the data.</span>
          </Slam>
          <BlurWords from={at(l, 1, 4)} size={80} weight={600} parts={['Half', 'of', 'it', 'lives', 'outside', 'NetSuite.']} hot={4} color={C.blueLight} />
          <div style={{marginTop: -40, marginLeft: 330}}><Marker from={at(l, 1, 40)} width={300} /></div>
        </div>
      </AbsoluteFill>
      <Flash at={at(l, 0, 2)} peak={0.35} />
      <Sfx at={0} src="whoosh-fast" v={0.3} /><Sfx at={at(l, 0, 0)} src="impact-zoom-quick" v={0.5} /><Sfx at={at(l, 1, 40)} src="marker-pen-line" v={0.35} />
    </Stage>
  );
};

// ======================= 2. PAIN: three sources → copy/paste into the plan =======================
const SRC: [string, string][] = [['CRM', 'pipeline'], ['HR system', 'headcount'], ['Spreadsheet', 'drivers']];
const S02: React.FC = () => {
  const l = L('d02_pain');
  const f = useCurrentFrame();
  const a = at(l, 0, 4), b = at(l, 1, 0);
  return (
    <Stage glow={[0.4, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 260, display: 'flex', flexDirection: 'column', gap: 36}}>
        {SRC.map(([n, s], i) => (
          <Drop key={n} from={a + i * 22} h={140}>
            <div style={{width: 520, padding: '30px 38px', borderRadius: 22, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(175,200,216,0.3)'}}>
              <div style={{fontSize: 52, fontWeight: 700}}>{n}</div><div style={{fontSize: 30, color: C.blueLight}}>{s}</div>
            </div>
          </Drop>
        ))}
      </div>
      <div style={{position: 'absolute', right: 200, top: 360, width: 520, height: 360, borderRadius: 26, background: 'rgba(255,255,255,0.05)', border: '3px dashed rgba(175,200,216,0.4)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity: ramp(f, b - 10, 12)}}>
        <div style={{fontSize: 60, fontWeight: 700}}>The plan</div>
        <div style={{fontSize: 30, color: C.blueLight, marginTop: 8}}>updated by hand · every month</div>
      </div>
      {f > b && [0, 1, 2, 3, 4, 5].map((k) => {
        const t = ((f - b - k * 9) % 54) / 54;
        if (f - b - k * 9 < 0) return null;
        return (
          <div key={k} style={{position: 'absolute', left: mix(700, 1180, t), top: 320 + (k % 3) * 160 + Math.sin(t * Math.PI) * -80, fontSize: 32, fontWeight: 700, color: C.navy,
            background: k % 2 ? C.gold : 'white', padding: '8px 16px', borderRadius: 10, opacity: 1 - Math.abs(t - 0.5) * 1.4, fontFamily: 'Consolas, monospace'}}>{k % 2 ? 'Ctrl+V' : 'Ctrl+C'}</div>
        );
      })}
      <Source2>Illustrative example</Source2>
      {SRC.map((_, i) => <Sfx key={i} at={a + i * 22} src="hit-weak" v={0.35} />)}<Sfx at={b} src="paper-slide" v={0.3} /><Sfx at={b + 30} src="clock-tick-single" v={0.3} />
    </Stage>
  );
};

// ======================= 3. PROMISE: "DATA" mask → three steps =======================
const S03: React.FC = () => {
  const l = L('d03_promise');
  const f = useCurrentFrame();
  const enter = ramp(f, at(l, 0), 20, EASE.snappy);
  const chip = (i: number) => ramp(f, at(l, 1, 4 + i * 26), 14, EASE.overshoot);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `translateY(-40px)`}}>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, marginBottom: -10}}>NetSuite Planning brings external</div>
        <div style={{fontSize: 360, fontWeight: 700, letterSpacing: -14, lineHeight: 1, transform: `scale(${mix(1.08, 1, enter)})`, opacity: enter,
          backgroundImage: `repeating-linear-gradient(180deg, ${C.navy} 0px, ${C.navy} 30px, #24546E 30px, #24546E 34px), linear-gradient(90deg, ${C.navy}, ${C.green})`,
          backgroundBlendMode: 'multiply', backgroundSize: `100% 34px, 100% 100%`, backgroundPosition: `0 ${-f * 3}px, 0 0`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', clipPath: `inset(${(1 - enter) * 100}% 0 0 0)`}}>DATA</div>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, marginTop: -6}}>straight into the model.</div>
        <div style={{display: 'flex', gap: 20, marginTop: 60, alignItems: 'center'}}>
          {['Load a file', 'Map it once', 'Forecast recalculates'].map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && <div style={{fontSize: 50, color: C.gold, fontWeight: 700, opacity: chip(i)}}>→</div>}
              <div style={{padding: '20px 38px', borderRadius: 999, border: `3px solid ${C.gold}`, background: i === 2 ? C.navy : 'white', color: i === 2 ? 'white' : C.navy, fontSize: 44, fontWeight: 600,
                transform: `scale(${chip(i)})`, opacity: Math.min(1, chip(i) * 2), boxShadow: '0 16px 40px rgba(29,68,90,0.15)'}}>{t}</div>
            </React.Fragment>
          ))}
        </div>
      </AbsoluteFill>
      <Sfx at={at(l, 0)} src="swoosh-slow" v={0.3} />
      {[0, 1, 2].map((i) => <Sfx key={i} at={at(l, 1, 4 + i * 26)} src="pop" v={0.3} />)}
    </LightStage>
  );
};

// ======================= 4. VALUE: no retyping · validated · audit trail =======================
const S04: React.FC = () => {
  const l = L('d04_value');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, 0);
  const LOG = ['Jan 03 · 06:00 · CRM pipeline · 1,248 rows ✓', 'Jan 02 · 06:00 · CRM pipeline · 1,231 rows ✓', 'Jan 01 · 06:00 · HR salary file · 412 rows ✓'];
  const card = (title: string, big: string, from: number, body?: React.ReactNode) => (
    <Drop key={title} from={from} h={180}>
      <div style={{width: 500, height: 400, borderRadius: 28, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)', padding: 44, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
        <div style={{fontSize: 110, fontWeight: 700, color: C.gold, letterSpacing: -4, lineHeight: 1}}>{big}</div>
        {body}
        <div style={{fontSize: 46, fontWeight: 700, letterSpacing: -1}}>{title}</div>
      </div>
    </Drop>
  );
  return (
    <Stage>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 150}}><Eyebrow2>What it does for finance</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 44, paddingTop: 60}}>
        {card('No retyping', '0', a)}
        {card('Every load validated', '100%', a + 22)}
        {card('Full audit trail', '', b, (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: -60}}>
            {LOG.map((t, i) => <div key={t} style={{fontSize: 22, color: C.blueLight, fontFamily: 'Consolas, monospace', opacity: ramp(f, b + 10 + i * 8, 10)}}>{t}</div>)}
          </div>
        ))}
      </AbsoluteFill>
      <Sfx at={a} src="hit-weak" v={0.4} /><Sfx at={a + 22} src="hit-weak" v={0.4} /><Sfx at={b} src="hit-weak" v={0.4} />
    </Stage>
  );
};

// ======================= shared: the CSV as a table =======================
const CsvTable: React.FC<{from: number; hotCol?: number; badRow?: number; bad?: number}> = ({from, hotCol = -1, badRow = -1, bad = 0}) => {
  const f = useCurrentFrame();
  const G = '300px 220px 220px 260px 240px';
  return (
    <div style={{borderRadius: 22, background: '#FBFAF7', color: C.ink, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.45)'}}>
      <div style={{padding: '18px 28px', background: '#1E7145', color: 'white', fontSize: 30, fontWeight: 600, fontFamily: 'Consolas, monospace'}}>crm_pipeline_2027-01.csv</div>
      <div style={{display: 'grid', gridTemplateColumns: G, fontSize: 30, fontWeight: 700, color: C.muted, background: '#EEF1EE'}}>
        {CSV_HEAD.map((h, i) => <div key={h} style={{padding: '16px 24px', textAlign: i >= 3 ? 'right' : 'left', background: i === hotCol ? 'rgba(252,202,71,0.6)' : undefined}}>{h}</div>)}
      </div>
      {CSV.map((r, i) => (
        <div key={i} style={{display: 'grid', gridTemplateColumns: G, fontSize: 32, height: 66, alignItems: 'center', borderTop: '2px solid #ECECEC',
          opacity: ramp(f, from + i * 4, 10), background: i === badRow && bad > 0 ? `rgba(224,115,74,${0.3 * bad})` : undefined}}>
          {r.map((v, k) => <div key={k} style={{padding: '0 24px', textAlign: k >= 3 ? 'right' : 'left', fontVariantNumeric: 'tabular-nums', fontWeight: k === hotCol ? 700 : 400,
            color: i === badRow && k === 1 && bad > 0 ? '#B04A2A' : undefined}}>{v}</div>)}
        </div>
      ))}
    </div>
  );
};

// ======================= 5. FILE: "Here is how it works" → the CSV unfolds =======================
const S05: React.FC = () => {
  const l = L('d05_file');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -10);
  return (
    <Stage glow={[0.6, 0.3]}>
      <Relay from={0} to={b}>
        {() => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 10}}>
            <Eyebrow2>Part two</Eyebrow2>
            <BlurWords from={at(l, 0, -4)} size={120} weight={700} parts={['Here', 'is', 'how', 'it', 'works.']} hot={2} color="white" />
          </AbsoluteFill>
        )}
      </Relay>
      <Relay from={b} to={d + 8}>
        {(_, local) => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 1800}}>
            <div style={{transform: `rotateX(${mix(30, 6, ramp(local, 0, 30, EASE.snappy))}deg) scale(${mix(0.8, 1, ramp(local, 0, 30, EASE.snappy))})`}}>
              <CsvTable from={b + 10} hotCol={Math.min(4, Math.floor(Math.max(0, f - at(l, 1, 110)) / 16))} />
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      <Source2>Demo data</Source2>
      <Sfx at={b} src="paper-slide" v={0.4} />
    </Stage>
  );
};

// ======================= 6. OPEN: Data Exchange → integration → run dialog =======================
const INTS: [string, string][] = [['CRM Pipeline', 'File'], ['Income Statement Transactions', 'NetSuite'], ['Balance Sheet Transactions', 'NetSuite'], ['HR Salary File', 'File'], ['Exchange Rates', 'NetSuite']];
const S06: React.FC = () => {
  const l = L('d06_open');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, -6);
  const clickAt = a + 50;
  const P: [number, number, number][] = [[0, 1500, 980], [clickAt - 14, 560, 400], [clickAt, 560, 405], [b + 40, 1180, 760], [b + 52, 1180, 765]];
  const cx = interpolate(f, P.map((p) => p[0]), P.map((p) => p[1]), {...clamp, easing: EASE.smooth});
  const cy = interpolate(f, P.map((p) => p[0]), P.map((p) => p[2]), {...clamp, easing: EASE.smooth});
  const dlg = ramp(f, b, 14, EASE.snappy);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{width: 1500, borderRadius: 26, overflow: 'hidden', background: 'white', boxShadow: '0 40px 100px rgba(29,68,90,0.3)', color: '#1B1B1B', opacity: ramp(f, 0, 14)}}>
          <div style={{height: 70, background: '#2C2A28', color: 'white', fontSize: 30, display: 'flex', alignItems: 'center', padding: '0 36px'}}>Data Exchange · Data Integration</div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 300px 260px', fontSize: 28, color: C.muted, fontWeight: 600, padding: '20px 40px', borderBottom: '2px solid #E6E6E6'}}>
            <div>Integration</div><div>Source</div><div style={{textAlign: 'right'}}>Last run</div>
          </div>
          {INTS.map(([n, s], i) => (
            <div key={n} style={{display: 'grid', gridTemplateColumns: '1fr 300px 260px', fontSize: 36, height: 96, alignItems: 'center', padding: '0 40px', borderBottom: '2px solid #F0F0F0',
              background: i === 0 && f > clickAt ? 'rgba(252,202,71,0.35)' : undefined, fontWeight: i === 0 ? 600 : 400}}>
              <div style={{color: C.navy}}>{n}</div>
              <div><span style={{fontSize: 26, padding: '6px 14px', borderRadius: 8, background: s === 'File' ? C.gold : C.greenLight, color: C.navy, fontWeight: 600}}>{s}</span></div>
              <div style={{textAlign: 'right', color: C.muted, fontSize: 30}}>Today 06:00 ✓</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      {dlg > 0 && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: `rgba(15,42,58,${0.35 * dlg})`}}>
          <div style={{width: 900, borderRadius: 24, background: 'white', padding: '40px 50px', color: '#1B1B1B', boxShadow: '0 40px 100px rgba(0,0,0,0.4)', transform: `scale(${mix(0.92, 1, dlg)})`, opacity: dlg}}>
            <div style={{fontSize: 44, fontWeight: 700, color: C.navy}}>Run Integration · CRM Pipeline</div>
            {[['File', 'crm_pipeline_2027-01.csv'], ['Start period', 'Jan-27'], ['End period', 'Mar-27'], ['Import mode', 'Replace']].map(([k, v], i) => (
              <div key={k} style={{display: 'flex', justifyContent: 'space-between', fontSize: 34, padding: '20px 0', borderBottom: '2px solid #F0F0F0'}}>
                <span style={{color: C.muted}}>{k}</span><span style={{fontWeight: 600, opacity: ramp(f, b + 10 + i * 8, 8)}}>{v}</span>
              </div>
            ))}
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 30}}>
              <div style={{padding: '16px 40px', background: f > b + 52 ? C.gold : '#2C2A28', color: f > b + 52 ? C.navy : 'white', borderRadius: 12, fontSize: 32, fontWeight: 700}}>Run</div>
            </div>
          </div>
        </AbsoluteFill>
      )}
      <Cursor x={cx} y={cy} press={f >= clickAt && f < clickAt + 12 ? (f - clickAt) / 12 : f >= b + 52 && f < b + 64 ? (f - b - 52) / 12 : 0} />
      <Sfx at={clickAt} src="switch-tap" v={0.5} /><Sfx at={b} src="pop" v={0.35} /><Sfx at={b + 52} src="switch-tap" v={0.5} />
    </LightStage>
  );
};

// ======================= 7. MAP: source values → Planning members, then "saved" =======================
const S07: React.FC = () => {
  const l = L('d07_map');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const Y = (i: number) => 330 + i * 100 + (i >= 3 ? 40 : 0);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Mapping · first time only</Eyebrow2></div>
      <div style={{position: 'absolute', left: 230, top: 250, fontSize: 30, color: C.blueLight, fontWeight: 600}}>From the file</div>
      <div style={{position: 'absolute', left: 1180, top: 250, fontSize: 30, color: C.blueLight, fontWeight: 600}}>In Planning</div>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {MAPS.map((_, i) => {
          const t = ramp(f, a + i * 10 + 8, 18, EASE.swift);
          const y = Y(i) + 36;
          return <path key={i} d={`M 620 ${y} C 860 ${y}, 940 ${y}, 1170 ${y}`} stroke={C.gold} strokeWidth={4} fill="none" strokeDasharray={560} strokeDashoffset={560 * (1 - t)} />;
        })}
      </svg>
      {MAPS.map(([s, t], i) => (
        <React.Fragment key={s}>
          <div style={{position: 'absolute', left: 230, top: Y(i), width: 380, height: 72, borderRadius: 14, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(175,200,216,0.3)',
            display: 'flex', alignItems: 'center', padding: '0 24px', boxSizing: 'border-box', fontSize: 34, fontWeight: 600, opacity: ramp(f, a + i * 10, 10), fontFamily: 'Consolas, monospace'}}>
            <span style={{fontSize: 22, color: C.blueLight, marginRight: 14, fontFamily: FONT}}>{i < 3 ? 'Product' : 'Region'}</span>{s}
          </div>
          <div style={{position: 'absolute', left: 1180, top: Y(i), width: 540, height: 72, borderRadius: 14, background: 'white', color: C.navy,
            display: 'flex', alignItems: 'center', padding: '0 24px', boxSizing: 'border-box', fontSize: 34, fontWeight: 600, opacity: ramp(f, a + i * 10 + 20, 10)}}>
            <span style={{fontSize: 22, color: C.green, marginRight: 14}}>{i < 3 ? 'Class' : 'Location'}</span>{t}
          </div>
        </React.Fragment>
      ))}
      <div style={{position: 'absolute', right: 170, top: 120, opacity: ramp(f, b + 6, 12), transform: `rotate(-2deg) scale(${ramp(f, b + 6, 14, EASE.overshoot)})`}}>
        <div style={{background: C.gold, color: C.navy, fontSize: 40, fontWeight: 700, padding: '16px 30px', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>✓ Saved · reused every month</div>
      </div>
      <Source2>Demo data</Source2>
      {MAPS.map((_, i) => <Sfx key={i} at={a + i * 10 + 8} src="switch-tap" v={0.18} />)}<Sfx at={b + 6} src="pop" v={0.4} />
    </Stage>
  );
};

// ======================= 8–9. RUN: import → validate → flag; then fix and re-run =======================
const STEPS = ['Import', 'Validate', 'Load'];
const RunPanel: React.FC<{start: number; failAt?: number; ok?: boolean; rows: number}> = ({start, failAt = -1, ok = false, rows}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 26}}>
      {STEPS.map((s, i) => {
        const t = ramp(f, start + i * 24, 22, EASE.smooth);
        const failed = i === failAt && t >= 1;
        const skipped = failAt >= 0 && i > failAt;
        return (
          <div key={s} style={{width: 720, padding: '24px 32px', borderRadius: 18, background: 'rgba(255,255,255,0.07)', border: `2px solid ${failed ? RED : 'rgba(175,200,216,0.25)'}`, position: 'relative', overflow: 'hidden', opacity: skipped ? 0.35 : 1}}>
            <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(skipped ? 0 : t) * 100}%`, background: failed ? 'rgba(224,115,74,0.35)' : 'rgba(55,104,88,0.45)'}} />
            <div style={{position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 42, fontWeight: 600}}>
              <span>{s}</span>
              <span style={{color: failed ? RED : t >= 1 ? C.gold : C.blueLight}}>{skipped ? '—' : failed ? '⚠ 3 rows' : t >= 1 ? '✓' : `${Math.round(t * 100)}%`}</span>
            </div>
          </div>
        );
      })}
      <div style={{fontSize: 34, color: ok && f >= start + 70 ? C.gold : C.blueLight, fontWeight: 600, marginTop: 10, fontVariantNumeric: 'tabular-nums'}}>
        {money(Math.round(rows * ramp(f, start, 60, EASE.smooth)))} rows{ok && f >= start + 70 ? ' loaded ✓' : ''}
      </div>
    </div>
  );
};
const S08: React.FC = () => {
  const l = L('d08_run');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const bad = ramp(f, b + 40, 12);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Run integration</Eyebrow2></div>
      <div style={{position: 'absolute', left: 140, top: 300}}><RunPanel start={a} failAt={1} rows={1248} /></div>
      <div style={{position: 'absolute', right: 110, top: 290, width: 800, opacity: ramp(f, b + 30, 12), transform: `translateX(${(1 - ramp(f, b + 30, 18, EASE.snappy)) * 60}px)`}}>
        <div style={{fontSize: 30, color: RED, fontWeight: 700, marginBottom: 14}}>Validation · unmapped member</div>
        <div style={{borderRadius: 20, background: '#FBFAF7', color: C.ink, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.45)'}}>
          {[['Starter', 'APJ', 'Mar-27', '90,000'], ['Pro Plan', 'APJ', 'Mar-27', '140,000'], ['Enterprise', 'APJ', 'Mar-27', '310,000']].map((r, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '240px 160px 180px 1fr', fontSize: 32, height: 76, alignItems: 'center', padding: '0 24px', borderTop: i ? '2px solid #ECECEC' : undefined,
              background: `rgba(224,115,74,${0.22 * bad})`}}>
              {r.map((v, k) => <div key={k} style={{textAlign: k === 3 ? 'right' : 'left', color: k === 1 ? '#B04A2A' : undefined, fontWeight: k === 1 ? 700 : 400}}>{v}</div>)}
            </div>
          ))}
        </div>
        <div style={{fontSize: 30, color: C.blueLight, marginTop: 16}}>Region “APJ” has no Location mapping</div>
      </div>
      <Source2>Demo data</Source2>
      {STEPS.map((_, i) => <Sfx key={i} at={a + i * 24} src="data-scan" v={0.15} />)}<Sfx at={a + 46} src="bass-hit-short" v={0.4} />
    </Stage>
  );
};
const S09: React.FC = () => {
  const l = L('d09_fix');
  const f = useCurrentFrame();
  const a = at(l, 0, 0);
  const add = ramp(f, a, 14, EASE.overshoot);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Fix · run again</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 300, display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${add})`, transformOrigin: '0 50%'}}>
        <div style={{padding: '22px 30px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(175,200,216,0.3)', fontSize: 38, fontWeight: 600, fontFamily: 'Consolas, monospace'}}>APJ</div>
        <div style={{fontSize: 50, color: C.gold, fontWeight: 700}}>→</div>
        <div style={{padding: '22px 30px', borderRadius: 14, background: 'white', color: C.navy, fontSize: 38, fontWeight: 600}}><span style={{fontSize: 24, color: C.green, marginRight: 12}}>Location</span>Asia Pacific</div>
      </div>
      <div style={{position: 'absolute', left: 170, top: 470}}><RunPanel start={a + 18} ok rows={1248} /></div>
      <div style={{position: 'absolute', right: 200, top: 420, opacity: ramp(f, a + 90, 12)}}>
        <Slam from={a + 90} shake={8}><Big color={C.gold}>Clean ✓</Big></Slam>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="pop" v={0.4} />{STEPS.map((_, i) => <Sfx key={i} at={a + 18 + i * 24} src="data-scan" v={0.15} />)}<Sfx at={a + 90} src="sparkle" v={0.35} />
    </Stage>
  );
};

// ======================= 10. CALC: amount × probability =======================
const S10: React.FC = () => {
  const l = L('d10_calc');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, 0);
  const res = ramp(f, b + 40, 30, EASE.smooth);
  const card = (label: string, v: string, from: number, gold = false) => (
    <Drop from={from} h={160}>
      <div style={{width: 420, padding: '36px 40px', borderRadius: 24, background: gold ? C.gold : 'rgba(255,255,255,0.08)', color: gold ? C.navy : 'white',
        border: gold ? undefined : '2px solid rgba(175,200,216,0.3)', textAlign: 'center'}}>
        <div style={{fontSize: 30, fontWeight: 500, color: gold ? C.navy : C.blueLight}}>{label}</div>
        <div style={{fontSize: 84, fontWeight: 700, letterSpacing: -3, fontVariantNumeric: 'tabular-nums'}}>{v}</div>
      </div>
    </Drop>
  );
  return (
    <Stage glow={[0.5, 0.3]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 170}}><Eyebrow2>Rule · Pipeline to Forecast</Eyebrow2></AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', fontSize: 34, color: C.blueLight, opacity: ramp(f, b, 12)}}>Pro Plan · North America · Jan-27</div>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 30}}>
        {card('Amount', '$420K', a)}
        <Slam from={a + 14} shake={4}><div style={{fontSize: 100, fontWeight: 700, color: C.gold}}>×</div></Slam>
        {card('Probability', '60%', a + 20)}
        <Slam from={b + 30} shake={10}><div style={{fontSize: 100, fontWeight: 700, color: C.gold}}>=</div></Slam>
        {card('Forecast', `$${Math.round(252 * res)}K`, b + 36, true)}
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 170, textAlign: 'center', fontSize: 38, fontWeight: 600, opacity: ramp(f, b + 70, 12)}}>
        for every product · every region · every month
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="hit-weak" v={0.4} /><Sfx at={a + 20} src="hit-weak" v={0.4} /><Sfx at={b + 30} src="bass-hit-short" v={0.45} /><Sfx at={b + 70} src="sparkle" v={0.3} />
    </Stage>
  );
};

// ======================= 11. RESULT: forecast by month, pipeline share in gold =======================
const BASE = [3.8, 3.9, 4.1, 4.2, 4.3, 4.5];
const PIPE = [0.5, 0.9, 1.3, 1.0, 0.8, 0.6];
const S11: React.FC = () => {
  const l = L('d11_result');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, 0);
  const pipeOn = ramp(f, a + 20, 30, EASE.smooth);
  const H = 520 / 6;
  const pipeTotal = PIPE.reduce((s, v) => s + v, 0);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Revenue forecast · Jan – Jun 27</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Updated on its own</div>
      <div style={{position: 'absolute', left: 170, width: 1100, bottom: 200, display: 'flex', alignItems: 'flex-end', gap: 50, height: 620}}>
        {BASE.map((v, i) => (
          <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <div style={{width: '100%', display: 'flex', flexDirection: 'column-reverse', height: 560}}>
              <div style={{height: v * H * ramp(f, a + i * 4, 16, EASE.overshoot), background: '#3F7C9C'}} />
              <div style={{height: PIPE[i] * H * pipeOn, background: C.gold, borderRadius: '8px 8px 0 0', boxShadow: '0 0 20px rgba(252,202,71,0.4)'}} />
            </div>
            <div style={{fontSize: 28, color: C.blueLight, marginTop: 14}}>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i]}</div>
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', right: 170, top: 360, width: 460, opacity: ramp(f, b, 12)}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: C.blueLight}}><div style={{width: 26, height: 26, borderRadius: 6, background: '#3F7C9C'}} />Existing forecast</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: C.blueLight, marginTop: 14}}><div style={{width: 26, height: 26, borderRadius: 6, background: C.gold}} />From the pipeline file</div>
        <div style={{fontSize: 30, color: C.blueLight, marginTop: 50}}>From pipeline</div>
        <Slam from={b + 10} shake={8}><div style={{fontSize: 120, fontWeight: 700, color: C.gold, letterSpacing: -4}}>${pipeTotal.toFixed(1)}M</div></Slam>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={a + 20} src="riser-cine" v={0.2} /><Sfx at={b + 10} src="impact-zoom-quick" v={0.35} />
    </Stage>
  );
};

// ======================= 12. SCHEDULE: daily 6:00 AM, a week of green loads =======================
const S12: React.FC = () => {
  const l = L('d12_schedule');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, 0);
  const sweep = ramp(f, a, 40, EASE.smooth);
  return (
    <Stage glow={[0.5, 0.3]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 150}}><Eyebrow2>Schedule</Eyebrow2></AbsoluteFill>
      <div style={{position: 'absolute', left: 360, top: 330, width: 360, height: 360, borderRadius: '50%', border: '8px solid rgba(175,200,216,0.35)', opacity: ramp(f, a, 12)}}>
        <div style={{position: 'absolute', left: 172, top: 40, width: 8, height: 140, background: 'white', borderRadius: 4, transformOrigin: '50% 100%', transform: `rotate(${mix(-90, 180, sweep)}deg)`}} />
        <div style={{position: 'absolute', left: 172, top: 90, width: 8, height: 90, background: C.gold, borderRadius: 4, transformOrigin: '50% 100%', transform: `rotate(${mix(0, 180, sweep)}deg)`}} />
        <div style={{position: 'absolute', left: 164, top: 164, width: 24, height: 24, borderRadius: '50%', background: C.gold}} />
      </div>
      <div style={{position: 'absolute', left: 340, top: 730, width: 400, textAlign: 'center', opacity: ramp(f, a + 30, 12)}}>
        <div style={{display: 'inline-block', background: C.gold, color: C.navy, fontSize: 40, fontWeight: 700, padding: '12px 28px', borderRadius: 14}}>Daily · 6:00 AM</div>
      </div>
      <div style={{position: 'absolute', left: 920, top: 340, display: 'flex', flexDirection: 'column', gap: 22}}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
          <div key={d} style={{width: 640, padding: '20px 30px', borderRadius: 16, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)', display: 'flex', justifyContent: 'space-between',
            fontSize: 34, fontWeight: 600, opacity: ramp(f, b + i * 8, 10), transform: `translateX(${(1 - ramp(f, b + i * 8, 14, EASE.snappy)) * 40}px)`}}>
            <span>{d} · 06:00 · CRM Pipeline</span><span style={{color: C.gold}}>✓</span>
          </div>
        ))}
      </div>
      <Sfx at={a} src="clock-tick-single" v={0.35} /><Sfx at={a + 30} src="pop" v={0.35} />
      {[0, 1, 2, 3, 4].map((i) => <Sfx key={i} at={b + i * 8} src="switch-tap" v={0.2} />)}
    </Stage>
  );
};

// ======================= 13. CTA =======================
const S13: React.FC = () => {
  const l = L('d13_cta');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const ring = ramp(f, 4, 18, EASE.snappy);
  const icon = ramp(f, 20, 10, EASE.overshoot);
  const word = ramp(f, 30, 22, EASE.snappy);
  const LW = 900, LH = (776 / 2400) * LW;
  const iconCx = ((93 + 483) / 2 / 2400) * LW;
  const shift = mix(LW / 2 - iconCx, 0, word);
  const t1 = ramp(f, at(l, 0, 6), 18, EASE.out), t2 = ramp(f, at(l, 1, 4), 18, EASE.out);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
        <div style={{position: 'relative', width: LW, height: LH, marginTop: -120, transform: `translateX(${shift}px)`}}>
          {f < 26 && (
            <div style={{position: 'absolute', left: iconCx - 600 * (1 - ring) - 90, top: LH / 2 - 600 * (1 - ring) - 90, width: 180 + 1200 * (1 - ring), height: 180 + 1200 * (1 - ring),
              borderRadius: '50%', border: `${10 + 20 * (1 - ring)}px solid ${C.gold}`, boxSizing: 'border-box', opacity: 1 - ramp(f, 20, 6)}} />
          )}
          <Img src={staticFile('brand/bpc_logo_2026.png')} style={{position: 'absolute', width: LW, height: LH,
            clipPath: `inset(0 ${mix(100 - (483 / 2400) * 100 - 1, 0, word)}% 0 0)`, transform: `scale(${mix(0.6, 1, icon)})`, transformOrigin: `${iconCx}px 50%`, opacity: f < 20 ? 0 : 1}} />
        </div>
        <div style={{marginTop: 70, fontSize: 56, fontWeight: 700, color: C.navy, opacity: t1, transform: `translateY(${(1 - t1) * 24}px)`, letterSpacing: -1}}>
          Write to BPC to connect your data to NetSuite Planning.
        </div>
        <div style={{marginTop: 18, fontSize: 44, fontWeight: 500, color: C.green, opacity: t2, transform: `translateY(${(1 - t2) * 20}px)`}}>
          Get the most out of your implementation.
        </div>
        <div style={{marginTop: 46, fontSize: 36, fontWeight: 600, color: C.navy, opacity: t2, letterSpacing: 1}}>bryantparkconsulting.com</div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: C.navy, opacity: interpolate(f, [d - 14, d], [0, 1], clamp)}} />
      <Sfx at={4} src="riser-cine" v={0.25} /><Sfx at={20} src="impact-zoom-quick" v={0.35} /><Sfx at={32} src="sparkle" v={0.3} />
    </LightStage>
  );
};

const COMPONENTS: Record<string, React.FC> = {
  d01_hook: S01, d02_pain: S02, d03_promise: S03, d04_value: S04, d05_file: S05, d06_open: S06, d07_map: S07,
  d08_run: S08, d09_fix: S09, d10_calc: S10, d11_result: S11, d12_schedule: S12, d13_cta: S13,
};

export const DataLoadVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/tonight-hiphop.mp3')} volume={(fr) => 0.075 * interpolate(fr, [0, 20, TOTAL_DL - 75, TOTAL_DL], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 'd13_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/dl/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.12} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
