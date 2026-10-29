// Revenue forecasting sales + how-it-works video. Same motion system as V2/WF (see RECETA.md).
// Layout follows a real NSPB Revenue Input Sheet (rows Project · Department · Class, columns by forecast year);
// every name and number is invented demo data.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing-rv.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {DoF, Drop, EASE, Flash, Float, LightStage, Marker, Plane, Slam, Stage, cruise, hash, liftOf, mix, ramp} from './fx';
import {BlurWords, Big, Eyebrow2, Relay, Sfx, Source2} from './V2';
import {Cursor, FormShell} from './WF';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL_RV = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['r03_promise', 'r05_add', 'r11_cta']);
const money = (n: number) => n.toLocaleString('en-US');
const MOD = 'Revenue and Gross Margin';

// Invented demo revenue — every view sums to the same FY27 total
const TOTAL = 51.4;
const NEW = 'AI Studio';
const PROJECTS: [string, number][] = [['Platform Core', 18.6], ['Enterprise Suite', 12.2], ['Partner Program', 9.4], ['Marketplace', 6.0], ['Launch 2027', 5.2]];
const DEPTS: [string, number][] = [['Sales', 21.3], ['Product', 12.4], ['Partnerships', 9.8], ['Customer Success', 7.9]];
const CATS: [string, number, string][] = [['Product', 30.9, '#3F7C9C'], ['Services', 15.3, C.green], [NEW, 5.2, C.gold]];

// ======================= 1. HOOK =======================
const S01: React.FC = () => {
  const f = useCurrentFrame();
  const l = L('r01_hook');
  return (
    <Stage>
      {f < 30 && (
        <AbsoluteFill style={{overflow: 'hidden', background: '#0B1F2B', perspective: 900}}>
          <div style={{position: 'absolute', left: -200, top: -100, transform: `rotateX(38deg) rotateZ(-12deg) translateY(${-f * 24}px)`, display: 'grid',
            gridTemplateColumns: 'repeat(14, 180px)', gap: 4}}>
            {Array.from({length: 14 * 18}).map((_, i) => (
              <div key={i} style={{height: 56, background: i % 14 === 0 ? '#1D445A' : 'rgba(255,255,255,0.06)', color: hash(i) > 0.8 ? C.gold : 'rgba(175,200,216,0.7)',
                fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, fontVariantNumeric: 'tabular-nums'}}>
                {i % 14 === 0 ? ['Q1', 'Q2', 'Q3', 'Q4'][Math.floor(i / 14) % 4] + ' Rev' : hash(i) > 0.35 ? money(Math.round(100000 + hash(i * 2) * 900000)) : ''}
              </div>
            ))}
          </div>
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 30%, rgba(5,14,20,0.85))'}} />
        </AbsoluteFill>
      )}
      {f >= 30 && f < 36 && <AbsoluteFill style={{background: '#050E14'}} />}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
          <Slam from={at(l, 0, 2)} style={{fontSize: 130, fontWeight: 700, letterSpacing: -5}}>
            New product. <span style={{color: C.gold}}>Next quarter.</span>
          </Slam>
          <BlurWords from={at(l, 1, 10)} size={88} weight={600} parts={['In', 'your', 'forecast…', 'when?']} hot={3} color={C.blueLight} />
          <div style={{marginTop: -44, marginLeft: 470}}><Marker from={at(l, 1, 44)} width={260} /></div>
        </div>
      </AbsoluteFill>
      <Flash at={at(l, 0, 2)} peak={0.35} />
      <Sfx at={0} src="whoosh-fast" v={0.3} />
      <Sfx at={at(l, 0, 0)} src="impact-zoom-quick" v={0.5} />
      <Sfx at={at(l, 1, 44)} src="marker-pen-line" v={0.35} />
    </Stage>
  );
};

