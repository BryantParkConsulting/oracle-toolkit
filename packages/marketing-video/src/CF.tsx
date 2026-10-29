// Liquidity & cash forecasting video: 30 s of marketing, then how it works. Same motion system as V2/WF/RV.
// Structure follows a real NSPB build (balance sheet drivers DSO/DPO/DIO → AR/AP/inventory, cash accounts by bank,
// indirect cash flow); every name and number is invented demo data.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing-cf.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {DoF, Drop, EASE, Flash, Float, LightStage, Marker, Plane, Slam, Stage, cruise, hash, liftOf, mix, ramp} from './fx';
import {BlurWords, Big, Eyebrow2, Relay, Sfx, Source2} from './V2';
import {Cursor, FormShell} from './WF';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL_CF = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['c03_promise', 'c06_drivers', 'c08_accounts', 'c13_cta']);
const money = (n: number) => n.toLocaleString('en-US');
const RED = '#E0734A';

// Invented demo company: ending cash by month ($M), minimum cash policy, and the effect of collecting 10 days faster
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CASH = [11.2, 10.1, 9.0, 7.4, 6.1, 5.2, 4.4, 3.8, 4.6, 6.9, 10.2, 15.8];
const LIFT = [0.3, 0.6, 0.9, 1.2, 1.4, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6];
const MIN = 5.0;

