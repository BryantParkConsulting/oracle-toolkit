import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing.json';
import {
  at, Bg, C, Captions, Count, CornerLogo, DocCam, Eyebrow, FONT, FontFaces, Insight, Line, MaskLine, Punch, Underline,
  useIn, Words, clamp, ease,
} from './lib';

const FPS = 30;
const NS = {w: 2975, h: 4210};
const PB = {w: 3060, h: 3960};
type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
export const sceneFrames = (s: Scene) => Math.ceil(s.duration * FPS);
export const TOTAL = SCENES.reduce((a, s) => a + sceneFrames(s), 0);
const L = (key: string) => SCENES.find((s) => s.key === key)!.lines;
const DARK = new Set(['s01_hook', 's04_promise', 's09_get']);

/** Sub-shot with a short cross-fade in. */
const Shot: React.FC<{from: number; to: number; children: React.ReactNode}> = ({from, to, children}) => (
  <Sequence from={from} durationInFrames={Math.max(1, to - from)} layout="none">
    <FadeIn>{children}</FadeIn>
  </Sequence>
);
const FadeIn: React.FC<{children: React.ReactNode}> = ({children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(f, [0, 10], [0, 1], clamp)}}>{children}</AbsoluteFill>;
};

// ---------- 1. Hook ----------
const S01: React.FC = () => {
  const l = L('s01_hook');
  return (
    <Bg dark>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 30}}>
        <Punch from={at(l, 0)} style={{fontSize: 130, fontWeight: 600, letterSpacing: -3}}>You pay for it.</Punch>
        <Punch from={at(l, 1, 8)} style={{fontSize: 130, fontWeight: 600, letterSpacing: -3}}>
          Do you <span style={{color: C.gold}}>use</span> it?
        </Punch>
      </AbsoluteFill>
    </Bg>
  );
};

// ---------- 2. NSPB numbers ----------
const Stat: React.FC<{from: number; big: React.ReactNode; of?: string; label: string}> = ({from, big, of, label}) => {
  const p = useIn(from, 18);
  return (
    <div style={{width: 470, opacity: p, transform: `translateY(${(1 - p) * 40}px)`}}>
      <div style={{fontSize: 168, fontWeight: 600, color: C.navy, letterSpacing: -6, lineHeight: 1}}>
        {big}
        {of && <span style={{fontSize: 84, color: C.muted, fontWeight: 400, letterSpacing: -2}}> / {of}</span>}
      </div>
      <Underline from={from + 10} width={140} />
      <div style={{fontSize: 38, fontWeight: 500, color: C.ink, marginTop: 22, lineHeight: 1.25}}>{label}</div>
    </div>
  );
};
const Source: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{position: 'absolute', left: 120, bottom: 150, fontSize: 22, color: C.muted, fontWeight: 400}}>{children}</div>
);
const S02: React.FC = () => {
  const l = L('s02_nspb');
  return (
    <Bg>
      <div style={{position: 'absolute', left: 120, top: 170}}>
        <Eyebrow>NetSuite Planning · one real review</Eyebrow>
        <div style={{display: 'flex', gap: 90, marginTop: 70}}>
          <Stat from={at(l, 0, 30)} big={<Count to={4} from={at(l, 0, 30)} dur={14} />} label="real users in the last 180 days" />
          <Stat from={at(l, 1)} big={<Count to={17} from={at(l, 1)} />} of="155" label="business rules actually ran" />
          <Stat from={at(l, 2, 12)} big={<Count to={0} from={at(l, 2)} />} of="172" label="forms used to enter data" />
        </div>
      </div>
      <Source>From a BPC NSPB Current State Assessment · client identity removed</Source>
    </Bg>
  );
};

// ---------- 3. NetSuite numbers ----------
const ModuleBar: React.FC<{from: number}> = ({from}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', gap: 6, marginTop: 34}}>
      {Array.from({length: 37}).map((_, i) => {
        const on = i < 21 && f > from + i * 1.6;
        const p = interpolate(f, [from + i * 1.2, from + i * 1.2 + 8], [0, 1], clamp);
        return <div key={i} style={{width: 20, height: 64, borderRadius: 4, background: on ? C.green : '#D8D4CC', opacity: 0.3 + 0.7 * p}} />;
      })}
    </div>
  );
};
const S03: React.FC = () => {
  const l = L('s03_ns');
  return (
    <Bg>
      <div style={{position: 'absolute', left: 120, top: 170}}>
        <Eyebrow>NetSuite ERP · one real account</Eyebrow>
        <div style={{display: 'flex', gap: 140, marginTop: 70, alignItems: 'flex-start'}}>
          <div>
            <Stat from={at(l, 0, 20)} big={<Count to={21} from={at(l, 0, 20)} />} of="37" label="modules actually in use" />
            <ModuleBar from={at(l, 0, 30)} />
          </div>
          <Stat from={at(l, 1)} big={<Count to={93} from={at(l, 1)} />} label="GL accounts that never had a single entry" />
        </div>
      </div>
      <Source>From a BPC NetSuite Account Analysis · client identity removed</Source>
    </Bg>
  );
};

