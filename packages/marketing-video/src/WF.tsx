// Workforce Planning sales + how-it-works video. Same motion system as V2 (see RECETA.md).
// Every screen is rebuilt in HTML with invented data — no client names, logos or salaries.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing-wf.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {DoF, Drop, EASE, Flash, Float, LightStage, Marker, Plane, Slam, Stage, cruise, easeFall, hash, liftOf, mix, ramp} from './fx';
import {BlurWords, Big, DotWave, Eyebrow2, Relay, Roll, Sfx, Source2, StatCol} from './V2';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL_WF = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['w03_promise', 'w07_newhire', 'w11_cta']);
const money = (n: number) => n.toLocaleString('en-US');

// Invented demo org
const DEPTS = ['Finance', 'Sales', 'Engineering', 'Operations', 'Customer Success', 'People'];

// ======================= 1. HOOK =======================
const S01: React.FC = () => {
  const f = useCurrentFrame();
  const l = L('w01_hook');
  return (
    <Stage>
      {/* bumper: spreadsheet cells flashing past */}
      {f < 30 && (
        <AbsoluteFill style={{overflow: 'hidden', background: '#0B1F2B', perspective: 900}}>
          <div style={{position: 'absolute', left: -200, top: -100, transform: `rotateX(38deg) rotateZ(-12deg) translateY(${-f * 24}px)`, display: 'grid',
            gridTemplateColumns: 'repeat(14, 180px)', gap: 4}}>
            {Array.from({length: 14 * 18}).map((_, i) => (
              <div key={i} style={{height: 56, background: i % 14 === 0 ? '#1D445A' : 'rgba(255,255,255,0.06)', color: hash(i) > 0.8 ? C.gold : 'rgba(175,200,216,0.7)',
                fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, fontVariantNumeric: 'tabular-nums'}}>
                {i % 14 === 0 ? `EMP-${1000 + Math.floor(i / 14) * 7}` : hash(i) > 0.35 ? money(Math.round(40000 + hash(i * 2) * 140000)) : ''}
              </div>
            ))}
          </div>
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 30%, rgba(5,14,20,0.85))'}} />
        </AbsoluteFill>
      )}
      {f >= 30 && f < 36 && <AbsoluteFill style={{background: '#050E14'}} />}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
          <Slam from={at(l, 0, 2)} style={{fontSize: 140, fontWeight: 700, letterSpacing: -5}}>
            Your <span style={{color: C.gold}}>biggest</span> cost.
          </Slam>
          <BlurWords from={at(l, 1, 14)} size={92} weight={600} parts={['Still', 'in', 'a', 'spreadsheet?']} hot={-1} color={C.blueLight} />
          <div style={{marginTop: -44, marginLeft: 330}}><Marker from={at(l, 1, 40)} width={430} /></div>
        </div>
      </AbsoluteFill>
      <Flash at={at(l, 0, 2)} peak={0.35} />
      <Sfx at={0} src="whoosh-fast" v={0.3} />
      <Sfx at={at(l, 0, 0)} src="impact-zoom-quick" v={0.5} />
      <Sfx at={at(l, 1, 40)} src="marker-pen-line" v={0.35} />
    </Stage>
  );
};