// ======================= 2. PAIN: file flock → two unanswered questions =======================
const FILES = ['Revenue_FY27_v4.xlsx', 'New_product_model.xlsx', 'Rev_by_dept (2).xlsx', 'Pricing_FINAL.xlsx', 'Bookings_export.csv', 'Forecast_rollup_OLD.xlsx'];
const S02: React.FC = () => {
  const l = L('r02_pain');
  const f = useCurrentFrame();
  const a = at(l, 0), b = at(l, 1, -4);
  const out1 = ramp(f, b - 6, 12, EASE.exit);
  return (
    <Stage glow={[0.4, 0.3]}>
      <AbsoluteFill style={{perspective: 1600, opacity: 1 - out1}}>
        {FILES.map((n, i) => {
          const from = a + 4 + i * 9;
          const t = ramp(f, from, 24, EASE.snappy);
          const col = i % 3, row = Math.floor(i / 3);
          const x = 280 + col * 470 + (hash(i) - 0.5) * 60, y = 300 + row * 300 + (hash(i + 4) - 0.5) * 50;
          const rz = (hash(i + 9) - 0.5) * 16;
          return (
            <div key={n} style={{position: 'absolute', left: x, top: y, width: 420, height: 230, borderRadius: 20, background: 'linear-gradient(160deg,#FFFFFF,#EEF1EE)',
              boxShadow: '0 30px 70px rgba(0,0,0,0.45)', padding: 28, boxSizing: 'border-box', color: C.ink, borderLeft: `8px solid ${C.green}`,
              transform: `translate3d(${mix(900 - x, 0, t)}px, ${mix(-300, 0, t)}px, ${mix(-600, 0, t)}px) rotateY(${mix(80, 0, t)}deg) rotateZ(${rz * t}deg)`, opacity: f < from ? 0 : 1}}>
              <div style={{width: 54, height: 54, borderRadius: 10, background: '#1E7145', color: 'white', fontWeight: 700, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>X</div>
              <div style={{fontSize: 30, fontWeight: 600, marginTop: 20, color: C.navy}}>{n}</div>
              <div style={{fontSize: 22, color: C.muted, marginTop: 8}}>{['New tab added', 'Copied from last year', 'Week 3 of rework'][i % 3]}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <Relay from={b} to={useVideoConfig().durationInFrames + 8}>
        {(_, local) => (
          <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 80}}>
            {['by project', 'by department'].map((t, i) => (
              <div key={t} style={{width: 620, padding: '44px 50px', borderRadius: 26, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)',
                opacity: ramp(local, i * 30, 14), transform: `translateY(${(1 - ramp(local, i * 30, 18, EASE.snappy)) * 60}px)`}}>
                <div style={{fontSize: 34, color: C.blueLight, fontWeight: 500}}>New product revenue</div>
                <div style={{fontSize: 70, fontWeight: 700, letterSpacing: -2}}>{t}</div>
                <Slam from={b + 40 + i * 30} shake={10}><div style={{fontSize: 150, fontWeight: 700, color: C.gold, lineHeight: 1.1}}>?</div></Slam>
              </div>
            ))}
          </AbsoluteFill>
        )}
      </Relay>
      <Source2>Illustrative example</Source2>
      {FILES.map((_, i) => <Sfx key={i} at={a + 4 + i * 9} src="paper-slide" v={0.22} />)}
      <Sfx at={b + 40} src="bass-hit-short" v={0.45} /><Sfx at={b + 70} src="bass-hit-short" v={0.45} />
    </Stage>
  );
};

// ======================= 3. PROMISE: text-as-mask "REVENUE" → three chips =======================
const S03: React.FC = () => {
  const l = L('r03_promise');
  const f = useCurrentFrame();
  const enter = ramp(f, at(l, 0), 20, EASE.snappy);
  const scroll = f * 3;
  const chip = (i: number) => ramp(f, at(l, 1, 10 + i * 22), 14, EASE.overshoot);
  const rise = ramp(f, at(l, 1, -10), 22, EASE.smooth);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `translateY(${mix(40, -90, rise)}px)`}}>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, letterSpacing: -0.5, marginBottom: -10}}>In NetSuite Planning, your</div>
        <div style={{fontSize: 320, fontWeight: 700, letterSpacing: -14, lineHeight: 1, transform: `scale(${mix(1.08, 1, enter)})`, opacity: enter,
          backgroundImage: `repeating-linear-gradient(180deg, ${C.navy} 0px, ${C.navy} 30px, #24546E 30px, #24546E 34px), linear-gradient(90deg, ${C.navy}, ${C.green})`,
          backgroundBlendMode: 'multiply', backgroundSize: `100% 34px, 100% 100%`, backgroundPosition: `0 ${-scroll}px, 0 0`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', clipPath: `inset(${(1 - enter) * 100}% 0 0 0)`}}>REVENUE</div>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, marginTop: -6}}>lives in one model.</div>
        <div style={{display: 'flex', gap: 26, marginTop: 70}}>
          {['Add a stream once', 'Every view updates', 'Always ties out'].map((t, i) => (
            <div key={t} style={{padding: '20px 38px', borderRadius: 999, border: `3px solid ${C.gold}`, background: 'white', color: C.navy, fontSize: 44, fontWeight: 600,
              transform: `scale(${chip(i)})`, opacity: Math.min(1, chip(i) * 2), boxShadow: '0 16px 40px rgba(29,68,90,0.15)'}}>{t}</div>
          ))}
        </div>
      </AbsoluteFill>
      <Sfx at={at(l, 0)} src="swoosh-slow" v={0.3} />
      {[0, 1, 2].map((i) => <Sfx key={i} at={at(l, 1, 10 + i * 22)} src="pop" v={0.3} />)}
    </LightStage>
  );
};