// ======================= 1. HOOK =======================
const S01: React.FC = () => {
  const f = useCurrentFrame();
  const l = L('c01_hook');
  return (
    <Stage>
      {f < 30 && (
        <AbsoluteFill style={{overflow: 'hidden', background: '#0B1F2B', perspective: 900}}>
          <div style={{position: 'absolute', left: -200, top: -100, transform: `rotateX(38deg) rotateZ(-12deg) translateY(${-f * 24}px)`, display: 'grid',
            gridTemplateColumns: 'repeat(14, 180px)', gap: 4}}>
            {Array.from({length: 14 * 18}).map((_, i) => (
              <div key={i} style={{height: 56, background: i % 14 === 0 ? '#1D445A' : 'rgba(255,255,255,0.06)', color: hash(i) > 0.8 ? C.gold : 'rgba(175,200,216,0.7)',
                fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, fontVariantNumeric: 'tabular-nums'}}>
                {i % 14 === 0 ? MONTHS[Math.floor(i / 14) % 12] : hash(i) > 0.35 ? (hash(i * 3) > 0.7 ? '(' : '') + money(Math.round(50000 + hash(i * 2) * 950000)) + (hash(i * 3) > 0.7 ? ')' : '') : ''}
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
            Cash in <span style={{color: C.gold}}>six months?</span>
          </Slam>
          <BlurWords from={at(l, 1, 4)} size={88} weight={600} parts={['Not', 'the', 'profit.', 'The', 'cash.']} hot={4} color={C.blueLight} />
          <div style={{marginTop: -44, marginLeft: 470}}><Marker from={at(l, 1, 36)} width={220} /></div>
        </div>
      </AbsoluteFill>
      <Flash at={at(l, 0, 2)} peak={0.35} />
      <Sfx at={0} src="whoosh-fast" v={0.3} />
      <Sfx at={at(l, 0, 0)} src="impact-zoom-quick" v={0.5} />
      <Sfx at={at(l, 1, 36)} src="marker-pen-line" v={0.35} />
    </Stage>
  );
};

// ======================= 2. PAIN: P&L solid → balance sheet guessed → cash from a spreadsheet =======================
const S02: React.FC = () => {
  const l = L('c02_pain');
  const f = useCurrentFrame();
  const a = at(l, 0, 4), b = at(l, 1, 0);
  const card = (i: number, title: string, sub: string, style: React.CSSProperties, from: number, extra?: React.ReactNode) => (
    <Drop key={title} from={from} h={160}>
      <div style={{width: 470, height: 360, borderRadius: 26, padding: 40, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', ...style}}>
        <div style={{fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: C.blueLight, fontWeight: 600}}>Step {i + 1}</div>
        <div><div style={{fontSize: 58, fontWeight: 700, letterSpacing: -1.5}}>{title}</div><div style={{fontSize: 30, color: C.blueLight, marginTop: 10}}>{sub}</div></div>
        {extra}
      </div>
    </Drop>
  );
  const wob = Math.sin(f / 3) * 2 * ramp(f, b + 20, 10);
  return (
    <Stage glow={[0.4, 0.3]}>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 50}}>
        {card(0, 'P&L', 'forecast in detail', {background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(175,200,216,0.35)'}, a)}
        <div style={{fontSize: 70, color: C.blueLight, opacity: ramp(f, a + 30, 10)}}>→</div>
        {card(1, 'Balance sheet', 'guessed', {background: 'transparent', border: '3px dashed rgba(175,200,216,0.45)'}, a + 40)}
        <div style={{fontSize: 70, color: C.blueLight, opacity: ramp(f, b - 4, 10)}}>→</div>
        <div style={{transform: `rotate(${wob}deg)`}}>
          {card(2, 'Cash', 'Cash_forecast_v9.xlsx', {background: 'rgba(224,115,74,0.12)', border: `3px solid ${RED}`}, b,
            <Slam from={b + 20} shake={10} style={{position: 'absolute', right: 30, top: 10}}><div style={{fontSize: 150, fontWeight: 700, color: C.gold, lineHeight: 1}}>?</div></Slam>)}
        </div>
      </AbsoluteFill>
      <Source2>Illustrative example</Source2>
      <Sfx at={a} src="hit-weak" v={0.4} /><Sfx at={a + 40} src="paper-slide" v={0.3} /><Sfx at={b} src="hit-weak" v={0.4} /><Sfx at={b + 20} src="bass-hit-short" v={0.5} />
    </Stage>
  );
};

// ======================= 3. PROMISE: "CASH" mask → three statements chained =======================
const S03: React.FC = () => {
  const l = L('c03_promise');
  const f = useCurrentFrame();
  const enter = ramp(f, at(l, 0), 20, EASE.snappy);
  const chip = (i: number) => ramp(f, at(l, 0, 40 + i * 18), 14, EASE.overshoot);
  const rise = ramp(f, at(l, 1, -10), 22, EASE.smooth);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `translateY(${mix(40, -60, rise)}px)`}}>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, marginBottom: -10}}>NetSuite Planning forecasts your</div>
        <div style={{fontSize: 360, fontWeight: 700, letterSpacing: -14, lineHeight: 1, transform: `scale(${mix(1.08, 1, enter)})`, opacity: enter,
          backgroundImage: `repeating-linear-gradient(180deg, ${C.navy} 0px, ${C.navy} 30px, #24546E 30px, #24546E 34px), linear-gradient(90deg, ${C.navy}, ${C.green})`,
          backgroundBlendMode: 'multiply', backgroundSize: `100% 34px, 100% 100%`, backgroundPosition: `0 ${-f * 3}px, 0 0`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', clipPath: `inset(${(1 - enter) * 100}% 0 0 0)`}}>CASH</div>
        <div style={{display: 'flex', gap: 20, marginTop: 50, alignItems: 'center'}}>
          {['P&L', 'Balance sheet', 'Cash flow'].map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && <div style={{fontSize: 50, color: C.gold, fontWeight: 700, opacity: chip(i)}}>→</div>}
              <div style={{padding: '20px 38px', borderRadius: 999, border: `3px solid ${C.gold}`, background: i === 2 ? C.navy : 'white', color: i === 2 ? 'white' : C.navy, fontSize: 44, fontWeight: 600,
                transform: `scale(${chip(i)})`, opacity: Math.min(1, chip(i) * 2), boxShadow: '0 16px 40px rgba(29,68,90,0.15)'}}>{t}</div>
            </React.Fragment>
          ))}
        </div>
        <div style={{marginTop: 40, fontSize: 40, fontWeight: 600, color: C.navy, opacity: ramp(f, at(l, 1, 30), 14)}}>
          every line becomes a <span style={{color: C.green}}>cash forecast</span>, automatically
        </div>
      </AbsoluteFill>
      <Sfx at={at(l, 0)} src="swoosh-slow" v={0.3} />
      {[0, 1, 2].map((i) => <Sfx key={i} at={at(l, 0, 40 + i * 18)} src="pop" v={0.3} />)}
    </LightStage>
  );
};

// ======================= shared: ending cash line chart with a minimum-cash line =======================
const CashChart: React.FC<{draw: number; lift?: number; showMin: number; flag: number; w?: number; h?: number}> = ({draw, lift = 0, showMin, flag, w = 1500, h = 560}) => {
  const max = 18;
  const vals = CASH.map((v, i) => v + LIFT[i] * lift);
  const X = (i: number) => 60 + (i / 11) * (w - 120);
  const Y = (v: number) => h - 60 - (v / max) * (h - 120);
  const pts = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const len = 2400;
  const below = vals.map((v) => v < MIN);
  return (
    <svg width={w} height={h} style={{overflow: 'visible'}}>
      {[0, 5, 10, 15].map((g) => <line key={g} x1={40} x2={w - 20} y1={Y(g)} y2={Y(g)} stroke="rgba(175,200,216,0.12)" strokeWidth={2} />)}
      {[0, 5, 10, 15].map((g) => <text key={g} x={0} y={Y(g) + 8} fill={C.blueLight} fontSize={24} fontFamily={FONT}>{`$${g}M`}</text>)}
      <line x1={40} x2={(w - 20) * showMin + 40 * (1 - showMin)} y1={Y(MIN)} y2={Y(MIN)} stroke={RED} strokeWidth={4} strokeDasharray="14 10" />
      {showMin > 0.9 && <text x={w - 20} y={Y(MIN) - 14} textAnchor="end" fill={RED} fontSize={26} fontWeight={700} fontFamily={FONT}>Minimum cash $5.0M</text>}
      <polyline points={pts} fill="none" stroke="rgba(252,202,71,0.25)" strokeWidth={16} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} style={{filter: 'blur(6px)'}} />
      <polyline points={pts} fill="none" stroke={C.gold} strokeWidth={6} strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      {vals.map((v, i) => (
        <g key={i} opacity={draw * 12 > i ? 1 : 0}>
          <circle cx={X(i)} cy={Y(v)} r={below[i] ? 14 : 9} fill={below[i] ? RED : C.gold} style={{filter: below[i] && flag > 0 ? `drop-shadow(0 0 ${12 * flag}px ${RED})` : undefined}} />
          <text x={X(i)} y={h - 14} textAnchor="middle" fill={C.blueLight} fontSize={26} fontFamily={FONT}>{MONTHS[i]}</text>
        </g>
      ))}
    </svg>
  );
};

// ======================= 4. VALUE: the cash line, a gap spotted =======================
const S04: React.FC = () => {
  const l = L('c04_value');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, 0);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Cash position · month by month</Eyebrow2></div>
      <div style={{position: 'absolute', left: 210, top: 260}}><CashChart draw={ramp(f, a, 60, EASE.smooth)} showMin={ramp(f, b, 20, EASE.smooth)} flag={ramp(f, b + 20, 12)} /></div>
      <div style={{position: 'absolute', left: 1010, top: 240, opacity: ramp(f, b + 24, 12), transform: `scale(${ramp(f, b + 24, 14, EASE.overshoot)})`}}>
        <div style={{background: RED, color: 'white', fontSize: 38, fontWeight: 700, padding: '14px 28px', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>Gap ahead · Jul – Sep</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={b + 24} src="bass-hit-short" v={0.4} />
    </Stage>
  );
};

// ======================= 5. NAV: "Here is how it works" → Financials → Balance Sheet Drivers =======================
const TILES = ['Revenue and Gross Margin', 'Workforce', 'OpEx', 'Financials', 'Dashboards', 'Reports'];
const S05: React.FC = () => {
  const l = L('c05_nav');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -10);
  const clickAt = b + 34, sub = b + 54;
  const P: [number, number, number][] = [[b, 1500, 950], [clickAt - 14, 470, 690], [clickAt, 470, 695], [sub + 18, 900, 700], [sub + 30, 900, 705]];
  const cx = interpolate(f, P.map((p) => p[0]), P.map((p) => p[1]), {...clamp, easing: EASE.smooth});
  const cy = interpolate(f, P.map((p) => p[0]), P.map((p) => p[2]), {...clamp, easing: EASE.smooth});
  const pick = ramp(f, clickAt, 10);
  const menu = ramp(f, sub, 12, EASE.snappy);
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
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
            <div style={{width: 1500, borderRadius: 26, overflow: 'hidden', background: '#F4F2EE', boxShadow: '0 40px 100px rgba(0,0,0,0.45)', transform: `scale(${mix(0.94, 1, ramp(local, 0, 20, EASE.snappy))})`, position: 'relative'}}>
              <div style={{height: 70, background: '#2C2A28', color: 'white', fontSize: 30, display: 'flex', alignItems: 'center', padding: '0 36px'}}>NetSuite Planning and Budgeting · Home</div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30, padding: 50}}>
                {TILES.map((t, i) => {
                  const hot = i === 3;
                  return (
                    <div key={t} style={{height: 200, borderRadius: 18, background: hot && pick > 0 ? C.navy : 'white', color: hot && pick > 0 ? 'white' : C.navy, display: 'flex', flexDirection: 'column',
                      justifyContent: 'flex-end', padding: 28, boxSizing: 'border-box', fontSize: 34, fontWeight: 600, boxShadow: '0 10px 30px rgba(29,68,90,0.12)',
                      outline: hot ? `${6 * ramp(local, 20, 10)}px solid ${C.gold}` : undefined, opacity: ramp(local, 4 + i * 3, 12)}}>
                      <div style={{width: 60, height: 60, borderRadius: 14, background: hot ? C.gold : C.greenLight, marginBottom: 'auto'}} />{t}
                    </div>
                  );
                })}
              </div>
              {menu > 0 && (
                <div style={{position: 'absolute', left: 440, top: 420, width: 620, background: 'white', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.35)', padding: '18px 0',
                  opacity: menu, transform: `translateY(${(1 - menu) * 20}px)`, color: '#1B1B1B'}}>
                  {['Income Statement', 'Balance Sheet Drivers', 'Cash Accounts', 'Cash Flow'].map((t, i) => (
                    <div key={t} style={{fontSize: 36, padding: '16px 34px', fontWeight: i === 1 ? 700 : 400, background: i === 1 && f > sub + 30 ? 'rgba(252,202,71,0.5)' : undefined}}>{t}</div>
                  ))}
                </div>
              )}
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      {f >= b && <Cursor x={cx} y={cy} press={f >= clickAt && f < clickAt + 12 ? (f - clickAt) / 12 : f >= sub + 30 && f < sub + 42 ? (f - sub - 30) / 12 : 0} />}
      <Sfx at={b} src="air-woosh-quick" v={0.3} /><Sfx at={clickAt} src="switch-tap" v={0.5} /><Sfx at={sub + 30} src="switch-tap" v={0.5} />
    </Stage>
  );
};