// ======================= 2. PAIN: file flock → hand formula → mismatch =======================
const FILES = ['Headcount_v7_FINAL.xlsx', 'Raises_FY27.xlsx', 'Bonus_calc (2).xlsx', 'Benefit_rates.xlsx', 'NewHires_Sales.xlsx', 'Payroll_taxes_OLD.xlsx'];
const FORMULA = '=C12*6.2%+MIN(C12,176100)*1.45%+C12*3.5%';
const S02: React.FC = () => {
  const l = L('w02_pain');
  const f = useCurrentFrame();
  const a = at(l, 0), b = at(l, 1, -4), c = at(l, 2, -4);
  const out1 = ramp(f, b - 6, 12, EASE.exit);
  const typed = Math.floor(Math.max(0, f - b - 6) * 1.3);
  const out2 = ramp(f, c - 6, 12, EASE.exit);
  const neq = c + 34;
  return (
    <Stage glow={[0.4, 0.3]}>
      {/* card flock: spreadsheets tumble in and scatter */}
      <AbsoluteFill style={{perspective: 1600, opacity: 1 - out1}}>
        {FILES.map((n, i) => {
          const from = a + 4 + i * 7;
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
              <div style={{fontSize: 22, color: C.muted, marginTop: 8}}>Last edited by someone else</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* the hand formula */}
      <Relay from={b} to={c}>
        {() => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: 1 - out2}}>
            <div style={{width: 1500, borderRadius: 22, background: '#FBFAF7', color: C.ink, boxShadow: '0 40px 90px rgba(0,0,0,0.5)', overflow: 'hidden', transform: `rotateX(6deg)`}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 24, padding: '26px 34px', borderBottom: '2px solid #E2E2DC', fontSize: 40, fontFamily: 'Consolas, monospace'}}>
                <span style={{fontStyle: 'italic', color: C.muted, fontFamily: FONT}}>fx</span>
                <span>{FORMULA.slice(0, typed)}<span style={{opacity: f % 16 < 8 ? 1 : 0}}>|</span></span>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '240px repeat(4, 1fr)', fontSize: 32}}>
                {['', 'Salary', 'Taxes', 'Benefits', 'Total'].map((h) => <div key={h} style={{padding: '16px 24px', background: '#EEF1EE', fontWeight: 600, color: C.muted}}>{h}</div>)}
                {[0, 1, 2].map((r) => (
                  <React.Fragment key={r}>
                    <div style={{padding: '16px 24px', color: C.navy, fontWeight: 600}}>EMP-10{12 + r}</div>
                    <div style={{padding: '16px 24px', textAlign: 'right'}}>{money([92000, 118500, 76000][r])}</div>
                    <div style={{padding: '16px 24px', textAlign: 'right', color: r === 1 ? '#C25A2A' : undefined, background: r === 1 ? '#FBE3D3' : undefined}}>{r === 1 ? '#REF!' : money([7038, 0, 5814][r])}</div>
                    <div style={{padding: '16px 24px', textAlign: 'right'}}>{money([3220, 4148, 2660][r])}</div>
                    <div style={{padding: '16px 24px', textAlign: 'right', fontWeight: 600}}>{r === 1 ? '?' : money([102258, 0, 84474][r])}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      {/* mismatch */}
      <Relay from={c} to={useVideoConfig().durationInFrames + 8}>
        {(_, local) => (
          <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 90}}>
            {[['Headcount plan', 14.82], ['Budget in Financials', 15.31]].map(([t, v], i) => (
              <div key={t as string} style={{width: 560, padding: '44px 50px', borderRadius: 26, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.25)',
                opacity: ramp(local, i * 10, 14), transform: `translateY(${(1 - ramp(local, i * 10, 18, EASE.snappy)) * 60}px)`}}>
                <div style={{fontSize: 30, color: C.blueLight, fontWeight: 500}}>{t}</div>
                <div style={{fontSize: 120, fontWeight: 700, letterSpacing: -4, fontVariantNumeric: 'tabular-nums'}}>${(Number(v) * ramp(local, i * 10, 26, EASE.snappy)).toFixed(2)}M</div>
              </div>
            )).flatMap((el, i) => (i === 0 ? [el, <Slam key="neq" from={neq} shake={14}><div style={{fontSize: 170, fontWeight: 700, color: C.gold}}>≠</div></Slam>] : [el]))}
          </AbsoluteFill>
        )}
      </Relay>
      <Source2>Illustrative example</Source2>
      {FILES.map((_, i) => <Sfx key={i} at={a + 4 + i * 7} src="paper-slide" v={0.22} />)}
      <Sfx at={b + 6} src="clock-tick-single" v={0.25} /><Sfx at={neq} src="bass-hit-short" v={0.55} />
    </Stage>
  );
};

// ======================= 3. PROMISE: text-as-mask "PEOPLE" → three chips =======================
const S03: React.FC = () => {
  const l = L('w03_promise');
  const f = useCurrentFrame();
  const enter = ramp(f, at(l, 0), 20, EASE.snappy);
  const scroll = f * 3;
  const chip = (i: number) => ramp(f, at(l, 1, 6 + i * 22), 14, EASE.overshoot);
  const rise = ramp(f, at(l, 1, -10), 22, EASE.smooth);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `translateY(${mix(40, -90, rise)}px)`}}>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, letterSpacing: -0.5, marginBottom: -10}}>Workforce Planning puts your</div>
        <div style={{fontSize: 360, fontWeight: 700, letterSpacing: -16, lineHeight: 1, transform: `scale(${mix(1.08, 1, enter)})`, opacity: enter,
          backgroundImage: `repeating-linear-gradient(180deg, ${C.navy} 0px, ${C.navy} 30px, #24546E 30px, #24546E 34px), linear-gradient(90deg, ${C.navy}, ${C.green})`,
          backgroundBlendMode: 'multiply', backgroundSize: `100% 34px, 100% 100%`, backgroundPosition: `0 ${-scroll}px, 0 0`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', clipPath: `inset(${(1 - enter) * 100}% 0 0 0)`}}>PEOPLE</div>
        <div style={{fontSize: 42, fontWeight: 500, color: C.green, opacity: enter, marginTop: -6}}>inside NetSuite Planning.</div>
        <div style={{display: 'flex', gap: 26, marginTop: 70}}>
          {['Every employee', 'Every cost', 'Every open role'].map((t, i) => (
            <div key={t} style={{padding: '20px 38px', borderRadius: 999, border: `3px solid ${C.gold}`, background: 'white', color: C.navy, fontSize: 44, fontWeight: 600,
              transform: `scale(${chip(i)})`, opacity: Math.min(1, chip(i) * 2), boxShadow: '0 16px 40px rgba(29,68,90,0.15)'}}>{t}</div>
          ))}
        </div>
        <div style={{marginTop: 40, fontSize: 40, fontWeight: 600, color: C.navy, opacity: ramp(f, at(l, 1, 90), 14)}}>
          one model, connected to your <span style={{color: C.green}}>P&amp;L</span>
        </div>
      </AbsoluteFill>
      <Sfx at={at(l, 0)} src="swoosh-slow" v={0.3} />
      {[0, 1, 2].map((i) => <Sfx key={i} at={at(l, 1, 6 + i * 22)} src="pop" v={0.3} />)}
    </LightStage>
  );
};