// ---------- 4. Promise ----------
const Chip: React.FC<{from: number; children: React.ReactNode}> = ({from, children}) => {
  const p = useIn(from, 14);
  return (
    <div style={{padding: '16px 30px', borderRadius: 999, border: `2px solid ${C.blueLight}`, fontSize: 36, fontWeight: 500, opacity: p, transform: `scale(${0.9 + 0.1 * p})`}}>
      {children}
    </div>
  );
};
const S04: React.FC = () => {
  const l = L('s04_promise');
  return (
    <Bg dark>
      <div style={{position: 'absolute', left: 150, top: 230}}>
        <MaskLine from={at(l, 0)} style={{fontSize: 104, fontWeight: 600, letterSpacing: -3}}>We read your system.</MaskLine>
        <MaskLine from={at(l, 0, 40)} style={{fontSize: 104, fontWeight: 600, letterSpacing: -3, color: C.gold}}>Not opinions.</MaskLine>
        <div style={{display: 'flex', gap: 22, marginTop: 60}}>
          <Chip from={at(l, 1, 20)}>NetSuite</Chip>
          <Chip from={at(l, 1, 36)}>NetSuite Planning</Chip>
        </div>
        <div style={{marginTop: 56}}>
          <Words text="Where you stand. *What* *to* *fix* *first.*" from={at(l, 1, 80)} size={52} weight={500} />
        </div>
      </div>
    </Bg>
  );
};