// ======================= 6. DRIVERS: DSO / DPO / DIO on the form, row by row =======================
const DRV: [string, string, number][] = [['Days Sales Outstanding (DSO)', 'how fast customers pay you', 45], ['Days Payable Outstanding (DPO)', 'how fast you pay suppliers', 30], ['Days Inventory Outstanding (DIO)', 'how long inventory sits', 60]];
const S06: React.FC = () => {
  const l = L('c06_drivers');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, 0);
  const rowAt = (i: number) => a + 20 + i * 70;
  const push = ramp(f, 0, 60, EASE.smooth);
  const cur = DRV.findIndex((_, i) => f >= rowAt(i) && f < rowAt(i + 1));
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2200}}>
        <div style={{transform: `scale(${mix(0.6, 0.66, push)}) rotateX(${mix(12, 4, push)}deg)`, transformOrigin: '50% 45%'}}>
          <FormShell title="Balance Sheet Drivers" module="Financials" pov={['Scenario:Forecast', 'Version:Working', 'Subsidiary:Demo Co USA']} tabs={['Balance Sheet Drivers', 'Cash Accounts', 'Cash Flow']} active={0} width={2600}>
            <div style={{display: 'grid', gridTemplateColumns: '1100px repeat(6, 1fr)', fontSize: 34, color: C.muted, borderBottom: '2px solid #E6E6E6'}}>
              {['Driver', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((h, i) => <div key={h} style={{padding: '18px 16px', textAlign: i ? 'right' : 'left', fontWeight: 600}}>{h}</div>)}
            </div>
            {DRV.map(([n, , v], i) => {
              const on = f >= rowAt(i);
              const hot = cur === i || (f >= b && true);
              return (
                <div key={n} style={{display: 'grid', gridTemplateColumns: '1100px repeat(6, 1fr)', fontSize: 44, height: 110, alignItems: 'center', borderBottom: '2px solid #F0F0F0',
                  background: cur === i ? '#FFFBEA' : undefined, outline: cur === i ? '4px solid #2F7DD1' : undefined, outlineOffset: -4}}>
                  <div style={{padding: '0 16px', color: C.navy, fontWeight: 600}}>{n}</div>
                  {[0, 1, 2, 3, 4, 5].map((m) => <div key={m} style={{padding: '0 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: on ? ramp(f, rowAt(i) + m * 3, 8) : 0.25, fontWeight: hot && on ? 600 : 400}}>{on ? v : '—'}</div>)}
                </div>
              );
            })}
          </FormShell>
        </div>
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, top: 110, display: 'flex', justifyContent: 'center', gap: 22}}>
        {DRV.map(([, sub], i) => (
          <div key={sub} style={{background: cur === i ? C.gold : 'white', color: C.navy, fontSize: 34, fontWeight: 700, padding: '14px 28px', borderRadius: 14, boxShadow: '0 16px 40px rgba(29,68,90,0.18)',
            opacity: ramp(f, rowAt(i), 10), transform: `scale(${ramp(f, rowAt(i), 14, EASE.overshoot)})`}}>{sub}</div>
        ))}
      </div>
      {DRV.map((_, i) => <Sfx key={i} at={rowAt(i)} src="switch-tap" v={0.35} />)}
    </LightStage>
  );
};

// ======================= 7. CALC: days × daily revenue/cost → AR / AP / inventory =======================
const CALC: [string, string, string, number][] = [['45 days', '× revenue per day', 'Receivables', 6.3], ['30 days', '× purchases per day', 'Payables', 2.9], ['60 days', '× cost of sales per day', 'Inventory', 3.4]];
const S07: React.FC = () => {
  const l = L('c07_calc');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Planning does the math</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Days become balances</div>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 40, paddingTop: 120}}>
        {CALC.map(([d, x, n, v], i) => {
          const t = ramp(f, a + 10 + i * 18, 30, EASE.smooth);
          return (
            <Drop key={n} from={a + i * 18} h={160}>
              <div style={{width: 470, padding: '40px 44px', borderRadius: 26, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)'}}>
                <div style={{fontSize: 56, fontWeight: 700, color: C.gold}}>{d}</div>
                <div style={{fontSize: 32, color: C.blueLight, marginTop: 6}}>{x}</div>
                <div style={{height: 2, background: 'rgba(175,200,216,0.3)', margin: '26px 0'}} />
                <div style={{fontSize: 34, color: C.blueLight}}>{n}</div>
                <div style={{fontSize: 92, fontWeight: 700, letterSpacing: -3, fontVariantNumeric: 'tabular-nums'}}>${(v * t).toFixed(1)}M</div>
              </div>
            </Drop>
          );
        })}
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 170, textAlign: 'center', fontSize: 40, fontWeight: 600, opacity: ramp(f, b + 10, 12)}}>
        every month · from your <span style={{color: C.gold}}>revenue and costs</span>
      </div>
      <Source2>Demo data</Source2>
      {CALC.map((_, i) => <Sfx key={i} at={a + i * 18} src="hit-weak" v={0.35} />)}<Sfx at={b + 10} src="data-scan" v={0.25} />
    </Stage>
  );
};