// ======================= 4. VALUE: three capability stats on a drifting board =======================
const S04: React.FC = () => {
  const l = L('w04_value');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 4), c = at(l, 2, 4);
  const ry = mix(-7, 5, f / 434);
  const month = Math.floor(Math.max(0, f - a - 20) / 3);
  return (
    <Stage>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 140}}><Eyebrow2>What it does for finance</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{perspective: 1600}}>
        <AbsoluteFill style={{transform: `rotateX(9deg) rotateY(${ry}deg)`, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 40, paddingTop: 60}}>
          <StatCol from={a} label="every employee, every month">
            <div style={{position: 'absolute'}}>
              <DotWave from={a} n={12 * 14} cols={12} size={16} gap={9} lit={(i) => i % 12 < month} litFrom={a + 20} />
            </div>
            <div style={{position: 'absolute', bottom: -10, fontSize: 30, color: C.gold, fontWeight: 600, opacity: ramp(f, a + 20, 10)}}>salary · taxes · benefits</div>
          </StatCol>
          <StatCol from={b} label="open roles planned by department">
            <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
              {['Sr. Accountant · Finance', 'AE · Sales', 'Engineer · Engineering'].map((t, i) => (
                <Drop key={t} from={b + i * 8} h={160}>
                  <div style={{width: 400, padding: '18px 24px', borderRadius: 16, background: 'white', color: C.navy, fontSize: 28, fontWeight: 600, borderLeft: `8px solid ${C.gold}`, textAlign: 'left'}}>
                    <div style={{fontSize: 18, letterSpacing: 3, color: C.green, textTransform: 'uppercase'}}>To be hired</div>{t}
                  </div>
                </Drop>
              ))}
            </div>
          </StatCol>
          <StatCol from={c} label="lands in Financials automatically">
            <svg width={440} height={300} style={{overflow: 'visible'}}>
              <path d="M 20 250 C 160 250, 200 60, 400 60" stroke={C.gold} strokeWidth={6} fill="none" strokeDasharray={520} strokeDashoffset={520 * (1 - ramp(f, c, 24, EASE.swift))} strokeLinecap="round" />
              <circle cx={20} cy={250} r={18} fill={C.blueLight} opacity={ramp(f, c, 8)} />
            </svg>
            <div style={{position: 'absolute', right: 0, top: 10, padding: '18px 30px', borderRadius: 16, background: C.gold, color: C.navy, fontSize: 44, fontWeight: 700,
              transform: `scale(${ramp(f, c + 20, 14, EASE.overshoot)})`}}>P&amp;L</div>
          </StatCol>
        </AbsoluteFill>
      </AbsoluteFill>
      <Sfx at={a} src="data-scan" v={0.2} /><Sfx at={b} src="hit-weak" v={0.4} /><Sfx at={b + 8} src="hit-weak" v={0.3} /><Sfx at={b + 16} src="hit-weak" v={0.3} />
      <Sfx at={c} src="sweep-short" v={0.3} /><Sfx at={c + 20} src="pop" v={0.35} />
    </Stage>
  );
};