// ---------- 5. How it works ----------
const SourceCard: React.FC<{from: number; title: string; sub: string; tag: string}> = ({from, title, sub, tag}) => {
  const p = useIn(from, 18);
  return (
    <div
      style={{
        width: 640, padding: '30px 36px', background: 'white', borderRadius: 20, boxShadow: '0 18px 50px rgba(20,40,50,0.12)',
        opacity: p, transform: `translateX(${(1 - p) * -50}px)`, display: 'flex', gap: 26, alignItems: 'center',
      }}
    >
      <div style={{width: 84, height: 84, borderRadius: 18, background: C.navy, color: C.gold, fontSize: 30, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {tag}
      </div>
      <div>
        <div style={{fontSize: 38, fontWeight: 600, color: C.navy}}>{title}</div>
        <div style={{fontSize: 28, fontWeight: 400, color: C.muted, marginTop: 6}}>{sub}</div>
      </div>
    </div>
  );
};
const Arrow: React.FC<{from: number; y: number}> = ({from, y}) => {
  const p = useIn(from, 20);
  return (
    <svg style={{position: 'absolute', left: 800, top: y, overflow: 'visible'}} width={300} height={20}>
      <line x1={0} y1={10} x2={260 * p} y2={10} stroke={C.gold} strokeWidth={6} strokeLinecap="round" />
      {p > 0.95 && <polygon points="262,0 290,10 262,20" fill={C.gold} />}
    </svg>
  );
};
const S05: React.FC = () => {
  const l = L('s05_how');
  const r = useIn(at(l, 2), 22);
  return (
    <Bg>
      <div style={{position: 'absolute', left: 120, top: 150}}>
        <Eyebrow>How it works</Eyebrow>
      </div>
      <div style={{position: 'absolute', left: 120, top: 300, display: 'flex', flexDirection: 'column', gap: 60}}>
        <SourceCard from={at(l, 0)} tag="NS" title="NetSuite" sub="Read-only connection · SuiteQL" />
        <SourceCard from={at(l, 1)} tag="PB" title="NetSuite Planning" sub="App snapshot · 180-day audit" />
      </div>
      <Arrow from={at(l, 2, -10)} y={372} />
      <Arrow from={at(l, 2, -4)} y={596} />
      <div style={{position: 'absolute', left: 1180, top: 250, opacity: r, transform: `translateY(${(1 - r) * 40}px)`}}>
        <Img src={staticFile('pages/pb-01.png')} style={{position: 'absolute', left: 150, top: 30, width: 380, transform: 'rotate(6deg)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)'}} />
        <Img src={staticFile('pages/ns-01.png')} style={{position: 'absolute', left: 0, top: 0, width: 380, transform: 'rotate(-4deg)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)'}} />
        <div style={{position: 'absolute', top: 590, left: 40, fontSize: 34, fontWeight: 600, color: C.navy, width: 520}}>A report finance can act on</div>
      </div>
    </Bg>
  );
};

// ---------- 6. NetSuite report tour ----------
const S06: React.FC = () => {
  const l = L('s06_ns_doc');
  const {durationInFrames: d} = useVideoConfig();
  const a = at(l, 0), b = at(l, 1, -6), c = at(l, 2, -6), e = at(l, 3, -6);
  return (
    <Bg>
      <Shot from={0} to={b + 10}>
        <DocCam src="pages/ns-03-hi.png" pageW={NS.w} pageH={NS.h}
          keys={[{f: 0, cx: 0.5, cy: 0.3, w: 1.05}, {f: a + 20, cx: 0.5, cy: 0.19, w: 0.95}, {f: b, cx: 0.48, cy: 0.19, w: 0.8}]} />
      </Shot>
      <Shot from={b} to={e + 10}>
        <DocCam src="pages/ns-05-hi.png" pageW={NS.w} pageH={NS.h}
          keys={[{f: 0, cx: 0.5, cy: 0.2, w: 1.0}, {f: 30, cx: 0.5, cy: 0.17, w: 0.92}, {f: c - b, cx: 0.5, cy: 0.3, w: 0.92}, {f: c - b + 30, cx: 0.5, cy: 0.33, w: 0.9}]}
          highlights={[{box: [0.062, 0.09, 0.939, 0.126], from: 24, to: c - b - 6}, {box: [0.065, 0.294, 0.94, 0.314], from: c - b + 20}]} />
        <Sequence from={c - b + 26} layout="none">
          <Insight from={0} eyebrow="Found in the data" title={<>15,749 budget rows built <span style={{color: C.gold}}>outside</span> and loaded in</>} y={700} />
        </Sequence>
      </Shot>
      <Shot from={e} to={d}>
        <DocCam src="pages/ns-07-hi.png" pageW={NS.w} pageH={NS.h}
          keys={[{f: 0, cx: 0.5, cy: 0.16, w: 1.0}, {f: 40, cx: 0.5, cy: 0.15, w: 0.92}]}
          highlights={[{box: [0.09, 0.083, 0.95, 0.172], from: 16}]} />
        <Insight from={26} eyebrow="Already connected" title={<>Concur · Celigo · Ramp · FloQast</>} y={740} />
      </Shot>
    </Bg>
  );
};

// ---------- 7. NSPB report tour ----------
const S07: React.FC = () => {
  const l = L('s07_nspb_doc');
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -4), c = at(l, 2, -6);
  return (
    <Bg>
      <Shot from={0} to={c + 10}>
        <DocCam src="pages/pb-03-hi.png" pageW={PB.w} pageH={PB.h}
          keys={[{f: 0, cx: 0.5, cy: 0.3, w: 1.05}, {f: 30, cx: 0.5, cy: 0.265, w: 0.98}, {f: b, cx: 0.5, cy: 0.265, w: 0.98}, {f: b + 30, cx: 0.42, cy: 0.27, w: 0.62}]}
          highlights={[{box: [0.322, 0.252, 0.474, 0.292], from: b + 26}]} />
        <Sequence from={b + 34} layout="none">
          <Insight from={0} eyebrow="Workforce" title={<>Built, but <span style={{color: C.gold}}>dormant</span> for 108 days</>} y={760} right />
        </Sequence>
      </Shot>
      <Shot from={c} to={d}>
        <DocCam src="pages/pb-11-hi.png" pageW={PB.w} pageH={PB.h}
          keys={[{f: 0, cx: 0.5, cy: 0.16, w: 1.0}, {f: 34, cx: 0.62, cy: 0.13, w: 0.75}]}
          highlights={[{box: [0.52, 0.06, 0.975, 0.2], from: 30}]} />
        <Insight from={40} eyebrow="Where data really comes from" title={<>54,892 changes in Smart View · <span style={{color: C.gold}}>0</span> in forms</>} y={330} />
      </Shot>
    </Bg>
  );
};

// ---------- 8. Recommendations ----------
const Rec: React.FC<{from: number; n: string; tag: string; title: string; proof: string}> = ({from, n, tag, title, proof}) => {
  const p = useIn(from, 18);
  return (
    <div
      style={{
        width: 520, minHeight: 420, padding: 40, background: 'white', borderRadius: 22, borderTop: `8px solid ${C.gold}`,
        boxShadow: '0 18px 50px rgba(20,40,50,0.12)', opacity: p, transform: `translateY(${(1 - p) * 60}px)`,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{fontSize: 64, fontWeight: 600, color: C.goldLight, WebkitTextStroke: `2px ${C.navy}`}}>{n}</div>
        <div style={{fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.green, background: C.greenLight, padding: '8px 14px', borderRadius: 8}}>{tag}</div>
      </div>
      <div style={{fontSize: 40, fontWeight: 600, color: C.navy, marginTop: 24, lineHeight: 1.2}}>{title}</div>
      <div style={{fontSize: 28, fontWeight: 400, color: C.muted, marginTop: 18, lineHeight: 1.35}}>{proof}</div>
    </div>
  );
};
const S08: React.FC = () => {
  const l = L('s08_recs');
  return (
    <Bg>
      <div style={{position: 'absolute', left: 120, top: 130}}>
        <Eyebrow>Recommendations</Eyebrow>
        <div style={{marginTop: 20}}>
          <Words text="Each one tied to a *number* from your system." from={at(l, 0)} size={60} weight={600} color={C.navy} accent={C.green} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 120, top: 380, display: 'flex', gap: 40}}>
        <Rec from={at(l, 1)} n="01" tag="NetSuite" title="Retire unused accounts before Planning" proof="93 of 445 accounts have no activity at all." />
        <Rec from={at(l, 2)} n="02" tag="Planning" title="Plan your real seasonality" proof="Monthly revenue swings 5.3× between the best and worst month." />
        <Rec from={at(l, 3)} n="03" tag="Planning" title="Keep or retire each module" proof="Workforce: dormant since February, 11 GB of stored data." />
      </div>
    </Bg>
  );
};