// ======================= 8. ACCOUNTS: opening balances by bank, debt, capex =======================
const ACC: [string, string][] = [['Operating account · Bank A', '7,400,000'], ['Payroll account · Bank B', '1,900,000'], ['Reserve account · Bank C', '2,700,000'], ['Revolving credit line', '(4,000,000)'], ['Capital spending', '(3,100,000)']];
const S08: React.FC = () => {
  const l = L('c08_accounts');
  const f = useCurrentFrame();
  const b = at(l, 1, 0);
  const s = ACC.map((_, i) => b + i * 22);
  const typed = (i: number) => ACC[i][1].slice(0, Math.floor(Math.max(0, f - s[i]) * 1.2));
  const push = ramp(f, 0, 60, EASE.smooth);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2200}}>
        <div style={{transform: `scale(${mix(0.6, 0.66, push)}) rotateX(${mix(12, 4, push)}deg)`, transformOrigin: '50% 45%'}}>
          <FormShell title="Cash Accounts" module="Financials" pov={['Scenario:Forecast', 'Version:Working', 'Currency:USD']} tabs={['Balance Sheet Drivers', 'Cash Accounts', 'Cash Flow']} active={1} width={2400}>
            <div style={{display: 'grid', gridTemplateColumns: '1300px 1fr', fontSize: 34, color: C.muted, borderBottom: '2px solid #E6E6E6'}}>
              <div style={{padding: '18px 16px', fontWeight: 600}}>Account</div><div style={{padding: '18px 16px', textAlign: 'right', fontWeight: 600}}>FY27 · Opening / Plan</div>
            </div>
            {ACC.map(([n], i) => {
              const act = f >= s[i] - 4 && f < (s[i + 1] ?? 9999) - 4;
              return (
                <div key={n} style={{display: 'grid', gridTemplateColumns: '1300px 1fr', fontSize: 44, height: 106, alignItems: 'center', borderBottom: '2px solid #F0F0F0'}}>
                  <div style={{padding: '0 16px', color: C.navy, fontWeight: 600, background: '#F6F6F4', height: '100%', display: 'flex', alignItems: 'center'}}>{n}</div>
                  <div style={{padding: '0 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    outline: act ? '4px solid #2F7DD1' : undefined, outlineOffset: -4, background: typed(i) ? '#FFFBEA' : undefined, color: ACC[i][1].startsWith('(') ? '#B04A2A' : '#1B1B1B'}}>{typed(i)}</div>
                </div>
              );
            })}
          </FormShell>
        </div>
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, top: 60, textAlign: 'center', opacity: ramp(f, at(l, 0, 20), 12)}}>
        <div style={{display: 'inline-block', background: C.gold, color: C.navy, fontSize: 40, fontWeight: 700, padding: '14px 30px', borderRadius: 14, transform: `rotate(-1.5deg)`}}>What doesn’t come from the P&amp;L</div>
      </div>
      {s.map((x, i) => <Sfx key={i} at={x} src="switch-tap" v={0.22} />)}
    </LightStage>
  );
};