// ======================= shared NSPB-style form chrome (rebuilt, BPC-neutral) =======================
const FormShell: React.FC<{title: string; pov: string[]; tabs: string[]; active: number; width?: number; children: React.ReactNode}> = ({title, pov, tabs, active, width = 2600, children}) => (
  <div style={{width, background: '#FFFFFF', borderRadius: 30, overflow: 'hidden', fontFamily: FONT, color: C.ink, boxShadow: '0 40px 100px rgba(0,0,0,0.35)'}}>
    <div style={{height: 96, background: '#2C2A28', display: 'flex', alignItems: 'center', padding: '0 46px', gap: 30, color: 'white', fontSize: 38}}>
      <div style={{width: 46, display: 'flex', flexDirection: 'column', gap: 8}}>{[0, 1, 2].map((i) => <div key={i} style={{height: 5, background: 'white', borderRadius: 3}} />)}</div>
      <span style={{fontWeight: 500}}>NetSuite Planning and Budgeting</span>
    </div>
    <div style={{height: 84, background: '#3A6B6E', display: 'flex', alignItems: 'center', padding: '0 60px', gap: 70, color: 'rgba(255,255,255,0.85)', fontSize: 34}}>
      {['Revenue and Gross Margin', 'Workforce', 'OpEx', 'Rules', 'Dashboards', 'Reports'].map((t) => (
        <span key={t} style={{fontWeight: t === 'Workforce' ? 700 : 500, color: t === 'Workforce' ? 'white' : undefined, borderBottom: t === 'Workforce' ? '5px solid white' : undefined, paddingBottom: 8}}>{t}</span>
      ))}
    </div>
    <div style={{padding: '40px 60px 0'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{fontSize: 64, fontWeight: 700, color: '#1B1B1B'}}>{title}</div>
        <div style={{display: 'flex', gap: 20}}>
          <div style={{padding: '14px 30px', border: '2px solid #CFCFCF', borderRadius: 10, fontSize: 30}}>Actions ▾</div>
          <div style={{padding: '14px 30px', background: '#2C2A28', color: 'white', borderRadius: 10, fontSize: 30, fontWeight: 600}}>Save</div>
        </div>
      </div>
      <div style={{display: 'flex', gap: 50, marginTop: 22, fontSize: 28, color: C.muted}}>
        {pov.map((p) => <div key={p}>{p.split(':')[0]}<div style={{color: '#1B1B1B', fontWeight: 600}}>{p.split(':')[1]} ▾</div></div>)}
      </div>
    </div>
    <div style={{padding: '30px 60px 30px'}}>{children}</div>
    <div style={{display: 'flex', gap: 80, padding: '26px 60px', borderTop: '2px solid #E6E6E6', fontSize: 30, color: C.muted}}>
      {tabs.map((t, i) => <span key={t} style={{color: i === active ? '#1B1B1B' : undefined, fontWeight: i === active ? 600 : 400, borderTop: i === active ? `5px solid #3A6B6E` : undefined, paddingTop: 10}}>{t}</span>)}
    </div>
  </div>
);

// ======================= 5. CONFIG: "Here is how it works" → graze tour over Annual Assumptions =======================
const ASSUME: [string, string, string][] = [
  ['401(k) Eligible after Days', '90', '90'], ['401(k) Company Match %', '3.5%', '3.5%'], ['Working Hours per Day', '8', '8'], ['Merit Month', 'Apr', 'Apr'],
  ['Social Security %', '6.2%', '6.2%'], ['Social Security Max', '176,100', '182,400'], ['Medicare %', '1.45%', '1.45%'], ['FUTA %', '0.6%', '0.6%'],
  ['FUTA Max', '7,000', '7,000'], ['SUTA %', '2.7%', '2.7%'], ['SUTA Max', '9,000', '9,000'], ['Health Insurance / month', '640', '672'],
];
const AssumeTable: React.FC<{t: number; hot?: number}> = ({t, hot = 0}) => (
  <FormShell title="Annual Assumptions" pov={['Subsidiary:Demo Co USA']} tabs={['Annual Assumptions', 'Monthly Assumptions', 'Pay Schedule']} active={0} width={2200}>
    <div style={{display: 'grid', gridTemplateColumns: '1100px 380px 380px', fontSize: 44}}>
      <div /><div style={{textAlign: 'center', color: C.muted, padding: 20, borderBottom: '2px solid #E6E6E6'}}>FY27</div><div style={{textAlign: 'center', color: C.muted, padding: 20, borderBottom: '2px solid #E6E6E6'}}>FY28</div>
    </div>
    {ASSUME.map((r, i) => {
      const isHot = i >= 4 && i <= 6;
      return (
        <Float key={r[0]} h={liftOf(t, 0.15 + (i / ASSUME.length) * 0.7, 140) + (isHot ? hot * 50 : 0)}>
          <div style={{display: 'grid', gridTemplateColumns: '1100px 380px 380px', fontSize: 44, height: 92, alignItems: 'center', borderBottom: '2px solid #EFEFEF',
            background: isHot && hot > 0.05 ? `rgba(255,241,201,${hot})` : undefined}}>
            <div style={{paddingLeft: 10, color: '#1B1B1B'}}>{r[0]}</div>
            <div style={{textAlign: 'right', paddingRight: 60, fontVariantNumeric: 'tabular-nums'}}>{r[1]}</div>
            <div style={{textAlign: 'right', paddingRight: 60, fontVariantNumeric: 'tabular-nums'}}>{r[2]}</div>
          </div>
        </Float>
      );
    })}
  </FormShell>
);
const S05: React.FC = () => {
  const l = L('w05_config');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -10);
  const hot = ramp(f, at(l, 1, 60), 16, EASE.snappy);
  return (
    <Stage glow={[0.6, 0.3]}>
      <Relay from={0} to={b}>
        {(u) => (
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 10}}>
            <Eyebrow2>Part two</Eyebrow2>
            <BlurWords from={at(l, 0, -4)} size={120} weight={700} parts={['Here', 'is', 'how', 'it', 'works.']} hot={2} color="white" />
            <div style={{transform: `scale(${1 + u * 0.15})`}} />
          </AbsoluteFill>
        )}
      </Relay>
      <Relay from={b} to={d + 8}>
        {(u) => (
          <DoF fx={48} fy={50} blur={10}>
            <Plane cam={{rx: 16, ry: 26, rz: -4, scale: 0.6, x: [300, 120], y: [420, -150]}} p={cruise(u)}><AssumeTable t={Math.min(1, u * 1.6)} hot={hot} /></Plane>
          </DoF>
        )}
      </Relay>
      <div style={{position: 'absolute', left: 0, right: 0, top: 130, textAlign: 'center', opacity: ramp(f, at(l, 1, 66), 12)}}>
        <div style={{display: 'inline-block', background: C.gold, color: C.navy, fontSize: 44, fontWeight: 700, padding: '16px 34px', borderRadius: 14, transform: `rotate(-1.5deg) scale(${ramp(f, at(l, 1, 66), 14, EASE.overshoot)})`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>Set once · used for every employee</div>
      </div>
      <Sfx at={b} src="air-woosh-quick" v={0.35} /><Sfx at={at(l, 1, 66)} src="pop" v={0.3} />
    </Stage>
  );
};

