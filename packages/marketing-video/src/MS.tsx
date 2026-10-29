// Managed Services intro (~60 s). Same kit as V2 (fx.tsx + V2 exports), calmer pace,
// synthesized ambient bed (vo/ms_music.py) instead of the hip-hop track. No prices.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing-ms.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {Drop, EASE, Flash, LightStage, Marker, Plane, Stage, cruise, easeFall, mix, ramp} from './fx';
import {BlurWords, Eyebrow2, Sfx} from './V2';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL_MS = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['m03_promise', 'm08_cta']);

/** Soft rise + unblur for a block. */
const Rise: React.FC<{from: number; children: React.ReactNode; y?: number; style?: React.CSSProperties}> = ({from, children, y = 30, style}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, 18, EASE.out);
  return <div style={{...style, opacity: t, transform: `translateY(${(1 - t) * y}px)`, filter: `blur(${(1 - t) * 8}px)`}}>{children}</div>;
};

// ======================= 1. HOOK =======================
const M01: React.FC = () => {
  const l = L('m01_hook');
  const f = useCurrentFrame();
  return (
    <Stage glow={[0.5, 0.3]}>
      {/* faint drifting planning grid */}
      <AbsoluteFill style={{opacity: 0.08, transform: `translateX(${-f * 0.6}px)`}}>
        {Array.from({length: 12}).map((_, r) => (
          <div key={r} style={{position: 'absolute', top: 60 + r * 84, left: -200, display: 'flex', gap: 60, fontSize: 30, fontWeight: 500, whiteSpace: 'nowrap'}}>
            {Array.from({length: 22}).map((__, c) => <span key={c}>{((r * 37 + c * 91) % 900 + 100).toLocaleString('en-US')},{(r * 13 + c * 7) % 10}00</span>)}
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 26}}>
        <Rise from={at(l, 0, 2)}><div style={{fontSize: 34, fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase', color: C.blueLight}}>NetSuite Planning</div></Rise>
        <BlurWords from={at(l, 0, 6)} size={112} weight={600} parts={['It', 'runs', 'your', 'budget.']} color="white" />
        <BlurWords from={at(l, 1, 4)} size={112} weight={700} parts={['Who', 'runs', 'it?']} hot={0} color="white" />
        <div style={{marginTop: -40, marginLeft: -330}}><Marker from={at(l, 1, 22)} width={250} /></div>
      </AbsoluteFill>
      <Sfx at={at(l, 1, 4)} src="swoosh-slow" v={0.18} />
      <Sfx at={at(l, 1, 22)} src="marker-pen-line" v={0.25} />
    </Stage>
  );
};

// ======================= 2. PAIN: the queue =======================
const TICKETS = [
  {id: '#4821', t: 'Business rule failed: CConv_Plan', w: '2d 14h'},
  {id: '#4822', t: 'Forecast form locked for entry', w: '1d 22h'},
  {id: '#4823', t: 'Actuals load rejected 312 rows', w: '19h'},
];
const M02: React.FC = () => {
  const l = L('m02_pain');
  const f = useCurrentFrame();
  const s1 = at(l, 1, 4);
  return (
    <Stage glow={[0.75, 0.25]}>
      <div style={{position: 'absolute', left: 150, top: 180, width: 700}}>
        <Eyebrow2 from={at(l, 0)}>Close week</Eyebrow2>
        <div style={{marginTop: 22}}><BlurWords from={at(l, 0, 4)} size={72} weight={600} parts={['The', 'admin', 'who']} color="white" /></div>
        <div style={{marginTop: 4}}><BlurWords from={at(l, 0, 14)} size={72} weight={600} parts={['built', 'it', 'moved', 'on.']} color="white" /></div>
        {/* empty seat */}
        <Rise from={at(l, 0, 24)} style={{marginTop: 46, display: 'flex', alignItems: 'center', gap: 22}}>
          <div style={{width: 92, height: 92, borderRadius: 46, border: '4px dashed rgba(175,200,216,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'rgba(175,200,216,0.6)'}}>?</div>
          <div style={{fontSize: 34, color: C.blueLight}}>Planning admin · <span style={{color: '#E0703A'}}>vacant</span></div>
        </Rise>
      </div>
      <div style={{position: 'absolute', right: 120, top: 250, width: 800}}>
        {TICKETS.map((k, i) => {
          const from = s1 + i * 14;
          return (
            <div key={k.id} style={{marginBottom: 28}}>
              <Drop from={from} h={160}>
                <div style={{background: 'linear-gradient(160deg,#FFFFFF,#EEF1F2)', borderRadius: 20, padding: '26px 32px', color: C.ink, borderLeft: '10px solid #E0703A',
                  boxShadow: '0 30px 70px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 26}}>
                  <div style={{fontSize: 26, fontWeight: 700, color: C.muted}}>{k.id}</div>
                  <div style={{fontSize: 34, fontWeight: 600, flex: 1, color: C.navy}}>{k.t}</div>
                  <div style={{fontSize: 24, fontWeight: 700, color: '#B5531F', background: '#FCE7DA', padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap'}}>Waiting {k.w}</div>
                </div>
              </Drop>
            </div>
          );
        })}
        <Rise from={s1 + 50} style={{fontSize: 30, color: C.blueLight, marginTop: 10}}>Ticket queue · assigned to: <span style={{color: 'white', fontWeight: 600}}>next available agent</span></Rise>
      </div>
      {TICKETS.map((_, i) => <Sfx key={i} at={s1 + i * 14 + 11} src="hit-weak" v={0.22} />)}
      <Sfx at={s1 + 50} src="clock-tick-single" v={0.3} />
    </Stage>
  );
};

// ======================= 3. PROMISE =======================
const M03: React.FC = () => {
  const l = L('m03_promise');
  return (
    <LightStage>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
        <Rise from={at(l, 0)}><div style={{fontSize: 30, fontWeight: 700, letterSpacing: 7, textTransform: 'uppercase', color: C.green}}>BPC Managed Services</div></Rise>
        <div style={{marginTop: 30}}><BlurWords from={at(l, 0, 30)} size={104} weight={600} parts={['A', 'team', 'that', 'already', 'knows', 'your', 'build.']} hot={4} color={C.navy} hotColor={C.green} /></div>
        <div style={{marginTop: -30, marginLeft: 420}}><Marker from={at(l, 0, 70)} width={560} /></div>
      </AbsoluteFill>
      <Sfx at={at(l, 0, 70)} src="marker-pen-line" v={0.25} />
    </LightStage>
  );
};

// ======================= 4. WHAT: three pillars, card flock =======================
const PILLARS = [
  {n: '01', t: 'Administration', p: 'Users, security, metadata, jobs and the day-to-day of your application.'},
  {n: '02', t: 'Monthly-close support', p: 'Loads, rules and reports checked and fixed while the close is running.'},
  {n: '03', t: 'Enhancements', p: 'New forms, rules, reports and modules as the way you plan changes.'},
];
const M04: React.FC = () => {
  const l = L('m04_what');
  const f = useCurrentFrame();
  return (
    <Stage glow={[0.5, 0.15]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 120}}>
        <Eyebrow2 from={at(l, 0)}>What you get</Eyebrow2>
      </AbsoluteFill>
      <AbsoluteFill style={{perspective: 1700}}>
        {PILLARS.map((r, i) => {
          const from = at(l, 0, 6 + i * 22);
          const t = ramp(f, from, 26, EASE.snappy);
          const sway = Math.sin((f - from) / 45) * 2.5 * t;
          const left = 200 + i * 525;
          return (
            <div key={r.n} style={{position: 'absolute', left, top: 250, width: 490, height: 420, opacity: f < from ? 0 : 1,
              transform: `translate3d(${mix(1400, 0, t)}px, 0, ${mix(-500, 0, t)}px) rotateY(${mix(85, -10, t) + sway}deg)`,
              background: 'linear-gradient(160deg, #FFFFFF, #F1EEE6)', borderRadius: 26, padding: 42, boxSizing: 'border-box', color: C.ink,
              boxShadow: '0 40px 90px rgba(0,0,0,0.45)', borderLeft: `10px solid ${i === 0 ? C.gold : C.green}`}}>
              <div style={{fontSize: 40, fontWeight: 500, color: C.green}}>{r.n}</div>
              <div style={{fontSize: 48, fontWeight: 700, color: C.navy, marginTop: 22, lineHeight: 1.1}}>{r.t}</div>
              <div style={{fontSize: 30, color: C.muted, marginTop: 20, lineHeight: 1.35}}>{r.p}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 190}}>
        <Rise from={at(l, 1, 2)}><div style={{fontSize: 52, fontWeight: 600}}>From the consultants who <span style={{color: C.gold}}>implemented it.</span></div></Rise>
      </AbsoluteFill>
      {PILLARS.map((_, i) => <Sfx key={i} at={at(l, 0, 6 + i * 22)} src="whoosh-fast" v={0.18} />)}
    </Stage>
  );
};

// ======================= 5. CHANNEL: Slack thread + named roles =======================
const Msg: React.FC<{from: number; who: string; role: string; badge: string; bg: string; children: React.ReactNode}> = ({from, who, role, badge, bg, children}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, 16, EASE.out);
  return (
    <div style={{display: 'flex', gap: 22, marginBottom: 34, opacity: t, transform: `translateY(${(1 - t) * 26}px)`}}>
      <div style={{width: 72, height: 72, borderRadius: 14, background: bg, color: bg === C.gold ? C.navy : 'white', fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>{badge}</div>
      <div>
        <div style={{fontSize: 28, fontWeight: 700, color: C.ink}}>{who} <span style={{fontSize: 22, fontWeight: 500, color: C.muted, marginLeft: 8}}>{role}</span></div>
        <div style={{fontSize: 32, color: C.ink, marginTop: 6, lineHeight: 1.35}}>{children}</div>
      </div>
    </div>
  );
};
const ROLES = [['GSA', 'Your account lead'], ['LC', 'Lead consultant'], ['C', 'Consultant'], ['PD', 'Practice director']];
const M05: React.FC = () => {
  const l = L('m05_channel');
  const f = useCurrentFrame();
  const s0 = at(l, 0), s1 = at(l, 1);
  const win = ramp(f, s0, 20, EASE.snappy);
  return (
    <Stage glow={[0.3, 0.3]}>
      <div style={{position: 'absolute', left: 120, top: 190, width: 1000, height: 600, borderRadius: 24, background: '#FFFFFF', overflow: 'hidden',
        boxShadow: '0 50px 110px rgba(0,0,0,0.5)', transform: `perspective(1600px) rotateY(${mix(-24, -6, win)}deg) scale(${mix(0.9, 1, win)})`, opacity: win, transformOrigin: '0% 50%'}}>
        <div style={{height: 86, background: '#3F0E40', display: 'flex', alignItems: 'center', padding: '0 34px', color: 'white', fontSize: 34, fontWeight: 700}}># ext-yourcompany</div>
        <div style={{padding: '40px 40px'}}>
          <Msg from={s0 + 14} who="Dana" role="Finance" badge="DK" bg="#5B6B74">FX rates changed for Q3 — can someone update the rate table before Thursday's consolidation?</Msg>
          <Rise from={s0 + 34} style={{marginLeft: 94, marginTop: -18, marginBottom: 30}}>
            <span style={{fontSize: 22, fontWeight: 700, color: '#B5531F', background: '#FCE7DA', padding: '6px 12px', borderRadius: 8}}>Severity · High</span>
            <span style={{fontSize: 22, fontWeight: 700, color: C.green, background: C.greenLight, padding: '6px 12px', borderRadius: 8, marginLeft: 10}}>Picked up · 12 min</span>
          </Rise>
          <Msg from={s1 - 4} who="BPC" role="Lead consultant" badge="BPC" bg={C.gold}>On it. Rates updated and consolidation re-run ✓ — numbers are in the report.</Msg>
        </div>
      </div>
      <div style={{position: 'absolute', right: 110, top: 230, width: 500}}>
        <Eyebrow2 from={s1}>Your named team</Eyebrow2>
        {ROLES.map(([b, r], i) => (
          <Rise key={b} from={s1 + 10 + i * 9} style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 30}}>
            <div style={{width: 80, height: 80, borderRadius: 40, background: i === 0 ? C.gold : 'rgba(175,200,216,0.18)', border: i === 0 ? 'none' : '2px solid rgba(175,200,216,0.4)',
              color: i === 0 ? C.navy : 'white', fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{b}</div>
            <div style={{fontSize: 36, fontWeight: 600}}>{r}</div>
          </Rise>
        ))}
      </div>
      <Sfx at={s0 + 14} src="pop" v={0.3} /><Sfx at={s1 - 4} src="pop" v={0.3} />
    </Stage>
  );
};

// ======================= 6. HOURS: monthly blocks, roll-over, weekly post =======================
const MONTHS = [{m: 'Aug', used: 7}, {m: 'Sep', used: 9}, {m: 'Oct', used: 6}];
const M06: React.FC = () => {
  const l = L('m06_hours');
  const f = useCurrentFrame();
  const s0 = at(l, 0), s1 = at(l, 1);
  const CELL = 34, GAP = 6, BLOCK = 10;
  return (
    <Stage glow={[0.4, 0.2]}>
      <div style={{position: 'absolute', left: 150, top: 140}}>
        <Eyebrow2 from={s0}>Hours</Eyebrow2>
        <div style={{marginTop: 18}}><BlurWords from={s0 + 4} size={64} weight={600} parts={['A', 'monthly', 'block,', 'reserved', 'for', 'you.']} hot={1} color="white" /></div>
      </div>
      <div style={{position: 'absolute', left: 190, bottom: 170, display: 'flex', gap: 120, alignItems: 'flex-end'}}>
        {MONTHS.map((mo, mi) => {
          const colFrom = s0 + 16 + mi * 12;
          const carry = mi > 0 ? BLOCK - MONTHS[mi - 1].used : 0;
          return (
            <div key={mo.m} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
              <div style={{display: 'flex', flexDirection: 'column-reverse', gap: GAP}}>
                {Array.from({length: BLOCK + carry}).map((_, ci) => {
                  const isCarry = ci >= BLOCK;
                  const cFrom = isCarry ? s1 + 6 + mi * 12 : colFrom + ci * 1.5;
                  const t = ramp(f, cFrom, 12, isCarry ? EASE.overshoot : easeFall);
                  const used = !isCarry && ci < mo.used && f > s0 + 40 + mi * 10 + ci * 2;
                  return (
                    <div key={ci} style={{width: 150, height: CELL, borderRadius: 8, opacity: t,
                      transform: isCarry ? `translateX(${(1 - t) * -270}px) scale(${mix(0.6, 1, t)})` : `translateY(${(1 - t) * -60}px)`,
                      background: isCarry ? C.gold : used ? C.green : 'rgba(175,200,216,0.16)', border: used || isCarry ? 'none' : '2px solid rgba(175,200,216,0.35)', boxSizing: 'border-box'}} />
                  );
                })}
              </div>
              <div style={{fontSize: 34, fontWeight: 600, marginTop: 18, color: C.blueLight}}>{mo.m}</div>
            </div>
          );
        })}
        <Rise from={s1 + 4} style={{marginBottom: 70, marginLeft: -40}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: C.gold, fontWeight: 600}}><div style={{width: 30, height: 30, borderRadius: 6, background: C.gold}} /> Unused hours roll over</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, color: '#9BD4C3', fontWeight: 600, marginTop: 14}}><div style={{width: 30, height: 30, borderRadius: 6, background: C.green}} /> Used</div>
        </Rise>
      </div>
      {/* weekly post */}
      <div style={{position: 'absolute', right: 120, top: 330, width: 560}}>
        <Drop from={s1 + 40} h={180}>
          <div style={{background: '#FFFFFF', borderRadius: 22, padding: '30px 34px', color: C.ink, borderLeft: `10px solid ${C.gold}`, boxShadow: '0 40px 90px rgba(0,0,0,0.45)'}}>
            <div style={{fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: C.green}}>Weekly hours update</div>
            <div style={{fontSize: 30, color: C.muted, marginTop: 8}}># ext-yourcompany · Monday</div>
            <div style={{height: 22, borderRadius: 11, background: C.greenLight, marginTop: 26, overflow: 'hidden'}}>
              <div style={{height: '100%', width: `${ramp(f, s1 + 56, 30, EASE.out) * 64}%`, background: C.green, borderRadius: 11}} />
            </div>
            <div style={{fontSize: 40, fontWeight: 700, color: C.navy, marginTop: 20}}>Balance posted. <span style={{color: C.green}}>Nobody asks.</span></div>
          </div>
        </Drop>
      </div>
      <Sfx at={s1 + 6} src="sweep-short" v={0.2} /><Sfx at={s1 + 52} src="hit-weak" v={0.22} />
    </Stage>
  );
};

// ======================= 7. HUB: steep-tilt glide over a hub mock =======================
const HUB_CAM = {rx: 30, ry: -14, rz: 4, scale: 0.92, x: [260, -180], y: [120, -60]} as const;
const M07: React.FC = () => {
  const l = L('m07_hub');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const p = cruise(f / d);
  const s0 = at(l, 0);
  const side = ['Knowledge Hub', 'Managed Services', 'Assessments', 'Explore Oracle'];
  return (
    <Stage glow={[0.6, 0.2]}>
      <Plane cam={{...HUB_CAM, x: [...HUB_CAM.x], y: [...HUB_CAM.y]}} p={p} persp={1500}>
        <div style={{width: 1700, height: 980, borderRadius: 28, background: '#F7F8F8', overflow: 'hidden', display: 'flex', boxShadow: '0 80px 160px rgba(0,0,0,0.55)'}}>
          <div style={{width: 380, background: '#163647', padding: '44px 30px', color: 'white'}}>
            <div style={{fontSize: 30, fontWeight: 700}}>Customer <span style={{color: C.gold}}>Hub</span></div>
            {side.map((s, i) => (
              <div key={s} style={{marginTop: i === 0 ? 50 : 16, padding: '16px 18px', borderRadius: 12, fontSize: 28, fontWeight: 600,
                background: i === 0 ? 'white' : 'transparent', color: i === 0 ? C.navy : 'rgba(255,255,255,0.8)'}}>{s}</div>
            ))}
          </div>
          <div style={{flex: 1, padding: '54px 60px', color: C.ink}}>
            <div style={{fontSize: 24, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: C.green}}>Your environment</div>
            <div style={{fontSize: 56, fontWeight: 700, color: C.navy, marginTop: 12}}>Lock a scenario</div>
            {[0.92, 0.8, 0.86, 0.6, 0.9, 0.72].map((w, i) => (
              <div key={i} style={{height: 22, borderRadius: 11, background: '#E3E8EA', width: `${w * 100}%`, marginTop: i === 0 ? 40 : 22}} />
            ))}
            <div style={{marginTop: 40, display: 'flex', gap: 18}}>
              {['Dimensions', 'Scenario', 'Start / End period'].map((c) => (
                <div key={c} style={{fontSize: 26, fontWeight: 600, padding: '12px 20px', borderRadius: 12, background: C.greenLight, color: C.green}}>{c}</div>
              ))}
            </div>
          </div>
        </div>
      </Plane>
      {/* AI answer, screen-space so it stays crisp */}
      <div style={{position: 'absolute', right: 110, top: 170, width: 640}}>
        <Rise from={s0 + 30} style={{marginLeft: 120, background: C.gold, color: C.navy, borderRadius: '24px 24px 6px 24px', padding: '22px 28px', fontSize: 32, fontWeight: 600}}>
          How do I lock a scenario?
        </Rise>
        <Rise from={s0 + 70} style={{marginTop: 22, background: '#FFFFFF', color: C.ink, borderRadius: '24px 24px 24px 6px', padding: '26px 30px', fontSize: 30, lineHeight: 1.4, boxShadow: '0 30px 70px rgba(0,0,0,0.45)'}}>
          Open <b>Dimensions → Scenario</b> and set the start and end period.
          <div style={{fontSize: 24, color: C.green, fontWeight: 700, marginTop: 12}}>Source · Lock a scenario ↗</div>
        </Rise>
      </div>
      <Sfx at={s0 + 30} src="pop" v={0.25} /><Sfx at={s0 + 70} src="shimmer-sparkle-sweep" v={0.18} />
    </Stage>
  );
};

// ======================= 8. CTA =======================
const M08: React.FC = () => {
  const l = L('m08_cta');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const ring = ramp(f, 4, 18, EASE.snappy);
  const icon = ramp(f, 20, 10, EASE.overshoot);
  const word = ramp(f, 30, 22, EASE.snappy);
  const LW = 900, LH = (776 / 2400) * LW;
  const iconCx = ((93 + 483) / 2 / 2400) * LW;
  const shift = mix(LW / 2 - iconCx, 0, word);
  const t1 = ramp(f, at(l, 0, 4), 18, EASE.out), t2 = ramp(f, at(l, 1, 4), 18, EASE.out);
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
        <div style={{marginTop: 70, fontSize: 60, fontWeight: 700, color: C.navy, opacity: t1, transform: `translateY(${(1 - t1) * 24}px)`, letterSpacing: -1}}>
          Write to BPC.
        </div>
        <div style={{marginTop: 18, fontSize: 44, fontWeight: 500, color: C.green, opacity: t2, transform: `translateY(${(1 - t2) * 20}px)`}}>
          Keep your platform running.
        </div>
        <div style={{marginTop: 46, fontSize: 36, fontWeight: 600, color: C.navy, opacity: t2, letterSpacing: 1}}>bryantparkconsulting.com</div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: C.navy, opacity: interpolate(f, [d - 14, d], [0, 1], clamp)}} />
      <Sfx at={4} src="riser-cine" v={0.18} /><Sfx at={32} src="sparkle" v={0.22} />
    </LightStage>
  );
};

const COMPONENTS: Record<string, React.FC> = {
  m01_hook: M01, m02_pain: M02, m03_promise: M03, m04_what: M04,
  m05_channel: M05, m06_hours: M06, m07_hub: M07, m08_cta: M08,
};

export const ManagedServicesVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/ms-ambient.wav')} volume={(fr) => 0.22 * interpolate(fr, [0, 30, TOTAL_MS - 90, TOTAL_MS], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 'm08_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/ms/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.08} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