// ======================= 9. CASH FLOW: waterfall → ending cash lands on the balance sheet =======================
const WF: [string, number, 'base' | 'up' | 'down' | 'end'][] = [['Opening cash', 12.0, 'base'], ['Operating', 8.4, 'up'], ['Investing', -3.1, 'down'], ['Financing', -1.5, 'down'], ['Ending cash', 15.8, 'end']];
const S09: React.FC = () => {
  const l = L('c09_cashflow');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, 0);
  const H = 520 / 22;
  let run = 0;
  const fly = ramp(f, b + 10, 26, EASE.smooth);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Cash flow statement · FY27</Eyebrow2></div>
      <div style={{position: 'absolute', left: 150, top: 300, width: 980, height: 600, display: 'flex', alignItems: 'flex-end', gap: 34}}>
        {WF.map(([n, v, k], i) => {
          const t = ramp(f, a + i * 14, 18, EASE.overshoot);
          const lo = k === 'base' || k === 'end' ? 0 : k === 'up' ? run : run + v;
          const hgt = Math.abs(v);
          if (k === 'base') run = v; else if (k !== 'end') run += v;
          const col = k === 'up' ? C.green : k === 'down' ? RED : k === 'end' ? C.gold : '#3F7C9C';
          return (
            <div key={n} style={{flex: 1, height: '100%', position: 'relative'}}>
              <div style={{position: 'absolute', left: 0, right: 0, bottom: 60 + lo * H, height: hgt * H * t, background: col, borderRadius: 8}} />
              <div style={{position: 'absolute', left: 0, right: 0, bottom: 70 + (lo + hgt) * H, textAlign: 'center', fontSize: 34, fontWeight: 700, opacity: t, fontVariantNumeric: 'tabular-nums'}}>
                {k === 'down' ? '−' : k === 'up' ? '+' : ''}${Math.abs(v).toFixed(1)}M
              </div>
              <div style={{position: 'absolute', left: -10, right: -10, bottom: 0, textAlign: 'center', fontSize: 28, color: C.blueLight}}>{n}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', right: 150, top: 330, width: 520, borderRadius: 24, background: '#FBFAF7', color: C.ink, padding: '30px 36px', boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
        opacity: ramp(f, b - 6, 12), transform: `perspective(1400px) rotateY(${(1 - ramp(f, b - 6, 16, EASE.snappy)) * -60}deg)`}}>
        <div style={{fontSize: 24, fontWeight: 600, letterSpacing: 4, color: C.green, textTransform: 'uppercase'}}>Balance sheet · Dec</div>
        {[['Cash', fly > 0.95 ? '$15.8M' : '—'], ['Receivables', '$6.3M'], ['Inventory', '$3.4M'], ['Payables', '($2.9M)']].map(([n, v], i) => (
          <div key={n} style={{display: 'flex', justifyContent: 'space-between', fontSize: 38, height: 90, alignItems: 'center', borderBottom: '2px solid rgba(29,68,90,0.08)',
            background: i === 0 && fly > 0.95 ? `rgba(252,202,71,${0.4 * (1 - ramp(f, b + 40, 30))})` : undefined}}>
            <span style={{fontWeight: 600, color: C.navy}}>{n}</span><span style={{fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>{v}</span>
          </div>
        ))}
      </div>
      {fly > 0 && fly < 1 && (
        <div style={{position: 'absolute', left: mix(960, 1530, fly), top: mix(300, 420, fly) - Math.sin(fly * Math.PI) * 120, background: C.gold, color: C.navy, fontSize: 36, fontWeight: 700,
          padding: '10px 20px', borderRadius: 12, boxShadow: '0 0 30px rgba(252,202,71,0.6)'}}>$15.8M</div>
      )}
      <Source2>Demo data</Source2>
      {WF.map((_, i) => <Sfx key={i} at={a + i * 14} src="hit-weak" v={0.3} />)}<Sfx at={b + 10} src="swoosh-slow" v={0.3} /><Sfx at={b + 36} src="pop" v={0.4} />
    </Stage>
  );
};

// ======================= 10. LIQUIDITY: ending cash vs minimum =======================
const S10: React.FC = () => {
  const l = L('c10_liquidity');
  const f = useCurrentFrame();
  const a = at(l, 0, 0), b = at(l, 1, 0);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Liquidity · ending cash vs minimum</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>See the gap now, not then</div>
      <div style={{position: 'absolute', left: 210, top: 330}}><CashChart draw={ramp(f, a, 50, EASE.smooth)} showMin={ramp(f, a + 40, 20, EASE.smooth)} flag={ramp(f, b, 12)} /></div>
      <div style={{position: 'absolute', left: 900, top: 560, opacity: ramp(f, b + 6, 12), transform: `scale(${ramp(f, b + 6, 14, EASE.overshoot)})`}}>
        <div style={{background: RED, color: 'white', fontSize: 36, fontWeight: 700, padding: '12px 26px', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>Aug · $3.8M · $1.2M short</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={b + 6} src="bass-hit-short" v={0.45} />
    </Stage>
  );
};

// ======================= 11. WHAT-IF: DSO 45 → 35, the line lifts, the gap closes =======================
const S11: React.FC = () => {
  const l = L('c11_whatif');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const lift = ramp(f, a + 24, 40, EASE.smooth);
  const dso = Math.round(mix(45, 35, ramp(f, a, 24, EASE.smooth)));
  const ok = ramp(f, b + 10, 14, EASE.overshoot);
  return (
    <Stage glow={[0.5, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>What if</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Collect 10 days faster</div>
      <div style={{position: 'absolute', right: 170, top: 130, padding: '20px 34px', borderRadius: 18, background: 'white', color: C.navy, textAlign: 'right', boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>
        <div style={{fontSize: 26, color: C.muted}}>DSO</div>
        <div style={{fontSize: 80, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1}}>{dso}<span style={{fontSize: 34, color: C.muted}}> days</span></div>
      </div>
      <div style={{position: 'absolute', left: 210, top: 330}}><CashChart draw={1} lift={lift} showMin={1} flag={1 - lift} /></div>
      <div style={{position: 'absolute', left: 1050, top: 640, opacity: ok, transform: `scale(${ok})`}}>
        <div style={{background: C.green, color: 'white', fontSize: 38, fontWeight: 700, padding: '12px 28px', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>✓ Gap closed</div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="switch-tap" v={0.45} /><Sfx at={a + 24} src="riser-cine" v={0.2} /><Sfx at={b + 10} src="sparkle" v={0.35} />
    </Stage>
  );
};

// ======================= 12. COMPARE: forecast vs plan vs prior year → one model slam =======================
const CMP: [string, number, number, number][] = [['Operating cash flow', 8.4, 7.9, 6.8], ['Investing', -3.1, -3.5, -2.2], ['Financing', -1.5, -1.5, -0.9], ['Ending cash', 15.8, 14.9, 12.0]];
const S12: React.FC = () => {
  const l = L('c12_compare');
  const f = useCurrentFrame();
  const a = at(l, 0, 6), b = at(l, 1, -4);
  const shrink = ramp(f, b, 20, EASE.smooth);
  const GC = '520px 270px 270px 270px';
  const fm = (v: number) => (v < 0 ? `($${Math.abs(v).toFixed(1)}M)` : `$${v.toFixed(1)}M`);
  return (
    <Stage glow={[0.45, 0.3]}>
      <div style={{position: 'absolute', left: 170, top: 120, opacity: 1 - shrink}}><Eyebrow2>Cash flow · forecast vs plan vs prior year</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 240, width: 1330, borderRadius: 24, background: '#FBFAF7', color: C.ink, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
        opacity: ramp(f, a, 14) * mix(1, 0, shrink), transform: `translateY(${(1 - ramp(f, a, 18, EASE.snappy)) * 50}px) scale(${mix(1, 0.92, shrink)})`}}>
        <div style={{display: 'grid', gridTemplateColumns: GC, fontSize: 32, color: C.muted, fontWeight: 600, background: '#EEF1EE'}}>
          {['', 'Forecast', 'Plan', 'Prior year'].map((h, i) => <div key={i} style={{padding: '22px 30px', textAlign: i ? 'right' : 'left'}}>{h}</div>)}
        </div>
        {CMP.map(([n, fc, pl, py], i) => (
          <div key={n} style={{display: 'grid', gridTemplateColumns: GC, fontSize: 42, height: 100, alignItems: 'center', borderTop: '2px solid #ECECEC', fontWeight: i === 3 ? 700 : 400,
            background: i === 3 ? 'rgba(252,202,71,0.3)' : undefined, opacity: ramp(f, a + 10 + i * 6, 12)}}>
            <div style={{padding: '0 30px', color: C.navy, fontWeight: 600}}>{n}</div>
            {[fc, pl, py].map((v, k) => <div key={k} style={{padding: '0 30px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: k ? C.muted : undefined}}>{fm(v)}</div>)}
          </div>
        ))}
      </div>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 10}}>
        <Slam from={b + 10} shake={12}><Big color="white">Revenue <span style={{color: C.gold}}>→</span> Cash</Big></Slam>
        <div style={{fontSize: 44, fontWeight: 600, color: C.blueLight, opacity: ramp(f, b + 22, 12)}}>one model</div>
        <div style={{marginLeft: 120, marginTop: -10}}><Marker from={b + 30} width={260} /></div>
      </AbsoluteFill>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="paper-slide" v={0.35} /><Sfx at={b + 10} src="impact-cine-big" v={0.4} /><Sfx at={b + 30} src="marker-pen-line" v={0.3} />
      <Flash at={b + 10} peak={0.2} color="#FCCA47" />
    </Stage>
  );
};

// ======================= 13. CTA =======================
const S13: React.FC = () => {
  const l = L('c13_cta');
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
          Write to BPC to forecast cash in NetSuite Planning.
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
  c01_hook: S01, c02_pain: S02, c03_promise: S03, c04_value: S04, c05_nav: S05, c06_drivers: S06, c07_calc: S07,
  c08_accounts: S08, c09_cashflow: S09, c10_liquidity: S10, c11_whatif: S11, c12_compare: S12, c13_cta: S13,
};

export const CashVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/tonight-hiphop.mp3')} volume={(fr) => 0.075 * interpolate(fr, [0, 20, TOTAL_CF - 75, TOTAL_CF], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 'c13_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/cf/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.12} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