// ======================= 6. ROSTER: steep-tilt glide + split-allocation lift =======================
type Emp = [string, string, string, string, string, string];
const EMPS: Emp[] = Array.from({length: 14}).map((_, i) => {
  const d = DEPTS[Math.floor(hash(i * 5.3) * DEPTS.length)];
  const y = 14 + Math.floor(hash(i + 2) * 12);
  const pay = Math.round((62000 + hash(i * 1.7) * 108000) / 500) * 500;
  return [`EMP-${1012 + i * 7}`, d, `${1 + Math.floor(hash(i + 7) * 12)}/${1 + Math.floor(hash(i + 3) * 27)}/${y}`, i === 9 ? 'Hourly' : 'Salary', money(pay), i === 5 ? '60%' : '100%'];
});
const RosterTable: React.FC<{t: number; lift?: number}> = ({t, lift = 0}) => (
  <FormShell title="Company Roster" pov={['Subsidiary:Demo Co USA', 'Currency:USD']} tabs={['Company Roster', 'Roster by Department', 'New Hires']} active={0} width={2700}>
    <div style={{display: 'grid', gridTemplateColumns: '300px 460px 340px 320px 360px 420px', fontSize: 36, color: C.muted, borderBottom: '2px solid #E6E6E6'}}>
      {['Employee', 'Department', 'Hire Date', 'Salary Basis', 'Pay Rate', 'Dept Allocation %'].map((h) => <div key={h} style={{padding: '18px 16px', textAlign: h === 'Pay Rate' || h.startsWith('Dept') ? 'right' : 'left'}}>{h}</div>)}
    </div>
    {EMPS.map((e, i) => {
      const isS = i === 5;
      return (
        <Float key={e[0]} h={liftOf(t, 0.2 + (i / EMPS.length) * 0.65, 130) + (isS ? lift : 0)}>
          <div style={{display: 'grid', gridTemplateColumns: '300px 460px 340px 320px 360px 420px', fontSize: 40, height: 82, alignItems: 'center', borderBottom: '2px solid #F0F0F0',
            background: isS && lift > 2 ? 'white' : undefined, outline: isS && lift > 2 ? `6px solid ${C.gold}` : undefined, borderRadius: isS && lift > 2 ? 14 : 0}}>
            {e.map((v, k) => <div key={k} style={{padding: '0 16px', textAlign: k >= 4 ? 'right' : 'left', fontWeight: k === 0 ? 600 : 400, color: k === 0 ? C.navy : '#1B1B1B', fontVariantNumeric: 'tabular-nums'}}>{v}</div>)}
          </div>
        </Float>
      );
    })}
  </FormShell>
);
const S06: React.FC = () => {
  const l = L('w06_roster');
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, 40);
  return (
    <Stage>
      <Relay from={0} to={b}>
        {(u) => (
          <DoF fx={50} fy={48} blur={10}>
            <Plane cam={{rx: 10, ry: -30, rz: 3, scale: 0.56, x: [500, -350], y: [200, -60]}} p={cruise(u)}><RosterTable t={Math.min(1, u * 1.5)} /></Plane>
          </DoF>
        )}
      </Relay>
      <Relay from={b} to={d + 8}>
        {(_, local) => {
          const lift = mix(0, 90, ramp(local, 8, 18, EASE.overshoot));
          const split = ramp(local, 30, 20, EASE.snappy);
          return (
            <>
              <Plane cam={{rx: 20, ry: 0, rz: 0, scale: 0.6, x: [0, 0], y: [60, 40]}} p={ramp(local, 0, 120)}><RosterTable t={1} lift={lift} /></Plane>
              <div style={{position: 'absolute', left: 0, right: 0, bottom: 190, display: 'flex', justifyContent: 'center', gap: 0, opacity: ramp(local, 26, 10)}}>
                <div style={{display: 'flex', width: 1100, height: 92, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.45)'}}>
                  <div style={{width: `${mix(100, 60, split)}%`, background: C.green, color: 'white', fontSize: 38, fontWeight: 600, display: 'flex', alignItems: 'center', paddingLeft: 30}}>60% Finance</div>
                  <div style={{flex: 1, background: C.gold, color: C.navy, fontSize: 38, fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 30, whiteSpace: 'nowrap', overflow: 'hidden'}}>40% Operations</div>
                </div>
              </div>
            </>
          );
        }}
      </Relay>
      <Source2>Demo data</Source2>
      <Sfx at={0} src="whoosh-fast" v={0.25} /><Sfx at={b + 8} src="paper-slide" v={0.4} /><Sfx at={b + 30} src="switch-tap" v={0.4} />
    </Stage>
  );
};