// ======================= shared: the Revenue Input Sheet (rows Project · Department · Class) =======================
const YEARS = ['FY27', 'FY28', 'FY29', 'FY30', 'FY31'];
type Row = [string, string, string, number[]];
const ROWS: Row[] = [
  ['Platform Core', 'Sales', 'Product', [18.6, 20.1, 21.4, 22.9, 24.3]],
  ['Enterprise Suite', 'Sales', 'Services', [12.2, 13.0, 13.9, 14.6, 15.2]],
  ['Partner Program', 'Partnerships', 'Product', [9.4, 10.3, 11.1, 11.8, 12.6]],
  ['Marketplace', 'Product', 'Services', [6.0, 6.7, 7.5, 8.1, 8.8]],
];
const GRID = '440px 380px 340px repeat(5, 270px)';
const fmtM = (v: number) => money(Math.round(v * 1000000));
const RevenueSheet: React.FC<{t?: number; newRow?: React.ReactNode; hot?: number}> = ({t = 1, newRow, hot = 0}) => (
  <FormShell title="Revenue Input Sheet" module={MOD} pov={['Scenario:Forecast', 'Version:Working', 'Currency:USD']} tabs={['Revenue Input', 'Revenue by Class', 'Revenue Summary']} active={0} width={2600}>
    <div style={{display: 'grid', gridTemplateColumns: GRID, fontSize: 34, color: C.muted, borderBottom: '2px solid #E6E6E6'}}>
      {['Project', 'Department', 'Class', ...YEARS].map((h, i) => <div key={h} style={{padding: '18px 16px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 600,
        background: i < 3 && hot > 0.05 ? `rgba(255,241,201,${hot})` : undefined}}>{h}</div>)}
    </div>
    {ROWS.map((r, i) => (
      <Float key={r[0]} h={liftOf(t, 0.2 + (i / ROWS.length) * 0.6, 130)}>
        <div style={{display: 'grid', gridTemplateColumns: GRID, fontSize: 38, height: 84, alignItems: 'center', borderBottom: '2px solid #F0F0F0'}}>
          {[r[0], r[1], r[2]].map((v, k) => <div key={k} style={{padding: '0 16px', background: '#F6F6F4', height: '100%', display: 'flex', alignItems: 'center', color: k === 0 ? C.navy : '#1B1B1B', fontWeight: k === 0 ? 600 : 400}}>{v}</div>)}
          {r[3].map((v, k) => <div key={k} style={{padding: '0 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{fmtM(v)}</div>)}
        </div>
      </Float>
    ))}
    {newRow ?? (
      <div style={{display: 'grid', gridTemplateColumns: GRID, fontSize: 38, height: 84, alignItems: 'center', borderBottom: '2px solid #F0F0F0', color: '#B9B9B9'}}>
        <div style={{padding: '0 16px'}}>— select —</div><div style={{padding: '0 16px'}}>— select —</div><div style={{padding: '0 16px'}}>— select —</div>
      </div>
    )}
  </FormShell>
);

// ======================= 4. INPUT: graze over the sheet =======================
const S04: React.FC = () => {
  const l = L('r04_input');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const hot = ramp(f, at(l, 0, 40), 16, EASE.snappy);
  return (
    <Stage glow={[0.6, 0.3]}>
      <Relay from={0} to={d + 8}>
        {(u) => (
          <DoF fx={50} fy={50} blur={10}>
            <Plane cam={{rx: 14, ry: 12, rz: -2, scale: 0.56, x: [420, 140], y: [300, -40]}} p={cruise(u)}><RevenueSheet t={Math.min(1, u * 1.6)} hot={hot} /></Plane>
          </DoF>
        )}
      </Relay>
      <div style={{position: 'absolute', left: 0, right: 0, top: 130, textAlign: 'center', opacity: ramp(f, at(l, 0, 40), 12)}}>
        <div style={{display: 'inline-block', background: C.gold, color: C.navy, fontSize: 44, fontWeight: 700, padding: '16px 34px', borderRadius: 14, transform: `rotate(-1.5deg) scale(${ramp(f, at(l, 0, 40), 14, EASE.overshoot)})`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>Project · Department · Class</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={0} src="air-woosh-quick" v={0.35} /><Sfx at={at(l, 0, 40)} src="pop" v={0.3} />
    </Stage>
  );
};

// ======================= 5. ADD: cursor picks project/dept/class, types amounts, saves =======================
const NV = ['Launch 2027', 'Product', NEW, '5,200,000', '8,600,000', '11,900,000'];
const S05: React.FC = () => {
  const l = L('r05_add');
  const f = useCurrentFrame();
  const a = at(l, 0, 30), b = at(l, 1, 0);
  const s = [a, a + 26, a + 52, b, b + 22, b + 44];
  const saveAt = b + 76;
  const click = ramp(f, saveAt, 8);
  const typed = (k: number) => (k < 3 ? (f >= s[k] + 8 ? NV[k] : '') : NV[k].slice(0, Math.floor(Math.max(0, f - s[k]) * 1.1)));
  const active = (k: number) => f >= s[k] - 4 && f < (s[k + 1] ?? saveAt) - 4;
  const newRow = (
    <div style={{display: 'grid', gridTemplateColumns: GRID, fontSize: 38, height: 84, alignItems: 'center', borderBottom: '2px solid #F0F0F0'}}>
      {NV.map((_, k) => (
        <div key={k} style={{padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: k >= 3 ? 'flex-end' : 'flex-start',
          outline: active(k) ? '4px solid #2F7DD1' : undefined, outlineOffset: -4, background: typed(k) ? '#FFFBEA' : k < 3 ? '#F6F6F4' : undefined,
          color: k === 2 && typed(k) ? '#9A6B00' : k === 0 ? C.navy : '#1B1B1B', fontWeight: k < 3 && typed(k) ? 600 : 400, fontVariantNumeric: 'tabular-nums'}}>
          {typed(k) || (k < 3 ? <span style={{color: '#B9B9B9', fontWeight: 400}}>— select —</span> : '')}
        </div>
      ))}
      <div style={{padding: '0 16px', color: '#D0D0D0'}} /><div />
    </div>
  );
  // cursor path (screen px, after scale)
  const P: [number, number, number][] = [[0, 1500, 950], [a - 4, 340, 735], [s[1] - 4, 560, 735], [s[2] - 4, 760, 735], [s[3] - 4, 960, 735], [s[4] - 4, 1110, 735], [s[5] - 4, 1260, 735], [saveAt - 16, 1690, 275], [saveAt, 1690, 280]];
  const cx = interpolate(f, P.map((p) => p[0]), P.map((p) => p[1]), {...clamp, easing: EASE.smooth});
  const cy = interpolate(f, P.map((p) => p[0]), P.map((p) => p[2]), {...clamp, easing: EASE.smooth});
  const push = ramp(f, 0, 60, EASE.smooth);
  const done = ramp(f, saveAt + 12, 16, EASE.overshoot);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2200}}>
        <div style={{transform: `scale(${mix(0.62, 0.68, push)}) rotateX(${mix(12, 4, push)}deg)`, transformOrigin: '50% 45%', filter: click > 0 && click < 1 ? `brightness(${1 + 0.06 * (1 - click)})` : undefined}}>
          <RevenueSheet newRow={newRow} />
        </div>
      </AbsoluteFill>
      <Cursor x={cx} y={cy} press={f >= saveAt && f < saveAt + 12 ? (f - saveAt) / 12 : 0} />
      {done > 0 && (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 150, display: 'flex', justifyContent: 'center'}}>
          <div style={{background: C.navy, color: 'white', fontSize: 40, fontWeight: 600, padding: '20px 40px', borderRadius: 16, borderLeft: `8px solid ${C.gold}`,
            transform: `translateY(${(1 - done) * 40}px)`, opacity: Math.min(1, done * 2)}}>✓ Saved · new revenue stream “{NEW}” added</div>
        </div>
      )}
      {s.map((x, i) => <Sfx key={i} at={x} src="switch-tap" v={0.22} />)}
      <Sfx at={saveAt} src="switch-tap" v={0.5} /><Sfx at={saveAt + 12} src="sparkle" v={0.3} />
    </LightStage>
  );
};

// ======================= 6. CALC: rules run on save → total rolls up =======================
const RULES = ['Convert currency', 'Aggregate revenue', 'Roll up to total'];
const S06: React.FC = () => {
  const l = L('r06_calc');
  const f = useCurrentFrame();
  const a = at(l, 0, 14), b = at(l, 1, 0);
  const step = (i: number) => ramp(f, a + i * 22, 20, EASE.smooth);
  const roll = ramp(f, b + 10, 50, EASE.smooth);
  const total = mix(TOTAL - 5.2, TOTAL, roll);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>On save</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Planning runs the rules</div>
      <div style={{position: 'absolute', left: 170, top: 330, display: 'flex', flexDirection: 'column', gap: 28}}>
        {RULES.map((r, i) => (
          <Drop key={r} from={a + i * 22} h={140}>
            <div style={{width: 760, padding: '26px 34px', borderRadius: 18, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)', position: 'relative', overflow: 'hidden'}}>
              <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${step(i) * 100}%`, background: 'rgba(55,104,88,0.45)'}} />
              <div style={{position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 42, fontWeight: 600}}>
                <span>{r}</span><span style={{color: step(i) >= 1 ? C.gold : C.blueLight}}>{step(i) >= 1 ? '✓' : `${Math.round(step(i) * 100)}%`}</span>
              </div>
            </div>
          </Drop>
        ))}
      </div>
      <div style={{position: 'absolute', right: 170, top: 330, width: 760, textAlign: 'right'}}>
        <div style={{fontSize: 34, color: C.blueLight}}>Total revenue · FY27</div>
        <div style={{fontSize: 170, fontWeight: 700, letterSpacing: -6, fontVariantNumeric: 'tabular-nums', color: roll > 0.98 ? C.gold : 'white', lineHeight: 1.05}}>${total.toFixed(1)}M</div>
        <div style={{display: 'flex', height: 40, borderRadius: 10, overflow: 'hidden', marginTop: 30}}>
          <div style={{flex: TOTAL - 5.2, background: '#3F7C9C'}} />
          <div style={{flex: 5.2 * roll + 0.001, background: C.gold}} />
        </div>
        <div style={{fontSize: 32, color: C.gold, fontWeight: 600, marginTop: 14, opacity: ramp(f, b + 30, 12)}}>+ $5.2M · {NEW}</div>
        <div style={{fontSize: 30, color: C.blueLight, marginTop: 8, opacity: ramp(f, b + 60, 12)}}>in seconds</div>
      </div>
      <Source2>Demo data</Source2>
      {RULES.map((_, i) => <Sfx key={i} at={a + i * 22} src="hit-weak" v={0.3} />)}
      <Sfx at={b + 10} src="data-scan" v={0.25} /><Sfx at={b + 60} src="sparkle" v={0.3} />
    </Stage>
  );
};

// ======================= 7–9. VIEWS: same total, three cuts =======================
const HBars: React.FC<{rows: [string, number, string?][]; from: number; hotName?: string; max: number}> = ({rows, from, hotName, max}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 26}}>
      {rows.map(([n, v, col], i) => {
        const t = ramp(f, from + i * 6, 20, EASE.overshoot);
        const hot = n === hotName;
        return (
          <div key={n} style={{display: 'flex', alignItems: 'center', gap: 30}}>
            <div style={{width: 380, fontSize: 40, fontWeight: hot ? 700 : 500, color: hot ? C.gold : 'white', textAlign: 'right'}}>{n}</div>
            <div style={{width: (v / max) * 900 * t, height: 70, borderRadius: 10, background: col ?? (hot ? C.gold : '#3F7C9C'), boxShadow: hot ? '0 0 30px rgba(252,202,71,0.5)' : undefined}} />
            <div style={{fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums', opacity: t}}>${v.toFixed(1)}M</div>
          </div>
        );
      })}
    </div>
  );
};
const ViewScene: React.FC<{k: string; eyebrow: string; title: string; rows: [string, number, string?][]; hotName?: string; tab: number}> = ({k, eyebrow, title, rows, hotName, tab}) => {
  const l = L(k);
  const f = useCurrentFrame();
  const a = at(l, 0, 6);
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <Stage glow={[0.45, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>{eyebrow}</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>{title}</div>
      <div style={{position: 'absolute', right: 170, top: 130, display: 'flex', gap: 14}}>
        {['Project', 'Department', 'Category'].map((t, i) => (
          <div key={t} style={{padding: '12px 28px', borderRadius: 999, fontSize: 30, fontWeight: 600, border: `2px solid ${i === tab ? C.gold : 'rgba(175,200,216,0.35)'}`,
            background: i === tab ? C.gold : 'transparent', color: i === tab ? C.navy : C.blueLight, transform: i === tab ? `scale(${mix(0.9, 1, ramp(f, a - 6, 10, EASE.overshoot))})` : undefined}}>{t}</div>
        ))}
      </div>
      <div style={{position: 'absolute', left: 170, top: 340}}><HBars rows={rows} from={a} hotName={hotName} max={max} /></div>
      <div style={{position: 'absolute', right: 170, bottom: 170, textAlign: 'right', opacity: ramp(f, a + 40, 12)}}>
        <div style={{fontSize: 30, color: C.blueLight}}>Total FY27</div>
        <div style={{fontSize: 90, fontWeight: 700, letterSpacing: -3, color: C.gold}}>${TOTAL.toFixed(1)}M</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a - 6} src="switch-tap" v={0.4} /><Sfx at={a} src="sweep-short" v={0.3} />
    </Stage>
  );
};
const S07: React.FC = () => <ViewScene k="r07_project" eyebrow="Revenue by project" title="Every project, its share" rows={PROJECTS} hotName="Launch 2027" tab={0} />;
const S08: React.FC = () => <ViewScene k="r08_dept" eyebrow="Revenue by department" title="Same total, split by team" rows={DEPTS} tab={1} />;
const S09: React.FC = () => {
  const l = L('r09_category');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, 0);
  const shrink = ramp(f, b, 20, EASE.smooth);
  return (
    <Stage glow={[0.45, 0.3]}>
      <AbsoluteFill style={{opacity: mix(1, 0.1, shrink)}}>
        <ViewScene k="r09_category" eyebrow="Revenue by category" title="Product, services — and the new stream" rows={CATS} hotName={NEW} tab={2} />
      </AbsoluteFill>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 30}}>
        <div style={{display: 'flex', gap: 64, alignItems: 'center'}}>
          {['Project', 'Department', 'Category'].map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && <Slam from={b + 10 + i * 12} shake={6}><div style={{fontSize: 90, fontWeight: 700, color: C.gold}}>=</div></Slam>}
              <div style={{padding: '30px 40px', borderRadius: 22, background: C.navy, border: `3px solid ${C.gold}`, textAlign: 'center',
                transform: `scale(${ramp(f, b + 4 + i * 12, 14, EASE.overshoot)})`, boxShadow: '0 30px 70px rgba(0,0,0,0.5)'}}>
                <div style={{fontSize: 30, color: C.blueLight}}>{t}</div>
                <div style={{fontSize: 80, fontWeight: 700, letterSpacing: -2}}>${TOTAL.toFixed(1)}M</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{fontSize: 48, fontWeight: 600, opacity: ramp(f, b + 50, 12)}}>One model, three views. <span style={{color: C.gold}}>Always ties out.</span></div>
        <div style={{marginLeft: 520, marginTop: -30}}><Marker from={b + 62} width={360} /></div>
      </AbsoluteFill>
      <Sfx at={b + 22} src="impact-zoom-quick" v={0.35} /><Sfx at={b + 34} src="impact-zoom-quick" v={0.35} /><Sfx at={b + 62} src="marker-pen-line" v={0.3} />
      <Flash at={b + 34} peak={0.18} color="#FCCA47" />
    </Stage>
  );
};

// ======================= 10. FLOW: bezier pulses into the P&L and reports =======================
const PNL: [string, string][] = [['Revenue', '$51.4M'], ['Gross Margin', '$33.9M'], ['Forecast Report', 'updated'], ['Revenue Dashboard', 'updated']];
const S10: React.FC = () => {
  const l = L('r10_flow');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const flip = ramp(f, a - 10, 14, EASE.snappy);
  const DX = 1050, Y0 = 380;
  return (
    <Stage glow={[0.7, 0.4]}>
      <div style={{position: 'absolute', left: 140, top: 430, width: 480, height: 220, borderRadius: 26, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.3)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity: ramp(f, 0, 14)}}>
        <div style={{fontSize: 56, fontWeight: 700}}>Revenue</div>
        <div style={{fontSize: 28, color: C.blueLight, marginTop: 6}}>5 projects · 3 categories</div>
      </div>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {PNL.map((_, i) => {
          const y = Y0 + 60 + i * 120;
          const t = ramp(f, a + i * 6, 26, EASE.swift);
          const d = `M 620 540 C 820 540, 860 ${y}, ${DX} ${y}`;
          const p = ((f - a - 30 - i * 5) % 34) / 34;
          return (
            <g key={i}>
              <path d={d} stroke="rgba(252,202,71,0.25)" strokeWidth={12} fill="none" strokeDasharray={700} strokeDashoffset={700 * (1 - t)} style={{filter: 'blur(5px)'}} />
              <path d={d} stroke={C.gold} strokeWidth={4} fill="none" strokeDasharray={700} strokeDashoffset={700 * (1 - t)} />
              {f > a + 30 && <circle r={9} fill={C.gold} cx={mix(mix(620, 820, p), mix(860, DX, p), p)} cy={mix(540, y, p * p)} style={{filter: 'drop-shadow(0 0 8px #FCCA47)'}} />}
            </g>
          );
        })}
      </svg>
      <div style={{position: 'absolute', left: DX, top: Y0 - 90, width: 760, borderRadius: 26, background: '#FBFAF7', color: C.ink, padding: '34px 42px', boxSizing: 'border-box',
        boxShadow: '0 40px 90px rgba(0,0,0,0.45)', transform: `perspective(1400px) rotateY(${(1 - flip) * -70}deg)`, opacity: Math.min(1, flip * 2), transformOrigin: '0 50%'}}>
        <div style={{fontSize: 26, fontWeight: 600, letterSpacing: 4, color: C.green, textTransform: 'uppercase'}}>P&amp;L · FY27 forecast</div>
        {PNL.map(([n, v], i) => (
          <div key={n} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 120, borderBottom: '2px solid rgba(29,68,90,0.08)', fontSize: 40}}>
            <span style={{fontWeight: 600, color: C.navy}}>{n}</span>
            <span style={{fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: v === 'updated' ? C.green : undefined, opacity: ramp(f, a + 30 + i * 8, 14)}}>{v === 'updated' ? '✓ updated' : v}</span>
          </div>
        ))}
      </div>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 150}}>
        <div style={{display: 'flex', gap: 30, opacity: ramp(f, b + 10, 12)}}>
          {['No copy and paste', 'No second version of the truth'].map((t, i) => (
            <div key={t} style={{fontSize: 40, fontWeight: 600, padding: '14px 30px', borderRadius: 14, background: 'rgba(255,255,255,0.08)',
              transform: `scale(${ramp(f, b + 10 + i * 14, 14, EASE.overshoot)})`}}><span style={{color: C.gold}}>✕ </span>{t}</div>
          ))}
        </div>
      </AbsoluteFill>
      <Source2>Demo data</Source2>
      <Sfx at={a - 10} src="swoosh-slow" v={0.3} /><Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={b + 10} src="pop" v={0.3} /><Sfx at={b + 24} src="pop" v={0.3} />
    </Stage>
  );
};

// ======================= 11. CTA =======================
const S11: React.FC = () => {
  const l = L('r11_cta');
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
          Write to BPC to forecast revenue in NetSuite Planning.
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

// ======================= 3b. VALUE: three capability cards =======================
const VALUE: [string, string, string][] = [['Amount or units × price', 'Forecast the way each line really works', '×'], ['Scenarios & versions', 'Forecast vs budget, working vs final', '⇄'], ['Any dimension', 'Project · department · class · customer', '▦']];
const S03b: React.FC = () => {
  const l = L('r03b_value');
  const from = (i: number) => (i === 0 ? at(l, 0, 4) : at(l, 1, (i - 1) * 40));
  return (
    <Stage>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 150}}><Eyebrow2>What it does for finance</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 44, paddingTop: 60, perspective: 1600}}>
        {VALUE.map(([t, sub, ic], i) => (
          <Drop key={t} from={from(i)} h={200}>
            <div style={{width: 500, height: 420, borderRadius: 28, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)', padding: 44, boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
              <div style={{width: 110, height: 110, borderRadius: 24, background: C.gold, color: C.navy, fontSize: 70, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{ic}</div>
              <div>
                <div style={{fontSize: 50, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1}}>{t}</div>
                <div style={{fontSize: 30, color: C.blueLight, marginTop: 14}}>{sub}</div>
              </div>
            </div>
          </Drop>
        ))}
      </AbsoluteFill>
      {VALUE.map((_, i) => <Sfx key={i} at={from(i)} src="hit-weak" v={0.4} />)}
    </Stage>
  );
};

// ======================= 4a. NAV: home page → Revenue and Gross Margin → point of view =======================
const TILES = ['Revenue and Gross Margin', 'Workforce', 'OpEx', 'Financials', 'Dashboards', 'Reports'];
const POV: [string, string][] = [['Scenario', 'Forecast'], ['Version', 'Working'], ['Currency', 'USD']];
const S04a: React.FC = () => {
  const l = L('r04a_nav');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -10), c = at(l, 2, -6);
  const clickAt = at(l, 1, 46);
  const P: [number, number, number][] = [[b, 1500, 950], [clickAt - 14, 520, 520], [clickAt, 520, 525]];
  const cx = interpolate(f, P.map((p) => p[0]), P.map((p) => p[1]), {...clamp, easing: EASE.smooth});
  const cy = interpolate(f, P.map((p) => p[0]), P.map((p) => p[2]), {...clamp, easing: EASE.smooth});
  const pick = ramp(f, clickAt, 10);
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
      <Relay from={b} to={c}>
        {(_, local) => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
            <div style={{width: 1500, borderRadius: 26, overflow: 'hidden', background: '#F4F2EE', boxShadow: '0 40px 100px rgba(0,0,0,0.45)', transform: `scale(${mix(0.94, 1, ramp(local, 0, 20, EASE.snappy))})`}}>
              <div style={{height: 70, background: '#2C2A28', color: 'white', fontSize: 30, display: 'flex', alignItems: 'center', padding: '0 36px'}}>NetSuite Planning and Budgeting · Home</div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30, padding: 50}}>
                {TILES.map((t, i) => {
                  const hot = i === 0;
                  return (
                    <div key={t} style={{height: 200, borderRadius: 18, background: hot && pick > 0 ? C.navy : 'white', color: hot && pick > 0 ? 'white' : C.navy, display: 'flex', flexDirection: 'column',
                      justifyContent: 'flex-end', padding: 28, boxSizing: 'border-box', fontSize: 34, fontWeight: 600, boxShadow: '0 10px 30px rgba(29,68,90,0.12)',
                      outline: hot ? `${6 * ramp(local, 30, 10)}px solid ${C.gold}` : undefined, opacity: ramp(local, 4 + i * 4, 12),
                      transform: `translateY(${(1 - ramp(local, 4 + i * 4, 16, EASE.snappy)) * 30}px) scale(${hot ? 1 + 0.04 * pick : 1})`}}>
                      <div style={{width: 60, height: 60, borderRadius: 14, background: hot ? C.gold : C.greenLight, marginBottom: 'auto'}} />{t}
                    </div>
                  );
                })}
              </div>
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      <Relay from={c} to={d + 8}>
        {(_, local) => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 40}}>
            <Eyebrow2>Point of view</Eyebrow2>
            <div style={{display: 'flex', gap: 30}}>
              {POV.map(([k, v], i) => {
                const t = ramp(local, 14 + i * 26, 12, EASE.overshoot);
                return (
                  <div key={k} style={{width: 400, padding: '30px 36px', borderRadius: 20, background: 'white', color: C.navy, boxShadow: '0 30px 70px rgba(0,0,0,0.4)',
                    opacity: ramp(local, i * 6, 12), transform: `translateY(${(1 - ramp(local, i * 6, 16, EASE.snappy)) * 40}px)`}}>
                    <div style={{fontSize: 28, color: C.muted}}>{k}</div>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 52, fontWeight: 700, marginTop: 6}}>
                      <span style={{opacity: t, transform: `scale(${mix(0.8, 1, t)})`, display: 'inline-block'}}>{v}</span><span style={{fontSize: 30, color: C.muted}}>▾</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      {f >= b && f < c && <Cursor x={cx} y={cy} press={f >= clickAt && f < clickAt + 12 ? (f - clickAt) / 12 : 0} />}
      <Sfx at={b} src="air-woosh-quick" v={0.3} /><Sfx at={clickAt} src="switch-tap" v={0.5} />
      {POV.map((_, i) => <Sfx key={i} at={c + 14 + i * 26} src="switch-tap" v={0.3} />)}
    </Stage>
  );
};

// ======================= 5b. SPREAD: annual amount → months by seasonality =======================
const SEAS = [0.05, 0.05, 0.07, 0.08, 0.08, 0.09, 0.08, 0.08, 0.09, 0.1, 0.11, 0.12];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const S05b: React.FC = () => {
  const l = L('r05b_spread');
  const f = useCurrentFrame();
  const b = at(l, 1, 10), c = at(l, 2, 0);
  const drop = ramp(f, b + 30, 20, EASE.smooth);
  const edit = ramp(f, c + 10, 14, EASE.overshoot);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>{NEW} · FY27</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>From year to month</div>
      <div style={{position: 'absolute', right: 170, top: 130, padding: '22px 36px', borderRadius: 18, background: C.gold, color: C.navy, textAlign: 'right',
        transform: `scale(${ramp(f, b - 10, 14, EASE.overshoot)})`}}>
        <div style={{fontSize: 26, fontWeight: 600}}>Annual</div><div style={{fontSize: 64, fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>5,200,000</div>
      </div>
      <div style={{position: 'absolute', left: 170, right: 170, bottom: 220, display: 'flex', alignItems: 'flex-end', gap: 24, height: 560}}>
        {MONTHS.map((m, i) => {
          const t = ramp(f, b + 30 + i * 3, 16, EASE.overshoot);
          const isEd = i === 11 && edit > 0;
          const v = SEAS[i] * (i === 11 ? mix(1, 1.25, edit) : 1);
          return (
            <div key={m} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
              <div style={{fontSize: 24, fontWeight: 600, color: isEd ? C.gold : C.blueLight, marginBottom: 10, opacity: t, fontVariantNumeric: 'tabular-nums'}}>{Math.round(v * 5200)}K</div>
              <div style={{width: '100%', height: v * 3800 * t, borderRadius: '8px 8px 0 0', background: isEd ? C.gold : '#3F7C9C', outline: isEd ? '4px solid #2F7DD1' : undefined}} />
              <div style={{fontSize: 28, color: C.blueLight, marginTop: 14}}>{m}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 170, bottom: 150, fontSize: 32, color: C.blueLight, opacity: drop}}>Spread by seasonality · <span style={{color: C.gold, opacity: ramp(f, c + 10, 10)}}>or type any month</span></div>
      <Source2>Demo data</Source2>
      <Sfx at={b - 10} src="pop" v={0.35} /><Sfx at={b + 30} src="sweep-short" v={0.3} /><Sfx at={c + 10} src="switch-tap" v={0.4} />
    </Stage>
  );
};

// ======================= 5c. DRIVERS: units × price = revenue =======================
const S05c: React.FC = () => {
  const l = L('r05c_drivers');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const res = ramp(f, b + 30, 40, EASE.smooth);
  const card = (label: string, v: string, from: number, gold = false) => (
    <Drop from={from} h={180}>
      <div style={{width: 420, padding: '40px 44px', borderRadius: 24, background: gold ? C.gold : 'rgba(255,255,255,0.08)', color: gold ? C.navy : 'white',
        border: gold ? undefined : '2px solid rgba(175,200,216,0.3)', textAlign: 'center'}}>
        <div style={{fontSize: 32, fontWeight: 500, color: gold ? C.navy : C.blueLight}}>{label}</div>
        <div style={{fontSize: 96, fontWeight: 700, letterSpacing: -3, fontVariantNumeric: 'tabular-nums'}}>{v}</div>
      </div>
    </Drop>
  );
  return (
    <Stage glow={[0.5, 0.3]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 170}}><Eyebrow2>Driver-based revenue</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 34}}>
        {card('Units', '26,000', a)}
        <Slam from={a + 16} shake={4}><div style={{fontSize: 110, fontWeight: 700, color: C.gold}}>×</div></Slam>
        {card('Price', '$200', a + 22)}
        <Slam from={b + 20} shake={10}><div style={{fontSize: 110, fontWeight: 700, color: C.gold}}>=</div></Slam>
        {card('Revenue', `$${(5.2 * res).toFixed(1)}M`, b + 26, true)}
      </AbsoluteFill>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="hit-weak" v={0.4} /><Sfx at={a + 22} src="hit-weak" v={0.4} /><Sfx at={b + 20} src="bass-hit-short" v={0.45} /><Sfx at={b + 70} src="sparkle" v={0.3} />
    </Stage>
  );
};

// ======================= 9b. COMPARE: forecast vs budget, variance by category =======================
const CMP: [string, number, number][] = [['Product', 30.9, 30.1], ['Services', 15.3, 15.0], [NEW, 5.2, 0], ['Total', 51.4, 45.1]];
const S09b: React.FC = () => {
  const l = L('r09b_compare');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, 0);
  const hot = ramp(f, b + 10, 14, EASE.snappy);
  const GC = '400px 260px 260px 260px';
  return (
    <Stage glow={[0.45, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Forecast vs budget · FY27</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Side by side</div>
      <div style={{position: 'absolute', left: 170, top: 340, width: 1180, borderRadius: 24, background: '#FBFAF7', color: C.ink, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
        opacity: ramp(f, a, 14), transform: `translateY(${(1 - ramp(f, a, 18, EASE.snappy)) * 50}px)`}}>
        <div style={{display: 'grid', gridTemplateColumns: GC, fontSize: 32, color: C.muted, fontWeight: 600, background: '#EEF1EE'}}>
          {['Category', 'Forecast', 'Budget', 'Variance'].map((h, i) => <div key={h} style={{padding: '22px 30px', textAlign: i ? 'right' : 'left'}}>{h}</div>)}
        </div>
        {CMP.map(([n, fc, bu], i) => (
          <div key={n} style={{display: 'grid', gridTemplateColumns: GC, fontSize: 42, height: 100, alignItems: 'center', borderTop: '2px solid #ECECEC',
            background: n === NEW ? `rgba(252,202,71,${0.35 * hot})` : undefined, fontWeight: n === 'Total' ? 700 : 400, opacity: ramp(f, a + 10 + i * 6, 12)}}>
            <div style={{padding: '0 30px', color: C.navy, fontWeight: 600}}>{n}</div>
            <div style={{padding: '0 30px', textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>${fc.toFixed(1)}M</div>
            <div style={{padding: '0 30px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.muted}}>{bu ? `$${bu.toFixed(1)}M` : '—'}</div>
            <div style={{padding: '0 30px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.green, fontWeight: 700}}>+${(fc - bu).toFixed(1)}M</div>
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', left: 1390, top: 628, opacity: hot, transform: `rotate(-2deg) scale(${mix(0.8, 1, hot)})`}}>
        <div style={{background: C.gold, color: C.navy, fontSize: 40, fontWeight: 700, padding: '18px 30px', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>+$5.2M from {NEW}</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="paper-slide" v={0.35} /><Sfx at={b + 10} src="pop" v={0.4} />
    </Stage>
  );
};

const COMPONENTS: Record<string, React.FC> = {
  r01_hook: S01, r02_pain: S02, r03_promise: S03, r03b_value: S03b, r04a_nav: S04a, r04_input: S04, r05_add: S05,
  r05b_spread: S05b, r05c_drivers: S05c, r06_calc: S06, r07_project: S07, r08_dept: S08, r09_category: S09,
  r09b_compare: S09b, r10_flow: S10, r11_cta: S11,
};

export const RevenueVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/tonight-hiphop.mp3')} volume={(fr) => 0.075 * interpolate(fr, [0, 20, TOTAL_RV - 75, TOTAL_RV], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 'r11_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/rv/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.12} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