// ---------- 9. What you get ----------
const Check: React.FC<{from: number; children: React.ReactNode}> = ({from, children}) => {
  const p = useIn(from, 16);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 34, opacity: p, transform: `translateX(${(1 - p) * -40}px)`}}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={34} fill={C.gold} />
        <path d="M21 37 l10 10 l20 -22" stroke={C.navy} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={60} strokeDashoffset={60 * (1 - p)} />
      </svg>
      <div style={{fontSize: 64, fontWeight: 500}}>{children}</div>
    </div>
  );
};
const S09: React.FC = () => {
  const l = L('s09_get');
  const s = at(l, 0);
  return (
    <Bg dark>
      <div style={{position: 'absolute', left: 170, top: 210}}>
        <Eyebrow dark>What you get</Eyebrow>
        <div style={{display: 'flex', flexDirection: 'column', gap: 46, marginTop: 50}}>
          <Check from={s + 10}>A written report</Check>
          <Check from={s + 40}>A walkthrough with your team</Check>
          <Check from={s + 72}>Prioritized next steps</Check>
        </div>
      </div>
    </Bg>
  );
};

// ---------- 10. CTA ----------
const S10: React.FC = () => {
  const l = L('s10_cta');
  const f = useCurrentFrame();
  const lp = useIn(at(l, 1, 10), 24);
  const url = useIn(at(l, 1, 30), 18);
  return (
    <Bg>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{width: 1400}}>
          <Words text="How is your system *really* being used?" from={at(l, 0)} size={76} weight={600} color={C.navy} accent={C.green} stagger={3} />
        </div>
        <Img src={staticFile('brand/bpc_logo_2026.png')} style={{height: 150, marginTop: 80, opacity: lp, transform: `scale(${0.94 + 0.06 * lp})`}} />
        <div style={{fontSize: 40, fontWeight: 500, color: C.green, marginTop: 40, opacity: url}}>bryantparkconsulting.com</div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: C.navy, opacity: interpolate(f, [sceneFrames(SCENES[9]) - 14, sceneFrames(SCENES[9])], [0, 1], clamp)}} />
    </Bg>
  );
};

const COMPONENTS: Record<string, React.FC> = {
  s01_hook: S01, s02_nspb: S02, s03_ns: S03, s04_promise: S04, s05_how: S05,
  s06_ns_doc: S06, s07_nspb_doc: S07, s08_recs: S08, s09_get: S09, s10_cta: S10,
};

const SceneWrap: React.FC<{children: React.ReactNode}> = ({children}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, 9], [0, 1], {...clamp, easing: ease});
  return <AbsoluteFill style={{opacity: p, transform: `scale(${1.015 - 0.015 * p})`}}>{children}</AbsoluteFill>;
};

export const AssessmentVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: C.navy, fontFamily: FONT}}>
      <FontFaces />
      <Audio
        src={staticFile('audio/house-vibez.mp3')}
        volume={(f) => 0.06 * interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 1, 1, 0], clamp)}
      />
      {SCENES.map((s, i) => {
        const dur = sceneFrames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <SceneWrap>
              <Comp />
              <CornerLogo dark={DARK.has(s.key)} />
              {s.captions && <Captions lines={s.lines} />}
            </SceneWrap>
            <Audio src={staticFile(`vo/${s.key}.wav`)} />
            {i > 0 && <Audio src={staticFile('audio/transition-soft.mp3')} volume={0.18} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