// ======================= 7. NEW HIRE: cursor + typing on the form, then Update Workforce =======================
const NH = ['Senior Accountant', 'EMP-1012', '3/1/27', 'Salary', '95,000'];
const NewHireForm: React.FC<{local: number; s: number[]; menu: number; click: number}> = ({local, s, menu, click}) => {
  const typed = (k: number) => {
    const n = Math.floor(Math.max(0, local - s[k]) * 1.2);
    return NH[k].slice(0, n);
  };
  return (
    <FormShell title="New Hires by Department" pov={['Subsidiary:Demo Co USA', 'Department:Finance', 'Currency:USD']} tabs={['Company Roster', 'Roster by Department', 'New Hires']} active={2} width={2500}>
      <div style={{position: 'relative'}}>
        <div style={{display: 'grid', gridTemplateColumns: '320px 480px 340px 300px 320px 380px', fontSize: 36, color: C.muted, borderBottom: '2px solid #E6E6E6'}}>
          {['', 'Job Title', 'Supervisor', 'Hire Date', 'Salary Basis', 'Input Rate'].map((h, i) => <div key={i} style={{padding: '18px 16px', textAlign: i === 5 ? 'right' : 'left'}}>{h}</div>)}
        </div>
        {Array.from({length: 7}).map((_, r) => (
          <div key={r} style={{display: 'grid', gridTemplateColumns: '320px 480px 340px 300px 320px 380px', fontSize: 40, height: 84, alignItems: 'center', borderBottom: '2px solid #F0F0F0'}}>
            <div style={{padding: '0 16px', color: '#1B1B1B', background: '#F6F6F4', height: '100%', display: 'flex', alignItems: 'center'}}>To Be Hired {r + 1}</div>
            {[0, 1, 2, 3, 4].map((k) => {
              const active = r === 0 && local >= s[k] - 4 && local < (s[k + 1] ?? 9999) - 4;
              return (
                <div key={k} style={{padding: '0 16px', textAlign: k === 4 ? 'right' : 'left', height: '100%', display: 'flex', alignItems: 'center', justifyContent: k === 4 ? 'flex-end' : 'flex-start',
                  outline: active ? `4px solid #2F7DD1` : undefined, outlineOffset: -4, background: r === 0 && typed(k) ? '#FFFBEA' : undefined}}>
                  {r === 0 ? typed(k) : ''}
                </div>
              );
            })}
          </div>
        ))}
        {menu > 0 && (
          <div style={{position: 'absolute', right: 0, top: -170, width: 640, background: 'white', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', padding: '24px 0',
            transform: `scale(${mix(0.9, 1, menu)})`, opacity: menu, transformOrigin: '100% 0'}}>
            <div style={{fontSize: 30, fontWeight: 700, padding: '10px 34px', color: '#1B1B1B'}}>Rules</div>
            {['Update Workforce', 'Update Financials'].map((t, i) => (
              <div key={t} style={{fontSize: 38, padding: '20px 34px', color: '#2F6FB0', background: i === 0 && click > 0 ? `rgba(252,202,71,${0.5 * click})` : undefined}}>▦ {t}</div>
            ))}
          </div>
        )}
      </div>
    </FormShell>
  );
};
const Cursor: React.FC<{x: number; y: number; press: number}> = ({x, y, press}) => (
  <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0}}>
    {press > 0 && <div style={{position: 'absolute', left: -60 * press, top: -60 * press, width: 120 * press, height: 120 * press, borderRadius: '50%', border: `4px solid ${C.gold}`, opacity: 1 - press}} />}
    <svg width={46} height={56} viewBox="0 0 23 28" style={{position: 'absolute', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))'}}>
      <path d="M1 1 L1 22 L7 17 L11 26 L15 24 L11 15 L19 15 Z" fill="white" stroke="#1B1B1B" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);
const S07: React.FC = () => {
  const l = L('w07_newhire');
  const f = useCurrentFrame();
  const s1 = at(l, 1, 0);
  const s = [s1, s1 + 22, s1 + 36, s1 + 48, s1 + 58];
  const c = at(l, 2, -4);
  const menu = ramp(f, c + 10, 10, EASE.snappy);
  const clickAt = c + 34;
  const click = ramp(f, clickAt, 8);
  // cursor path (screen px, after the plane's scale)
  const P: [number, number, number][] = [[0, 1500, 900], [at(l, 0, 30), 520, 470], [s[0], 600, 470], [s[1], 860, 470], [s[2], 1060, 470], [s[3], 1240, 470], [s[4], 1460, 470], [c + 4, 1560, 210], [c + 22, 1450, 330], [clickAt, 1450, 335]];
  const fs = P.map((p) => p[0]);
  const cx = interpolate(f, fs, P.map((p) => p[1]), {...clamp, easing: EASE.smooth});
  const cy = interpolate(f, fs, P.map((p) => p[2]), {...clamp, easing: EASE.smooth});
  const push = ramp(f, 0, 60, EASE.smooth);
  const done = ramp(f, clickAt + 14, 16, EASE.overshoot);
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 2200}}>
        <div style={{transform: `scale(${mix(0.62, 0.68, push)}) rotateX(${mix(12, 4, push)}deg)`, transformOrigin: '50% 45%'}}>
          <NewHireForm local={f} s={s} menu={menu} click={click} />
        </div>
      </AbsoluteFill>
      <Cursor x={cx} y={cy} press={f >= clickAt && f < clickAt + 12 ? (f - clickAt) / 12 : 0} />
      {done > 0 && (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 150, display: 'flex', justifyContent: 'center'}}>
          <div style={{background: C.navy, color: 'white', fontSize: 40, fontWeight: 600, padding: '20px 40px', borderRadius: 16, borderLeft: `8px solid ${C.gold}`,
            transform: `translateY(${(1 - done) * 40}px)`, opacity: Math.min(1, done * 2)}}>✓ Update Workforce · Senior Accountant added</div>
        </div>
      )}
      {s.map((x, i) => <Sfx key={i} at={x} src="switch-tap" v={0.22} />)}
      <Sfx at={c + 10} src="pop" v={0.3} /><Sfx at={clickAt} src="switch-tap" v={0.5} /><Sfx at={clickAt + 14} src="sparkle" v={0.3} />
    </LightStage>
  );
};

// ======================= 8. CALC: monthly stacked bars from the start date =======================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEG: [string, number, string][] = [['Salary', 7917, '#3F7C9C'], ['Social Security', 491, '#4E7F93'], ['Medicare', 115, C.blueLight], ['401(k) match', 277, C.green], ['Bonus', 792, C.gold]];
const S08: React.FC = () => {
  const l = L('w08_calc');
  const f = useCurrentFrame();
  const a = at(l, 0, 20), b = at(l, 1);
  const segOn = (k: number) => ramp(f, b + k * 14, 14, EASE.out);
  const perMonth = SEG.reduce((s, x) => s + x[1], 0);
  const total = Math.round(10 * SEG.reduce((s, x, k) => s + x[1] * (k === 0 ? 1 : segOn(k)), 0) * ramp(f, a, 60, EASE.smooth));
  const H = 440 / perMonth;
  return (
    <Stage glow={[0.5, 0.25]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Senior Accountant · FY27</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, top: 180, fontSize: 64, fontWeight: 700}}>Planning does the math</div>
      <div style={{position: 'absolute', right: 170, top: 130, textAlign: 'right'}}>
        <div style={{fontSize: 28, color: C.blueLight}}>FY27 cost</div>
        <div style={{fontSize: 110, fontWeight: 700, letterSpacing: -4, fontVariantNumeric: 'tabular-nums', color: C.gold}}>${money(total)}</div>
      </div>
      <div style={{position: 'absolute', left: 170, right: 170, bottom: 230, display: 'flex', alignItems: 'flex-end', gap: 26, height: 620}}>
        {MONTHS.map((m, i) => {
          const live = i >= 2;
          const t = live ? ramp(f, a + (i - 2) * 5, 16, EASE.overshoot) : 0;
          return (
            <div key={m} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
              <div style={{width: '100%', display: 'flex', flexDirection: 'column-reverse', height: 540, justifyContent: 'flex-start'}}>
                {live && SEG.map(([n, v, col], k) => (
                  <div key={n} style={{height: v * H * t * (k === 0 ? 1 : segOn(k)), background: col, borderRadius: k === SEG.length - 1 ? '8px 8px 0 0' : 0}} />
                ))}
                {!live && <div style={{height: 6, background: 'rgba(175,200,216,0.25)', borderRadius: 3}} />}
              </div>
              <div style={{fontSize: 28, color: i === 2 ? C.gold : C.blueLight, marginTop: 16, fontWeight: i === 2 ? 700 : 500}}>{m}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 170 + ((1920 - 340) / 12) * 2 - 6, bottom: 290, height: 520, width: 4, background: C.gold, opacity: ramp(f, a - 10, 10), boxShadow: '0 0 14px #FCCA47'}} />
      <div style={{position: 'absolute', left: 170 + ((1920 - 340) / 12) * 2 - 6, top: 262, fontSize: 28, fontWeight: 700, color: C.navy, background: C.gold, padding: '6px 16px', borderRadius: 8,
        opacity: ramp(f, a - 10, 10), zIndex: 2}}>Start date · Mar 1</div>
      <div style={{position: 'absolute', left: 170, right: 170, bottom: 165, display: 'flex', gap: 40, justifyContent: 'center'}}>
        {SEG.map(([n, , col], k) => (
          <div key={n} style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, opacity: k === 0 ? ramp(f, a, 10) : segOn(k)}}>
            <div style={{width: 24, height: 24, borderRadius: 6, background: col}} />{n}
          </div>
        ))}
      </div>
      <Sfx at={a} src="sweep-short" v={0.3} />
      {SEG.slice(1).map((_, k) => <Sfx key={k} at={b + (k + 1) * 14} src="switch-tap" v={0.3} />)}
    </Stage>
  );
};

// ======================= 9. FINANCIALS: bezier pulses into the P&L =======================
const PNL: [string, number][] = [['Salaries & Wages', 15.86], ['Payroll Taxes', 1.21], ['Employee Benefits', 1.74], ['Bonus', 0.69]];
const S09: React.FC = () => {
  const l = L('w09_fin');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, 0);
  const flip = ramp(f, a - 10, 14, EASE.snappy);
  const DX = 1050, Y0 = 380;
  return (
    <Stage glow={[0.7, 0.4]}>
      <AbsoluteFill style={{paddingTop: 110, alignItems: 'center'}}><Eyebrow2>Update Financials</Eyebrow2></AbsoluteFill>
      <div style={{position: 'absolute', left: 140, top: 430, width: 480, height: 220, borderRadius: 26, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.3)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity: ramp(f, 0, 14)}}>
        <div style={{fontSize: 56, fontWeight: 700}}>Workforce</div>
        <div style={{fontSize: 28, color: C.blueLight, marginTop: 6}}>148 employees · 9 open roles</div>
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
              {f > a + 30 && <circle r={9} fill={C.gold} cx={mix(mix(620, 820, p), mix(860, DX, p), p)} cy={mix(mix(540, 540, p), mix(y, y, p), p)} style={{filter: 'drop-shadow(0 0 8px #FCCA47)'}} />}
            </g>
          );
        })}
      </svg>
      <div style={{position: 'absolute', left: DX, top: Y0 - 90, width: 760, borderRadius: 26, background: '#FBFAF7', color: C.ink, padding: '34px 42px', boxSizing: 'border-box',
        boxShadow: '0 40px 90px rgba(0,0,0,0.45)', transform: `perspective(1400px) rotateY(${(1 - flip) * -70}deg)`, opacity: Math.min(1, flip * 2), transformOrigin: '0 50%'}}>
        <div style={{fontSize: 26, fontWeight: 600, letterSpacing: 4, color: C.green, textTransform: 'uppercase'}}>Income statement · FY27 plan</div>
        {PNL.map(([n, v], i) => (
          <div key={n} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 120, borderBottom: '2px solid rgba(29,68,90,0.08)', fontSize: 40}}>
            <span style={{fontWeight: 600, color: C.navy}}>{n}</span>
            <span style={{fontVariantNumeric: 'tabular-nums', fontWeight: 700}}>${(v * ramp(f, a + 30 + i * 6, 40, EASE.smooth)).toFixed(2)}M</span>
          </div>
        ))}
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22}}>
          {DEPTS.map((dp, i) => (
            <span key={dp} style={{fontSize: 24, fontWeight: 600, color: C.green, background: C.greenLight, padding: '8px 16px', borderRadius: 8,
              transform: `scale(${ramp(f, b + 10 + i * 5, 12, EASE.overshoot)})`, display: 'inline-block'}}>{dp}</span>
          ))}
        </div>
      </div>
      <Source2>Demo data</Source2>
      <Sfx at={a - 10} src="swoosh-slow" v={0.3} /><Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={a + 30} src="data-scan" v={0.2} />
      {DEPTS.map((_, i) => <Sfx key={i} at={b + 10 + i * 5} src="pop" v={0.15} />)}
    </Stage>
  );
};

// ======================= 10. REVIEW: FY27 vs FY28 by department → total slam =======================
const COMP: [string, number, number][] = [['Finance', 2.1, 2.3], ['Sales', 4.6, 5.2], ['Engineering', 5.8, 6.4], ['Operations', 2.9, 3.0], ['Customer Success', 1.7, 1.9], ['People', 0.6, 0.7]];
const S10: React.FC = () => {
  const l = L('w10_review');
  const f = useCurrentFrame();
  const a = at(l, 0, 10), b = at(l, 1, -4);
  const shrink = ramp(f, b, 22, EASE.smooth);
  const total = COMP.reduce((s, c) => s + c[2], 0);
  return (
    <Stage glow={[0.4, 0.25]}>
      <div style={{position: 'absolute', left: 170, top: 120}}><Eyebrow2>Total compensation by department</Eyebrow2></div>
      <div style={{position: 'absolute', left: 170, right: 170, top: 260, bottom: 200, display: 'flex', alignItems: 'flex-end', gap: 50,
        transform: `scale(${mix(1, 0.62, shrink)}) translateY(${mix(0, 300, shrink)}px)`, transformOrigin: '50% 100%', opacity: mix(1, 0.45, shrink)}}>
        {COMP.map(([n, v1, v2], i) => {
          const t = ramp(f, a + i * 4, 18, EASE.overshoot);
          return (
            <div key={n} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
              <div style={{display: 'flex', alignItems: 'flex-end', gap: 12, height: 520}}>
                <div style={{width: 70, height: (v1 / 6.4) * 480 * t, background: 'rgba(175,200,216,0.45)', borderRadius: '8px 8px 0 0'}} />
                <div style={{width: 70, height: (v2 / 6.4) * 480 * t, background: i === 2 ? C.gold : C.green, borderRadius: '8px 8px 0 0'}} />
              </div>
              <div style={{fontSize: 28, color: C.blueLight, marginTop: 16, textAlign: 'center'}}>{n}</div>
              <div style={{fontSize: 32, fontWeight: 700, opacity: t}}>${v2.toFixed(1)}M</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', right: 170, top: 120, display: 'flex', gap: 30, fontSize: 28, color: C.blueLight}}>
        <span><span style={{display: 'inline-block', width: 22, height: 22, borderRadius: 5, background: 'rgba(175,200,216,0.45)', marginRight: 10, verticalAlign: -3}} />FY27</span>
        <span><span style={{display: 'inline-block', width: 22, height: 22, borderRadius: 5, background: C.green, marginRight: 10, verticalAlign: -3}} />FY28</span>
      </div>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', paddingBottom: 200}}>
        <Slam from={b + 14} shake={14}><Big color={C.gold}>${total.toFixed(1)}M</Big></Slam>
        <div style={{fontSize: 40, fontWeight: 500, color: 'white', opacity: ramp(f, b + 24, 12)}}>FY28 total compensation · one number for the board</div>
        <div style={{marginTop: 4, marginLeft: 380}}><Marker from={b + 34} width={420} /></div>
      </AbsoluteFill>
      <Source2>Demo data</Source2>
      <Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={b + 14} src="impact-cine-big" v={0.4} /><Sfx at={b + 34} src="marker-pen-line" v={0.3} />
      <Flash at={b + 14} peak={0.22} color="#FCCA47" />
    </Stage>
  );
};

// ======================= 11. CTA: ring → icon → wordmark lockup =======================
const S11: React.FC = () => {
  const l = L('w11_cta');
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
          Write to BPC to plan your workforce in NetSuite Planning.
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
  w01_hook: S01, w02_pain: S02, w03_promise: S03, w04_value: S04, w05_config: S05, w06_roster: S06,
  w07_newhire: S07, w08_calc: S08, w09_fin: S09, w10_review: S10, w11_cta: S11,
};

export const WorkforceVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/tonight-hiphop.mp3')} volume={(fr) => 0.075 * interpolate(fr, [0, 20, TOTAL_WF - 75, TOTAL_WF], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 'w11_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/wf/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.12} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
