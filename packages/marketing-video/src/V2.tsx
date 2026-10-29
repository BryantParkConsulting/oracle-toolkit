import React from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timing from './timing.json';
import {C, FONT, Line, at, Captions, CornerLogo, FontFaces, clamp} from './lib';
import {Cam, DoF, Drop, EASE, Flash, Float, LightStage, Marker, Plane, Slam, Stage, cruise, easeFall, hash, liftOf, mix, ramp} from './fx';

type Scene = {key: string; duration: number; captions: boolean; lines: Line[]};
const SCENES = timing.scenes as Scene[];
const frames = (s: Scene) => Math.ceil(s.duration * 30);
export const TOTAL2 = SCENES.reduce((a, s) => a + frames(s), 0);
const L = (k: string) => SCENES.find((s) => s.key === k)!.lines;
const LIGHT = new Set(['s04_promise', 's10_cta']);

export const Sfx: React.FC<{at: number; src: string; v?: number}> = ({at: a, src, v = 0.35}) => (
  <Sequence from={Math.max(0, a)} layout="none"><Audio src={staticFile(`sfx/${src}.mp3`)} volume={v} /></Sequence>
);

// ======================= 1. HOOK: trailer bumper + slam + marker =======================
const BUMPER: {src: string; cx: number; cy: number; z: number; r: number}[] = [
  {src: 'pages/ns-05-hi.png', cx: 0.3, cy: 0.12, z: 2.6, r: -6},
  {src: 'pages/pb-03-hi.png', cx: 0.4, cy: 0.27, z: 2.2, r: 5},
  {src: 'pages/pb-11-hi.png', cx: 0.68, cy: 0.12, z: 2.8, r: -4},
];
const S01: React.FC = () => {
  const f = useCurrentFrame();
  const l = L('s01_hook');
  const cut = Math.floor(f / 9);
  const b = BUMPER[cut];
  const lt = (f % 9) / 9;
  return (
    <Stage>
      {f < 27 && b && (
        <AbsoluteFill style={{overflow: 'hidden', background: '#0B1F2B'}}>
          <Img src={staticFile(b.src)} style={{position: 'absolute', width: 1920 * b.z * (1 + lt * 0.06), left: 960 - 1920 * b.z * b.cx, top: 540 - 1920 * b.z * 1.33 * b.cy,
            transform: `rotate(${b.r}deg)`, filter: 'saturate(0.9) contrast(1.05)'}} />
          <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(15,42,58,0.55), transparent 40%, rgba(15,42,58,0.4))'}} />
        </AbsoluteFill>
      )}
      {f >= 27 && f < 34 && <AbsoluteFill style={{background: '#050E14'}} />}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
          <Slam from={at(l, 0, 4)} style={{fontSize: 150, fontWeight: 700, letterSpacing: -5}}>You pay for it.</Slam>
          <BlurWords from={at(l, 1, 6)} size={150} weight={700} parts={['Do', 'you', 'use', 'it?']} hot={2} />
          <div style={{marginTop: -54, marginLeft: 60}}><Marker from={at(l, 1, 30)} width={300} /></div>
        </div>
      </AbsoluteFill>
      <Flash at={at(l, 0, 4)} peak={0.35} />
      <Sfx at={0} src="camera-lens-shutter" v={0.25} /><Sfx at={9} src="camera-lens-shutter" v={0.25} /><Sfx at={18} src="camera-lens-shutter" v={0.25} />
      <Sfx at={at(l, 0, 2)} src="impact-zoom-quick" v={0.5} />
      <Sfx at={at(l, 1, 30)} src="marker-pen-line" v={0.35} />
    </Stage>
  );
};

/** blur-slide: words rise + unblur, one hot word in gold. */
export const BlurWords: React.FC<{from: number; size: number; weight: number; parts: string[]; hot?: number; color?: string; hotColor?: string}> = ({
  from, size, weight, parts, hot = -1, color, hotColor = C.gold,
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{fontSize: size, fontWeight: weight, letterSpacing: -size * 0.033, color, whiteSpace: 'nowrap'}}>
      {parts.map((w, i) => {
        const t = ramp(f, from + i * 4, 16, EASE.out);
        return (
          <span key={i} style={{display: 'inline-block', marginRight: size * 0.24, opacity: t, transform: `translateY(${(1 - t) * 0.38}em)`,
            filter: `blur(${(1 - t) * 18}px)`, color: i === hot ? hotColor : undefined}}>{w}</span>
        );
      })}
    </div>
  );
};

// ======================= 2. NSPB numbers: slams + gauge + dot wave =======================
export const Roll: React.FC<{to: number; from: number; dur?: number}> = ({to, from, dur = 26}) => {
  const f = useCurrentFrame();
  const v = Math.round(interpolate(f, [from, from + dur], [0, to], {...clamp, easing: EASE.snappy}));
  return <>{v.toLocaleString('en-US')}</>;
};
export const Gauge: React.FC<{from: number; value: number; size?: number}> = ({from, value, size = 300}) => {
  const f = useCurrentFrame();
  // needle-sweep self test: sweep to full, fall back to the real value
  const up = ramp(f, from, 16, EASE.swift);
  const down = ramp(f, from + 18, 26, EASE.snappy);
  const v = f < from + 18 ? up : mix(1, value, down);
  const r = size / 2 - 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{transform: 'rotate(-90deg)', overflow: 'visible'}}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(175,200,216,0.18)" strokeWidth={22} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={C.gold} strokeWidth={22} fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{filter: 'drop-shadow(0 0 12px rgba(252,202,71,0.6))'}} />
    </svg>
  );
};
export const DotWave: React.FC<{from: number; n: number; cols: number; lit?: (i: number) => boolean; litFrom?: number; size?: number; gap?: number; dimTo?: number}> = ({
  from, n, cols, lit, litFrom = 0, size = 14, gap = 8, dimTo,
}) => {
  const f = useCurrentFrame();
  const rows = Math.ceil(n / cols);
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  return (
    <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap}}>
      {Array.from({length: n}).map((_, i) => {
        const x = i % cols, y = Math.floor(i / cols);
        const d = Math.hypot(x - cx, y - cy);
        const t = ramp(f, from + d * 1.1, 10, EASE.overshoot);
        const isLit = lit?.(i) && f >= litFrom + d * 0.9;
        const dim = dimTo !== undefined ? ramp(f, dimTo + d * 0.5, 12, EASE.out) : 0;
        const bg = isLit ? C.gold : `rgba(175,200,216,${mix(0.75, 0.18, dim)})`;
        return <div key={i} style={{width: size, height: size, borderRadius: size / 2, background: bg, transform: `scale(${t})`,
          boxShadow: isLit ? '0 0 10px rgba(252,202,71,0.7)' : undefined}} />;
      })}
    </div>
  );
};
export const StatCol: React.FC<{children: React.ReactNode; label: string; from: number; w?: number}> = ({children, label, from, w = 500}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from + 8, 14, EASE.out);
  return (
    <div style={{width: w, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
      <div style={{height: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'}}>{children}</div>
      <div style={{fontSize: 36, fontWeight: 500, color: C.blueLight, marginTop: 26, opacity: t, transform: `translateY(${(1 - t) * 16}px)`}}>{label}</div>
    </div>
  );
};
export const Big: React.FC<{children: React.ReactNode; of?: string; color?: string}> = ({children, of, color = 'white'}) => (
  <div style={{fontSize: 170, fontWeight: 700, letterSpacing: -7, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>
    {children}{of && <span style={{fontSize: 70, fontWeight: 500, color: 'rgba(175,200,216,0.7)', letterSpacing: -2}}> / {of}</span>}
  </div>
);
export const Eyebrow2: React.FC<{children: React.ReactNode; from?: number; color?: string}> = ({children, from = 0, color = C.gold}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, 16, EASE.out);
  return <div style={{fontSize: 24, fontWeight: 600, letterSpacing: mix(14, 5, t), textTransform: 'uppercase', color, opacity: t}}>{children}</div>;
};
const S02: React.FC = () => {
  const l = L('s02_nspb');
  const f = useCurrentFrame();
  const a = at(l, 0, 40), b = at(l, 1, 4), c = at(l, 2, 20);
  // slow 3D drift of the whole board
  const ry = mix(-7, 5, f / 420);
  return (
    <Stage>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 140}}><Eyebrow2>NetSuite Planning · one real review</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{perspective: 1600}}>
        <AbsoluteFill style={{transform: `rotateX(9deg) rotateY(${ry}deg)`, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 40, paddingTop: 60}}>
          <StatCol from={a} label="real users in 180 days">
            <Drop from={a}><Big><Roll to={4} from={a} dur={10} /></Big></Drop>
          </StatCol>
          <StatCol from={b} label="business rules actually ran">
            <div style={{position: 'absolute', opacity: ramp(f, b - 4, 8)}}><Gauge from={b} value={17 / 155} size={330} /></div>
            <Big of="155"><Roll to={17} from={b + 18} dur={20} /></Big>
          </StatCol>
          <StatCol from={c} label="forms used to enter data">
            <div style={{position: 'absolute', opacity: 0.9}}><DotWave from={c - 16} n={172} cols={16} size={13} gap={7} dimTo={c + 12} /></div>
            <Slam from={c + 14} shake={14}><Big color={C.gold}>0<span style={{fontSize: 70, fontWeight: 500, color: 'rgba(175,200,216,0.8)', letterSpacing: -2}}> / 172</span></Big></Slam>
          </StatCol>
        </AbsoluteFill>
      </AbsoluteFill>
      <Source2>From a BPC NSPB Current State Assessment · client identity removed</Source2>
      <Sfx at={a} src="hit-weak" v={0.45} /><Sfx at={b} src="sweep-short" v={0.3} /><Sfx at={b + 18} src="switch-tap" v={0.4} />
      <Sfx at={c - 14} src="data-scan" v={0.18} /><Sfx at={c + 14} src="bass-hit-short" v={0.55} />
    </Stage>
  );
};
export const Source2: React.FC<{children: React.ReactNode; dark?: boolean}> = ({children, dark = true}) => (
  <div style={{position: 'absolute', left: 0, right: 0, bottom: 150, textAlign: 'center', fontSize: 22, color: dark ? 'rgba(175,200,216,0.6)' : C.muted}}>{children}</div>
);

// ======================= 3. NetSuite numbers: value-stagger bars + ripple grid =======================
const Bars: React.FC<{from: number}> = ({from}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 9, height: 300}}>
      {Array.from({length: 37}).map((_, i) => {
        const on = i < 21;
        const h = on ? 150 + hash(i) * 140 : 50 + hash(i + 9) * 50;
        const t = ramp(f, from + i * 1.4, 16, EASE.overshoot);
        const blur = (1 - ramp(f, from + i * 1.4, 12, EASE.out)) * 8;
        const col = on ? `hsl(${mix(165, 152, i / 21)}, ${mix(30, 34, i / 21)}%, ${mix(48, 36, i / 21)}%)` : 'rgba(175,200,216,0.22)';
        return <div key={i} style={{width: 22, height: h * t, borderRadius: 5, background: col, filter: `blur(${blur}px)`,
          boxShadow: on ? '0 0 16px rgba(97,156,138,0.35)' : undefined}} />;
      })}
    </div>
  );
};
const S03: React.FC = () => {
  const l = L('s03_ns');
  const f = useCurrentFrame();
  const a = at(l, 0, 20), b = at(l, 1);
  const LIT = new Set(Array.from({length: 445}).map((_, i) => i).filter((i) => hash(i * 3.7) < 93 / 445).slice(0, 93));
  return (
    <Stage glow={[0.3, 0.25]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 140}}><Eyebrow2>NetSuite ERP · one real account</Eyebrow2></AbsoluteFill>
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 150, paddingTop: 40}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
          <Bars from={a} />
          <div style={{marginTop: 30, display: 'flex', alignItems: 'baseline', gap: 26, opacity: ramp(f, a + 10, 12)}}>
            <Big of="37"><Roll to={21} from={a + 6} dur={30} /></Big>
          </div>
          <div style={{fontSize: 36, color: C.blueLight, fontWeight: 500, opacity: ramp(f, a + 20, 12)}}>modules actually in use</div>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', opacity: ramp(f, b - 6, 10)}}>
          <DotWave from={b - 6} n={445} cols={25} size={12} gap={7} lit={(i) => LIT.has(i)} litFrom={b + 10} />
          <div style={{marginTop: 30}}><Big color={C.gold}><Roll to={93} from={b + 10} dur={26} /></Big></div>
          <div style={{fontSize: 36, color: C.blueLight, fontWeight: 500}}>of 445 accounts never had an entry</div>
        </div>
      </AbsoluteFill>
      <Source2>From a BPC NetSuite Account Analysis · client identity removed</Source2>
      <Sfx at={a} src="sweep-short" v={0.3} /><Sfx at={b + 10} src="shimmer-sparkle-sweep" v={0.25} />
    </Stage>
  );
};

// ======================= 4. PROMISE: text-as-mask "FACTS." with zoom-through =======================
const WORD = 'FACTS';
const WS = 440;
const useStem = () => {
  const [m, setM] = React.useState<{left: number; stem: number} | null>(null);
  const [h] = React.useState(() => delayRender('measure'));
  React.useEffect(() => {
    const done = () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `700 ${WS}px ${FONT}`;
      (ctx as any).letterSpacing = `${-WS * 0.04}px`;
      const total = ctx.measureText(WORD).width;
      const pre = ctx.measureText('FAC').width;
      const tw = ctx.measureText('T').width;
      setM({left: 960 - total / 2, stem: 960 - total / 2 + pre + tw / 2 + WS * 0.03});
      continueRender(h);
    };
    Promise.race([document.fonts.load(`700 ${WS}px ${FONT}`), new Promise((r) => setTimeout(r, 4000))]).then(done, done);
  }, [h]);
  return m;
};
const S04: React.FC = () => {
  const l = L('s04_promise');
  const f = useCurrentFrame();
  const m = useStem();
  const zStart = at(l, 1, -20);
  const zt = ramp(f, zStart, 24, (x) => x);
  const inhale = ramp(f, zStart - 8, 8, EASE.swift);
  const S = zt <= 0 ? mix(1, 0.965, inhale) : 0.965 * Math.pow(46 / 0.965, Math.pow(zt, 1.8));
  const ox = m?.stem ?? 960, oy = 620;
  const drift = ramp(f, 0, zStart, EASE.smooth);
  const takeover = interpolate(Math.pow(zt, 1.8), [0.7, 0.84], [0, 1], clamp);
  const enter = ramp(f, at(l, 0), 18, EASE.snappy);
  const chips = (i: number) => ramp(f, at(l, 1, 30 + i * 14), 14, EASE.overshoot);
  return (
    <AbsoluteFill>
      <LightStage>
        <AbsoluteFill style={{opacity: 1 - takeover}}>
          <div style={{position: 'absolute', top: 210, left: 0, right: 0, textAlign: 'center', fontSize: 48, fontWeight: 500, color: C.navy,
            opacity: enter * (1 - ramp(f, zStart - 8, 8, EASE.exit)), letterSpacing: -1}}>
            Not opinions.
          </div>
          <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
            <defs>
              <clipPath id="word">
                <text x={960} y={760} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={WS} letterSpacing={-WS * 0.04}
                  transform={`translate(${ox} ${oy}) scale(${S * mix(1.04, 1, enter)}) translate(${-ox} ${-oy})`}>{WORD}</text>
              </clipPath>
              <clipPath id="wipe"><rect x={0} y={1080 - 1080 * enter} width={1920} height={1080} /></clipPath>
            </defs>
            <g clipPath="url(#wipe)">
              <g clipPath="url(#word)">
                <rect width={1920} height={1080} fill={C.navy} />
                <image href={staticFile('pages/pb-01-hi.png')} x={mix(-200, -900, drift)} y={-1150} width={3060 * 0.82} height={3960 * 0.82} preserveAspectRatio="none" />
                <image href={staticFile('pages/ns-01-hi.png')} x={mix(1050, 450, drift)} y={-1300} width={2975 * 0.82} height={4210 * 0.82} preserveAspectRatio="none" />
              </g>
            </g>
          </svg>
          <div style={{position: 'absolute', top: 840, left: 0, right: 0, textAlign: 'center', fontSize: 40, fontWeight: 500, color: C.green,
            opacity: ramp(f, at(l, 0, 30), 14) * (1 - ramp(f, zStart - 8, 8, EASE.exit))}}>
            read straight from your own system
          </div>
        </AbsoluteFill>
      </LightStage>
      {/* takeover: the dark report covers fill the screen */}
      <AbsoluteFill style={{opacity: takeover, background: C.navy, overflow: 'hidden'}}>
        <Img src={staticFile('pages/pb-01-hi.png')} style={{position: 'absolute', width: 1500, left: -260, top: -520, filter: 'blur(6px) brightness(0.55)', transform: `scale(${1.1 - 0.1 * takeover})`}} />
        <Img src={staticFile('pages/ns-01-hi.png')} style={{position: 'absolute', width: 1500, left: 880, top: -640, filter: 'blur(6px) brightness(0.55)'}} />
        <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(15,42,58,0.35), rgba(15,42,58,0.85))'}} />
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 54}}>
          <div style={{display: 'flex', gap: 26}}>
            {['NetSuite', 'NetSuite Planning'].map((t, i) => (
              <div key={t} style={{padding: '20px 40px', borderRadius: 999, border: `3px solid ${C.gold}`, color: 'white', fontSize: 46, fontWeight: 600,
                background: 'rgba(15,42,58,0.6)', transform: `scale(${chips(i)})`, opacity: Math.min(1, chips(i) * 2)}}>{t}</div>
            ))}
          </div>
          <BlurWords from={at(l, 1, 70)} size={78} weight={600} parts={['Where', 'you', 'stand.', 'What', 'to', 'fix', 'first.']} hot={-1} color="white" />
          <div style={{marginTop: -40, marginLeft: 420}}><Marker from={at(l, 1, 100)} width={460} /></div>
        </AbsoluteFill>
      </AbsoluteFill>
      <Sfx at={zStart} src="warp-slide" v={0.45} />
      <Sfx at={at(l, 1, 30)} src="pop" v={0.3} /><Sfx at={at(l, 1, 44)} src="pop" v={0.25} />
    </AbsoluteFill>
  );
};

// ======================= 5. HOW: source curves converge + scan brackets =======================
const S05: React.FC = () => {
  const l = L('s05_how');
  const f = useCurrentFrame();
  const a = at(l, 0), b = at(l, 1), c = at(l, 2, -6);
  const nodes = [
    {y: 360, from: a, tag: 'NS', t: 'NetSuite', s: 'Read-only connection · SuiteQL'},
    {y: 720, from: b, tag: 'PB', t: 'NetSuite Planning', s: 'App snapshot · 180-day audit'},
  ];
  const doc = ramp(f, c, 20, EASE.overshoot);
  const scanT = Math.max(0, f - c - 22) / 40;
  const scanY = (Math.sin(scanT * Math.PI - Math.PI / 2) + 1) / 2;
  const scanOn = f > c + 22 && f < c + 22 + 80;
  const bracket = ramp(f, c + 14, 12, EASE.snappy);
  const DX = 1390, DY = 540, DW = 470, DH = 665;
  return (
    <Stage glow={[0.65, 0.5]}>
      <AbsoluteFill style={{paddingTop: 120, alignItems: 'center'}}><Eyebrow2>How it works</Eyebrow2></AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {nodes.map((n, i) => {
          const t = ramp(f, n.from + 10, 30, EASE.swift);
          const d = `M 760 ${n.y} C 980 ${n.y}, 1040 ${DY}, ${DX - DW / 2 - 20} ${DY}`;
          return (
            <g key={i}>
              <path d={d} stroke="rgba(252,202,71,0.25)" strokeWidth={14} fill="none" strokeDasharray={900} strokeDashoffset={900 * (1 - t)} style={{filter: 'blur(6px)'}} />
              <path d={d} stroke={C.gold} strokeWidth={4} fill="none" strokeDasharray={900} strokeDashoffset={900 * (1 - t)} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const t = ramp(f, n.from, 18, EASE.snappy);
        return (
          <div key={i} style={{position: 'absolute', left: 140, top: n.y - 70, width: 620, height: 140, borderRadius: 22, background: 'rgba(255,255,255,0.06)',
            border: '2px solid rgba(175,200,216,0.25)', display: 'flex', alignItems: 'center', gap: 28, padding: '0 30px', boxSizing: 'border-box',
            opacity: t, transform: `translateX(${(1 - t) * -80}px)`, backdropFilter: 'blur(6px)'}}>
            <div style={{width: 84, height: 84, borderRadius: 18, background: C.gold, color: C.navy, fontWeight: 700, fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{n.tag}</div>
            <div><div style={{fontSize: 40, fontWeight: 600}}>{n.t}</div><div style={{fontSize: 26, color: C.blueLight, marginTop: 4}}>{n.s}</div></div>
          </div>
        );
      })}
      {/* converging document */}
      <div style={{position: 'absolute', left: DX - DW / 2, top: DY - DH / 2, width: DW, height: DH, transform: `scale(${doc}) rotate(${mix(-8, -2, doc)}deg)`, opacity: Math.min(1, doc * 2)}}>
        <Img src={staticFile('pages/pb-01.png')} style={{position: 'absolute', width: DW, left: 40, top: 26, transform: 'rotate(6deg)', boxShadow: '0 30px 70px rgba(0,0,0,0.5)'}} />
        <Img src={staticFile('pages/ns-01.png')} style={{position: 'absolute', width: DW, left: 0, top: 0, boxShadow: '0 30px 70px rgba(0,0,0,0.5)'}} />
        {scanOn && (
          <div style={{position: 'absolute', left: 0, width: DW, top: scanY * DH - 60, height: 120, overflow: 'hidden',
            background: 'linear-gradient(180deg, transparent, rgba(252,202,71,0.22) 70%, rgba(252,202,71,0.9) 96%, transparent)', mixBlendMode: 'screen'}} />
        )}
      </div>
      {[0, 1, 2, 3].map((k) => {
        const sx = k % 2 ? 1 : -1, sy = k > 1 ? 1 : -1;
        const off = mix(160, 30, bracket);
        return (
          <div key={k} style={{position: 'absolute', left: DX + sx * (DW / 2 + off) - (sx > 0 ? 70 : 0), top: DY + sy * (DH / 2 + off) - (sy > 0 ? 70 : 0), width: 70, height: 70,
            borderLeft: sx < 0 ? `6px solid ${C.gold}` : undefined, borderRight: sx > 0 ? `6px solid ${C.gold}` : undefined,
            borderTop: sy < 0 ? `6px solid ${C.gold}` : undefined, borderBottom: sy > 0 ? `6px solid ${C.gold}` : undefined, opacity: bracket}} />
        );
      })}
      <Sfx at={a} src="swoosh-slow" v={0.3} /><Sfx at={b} src="swoosh-slow" v={0.3} />
      <Sfx at={c} src="paper-slide" v={0.4} /><Sfx at={c + 22} src="data-scan" v={0.3} />
    </Stage>
  );
};

// ======================= 6. NETSUITE REPORT: chart glide → graze tour → lift → hub =======================
const REV: [string, number][] = [['2021', 56.0], ['2022', 170.2], ['2023', 152.8], ['2024', 174.7], ['2025', 200.0], ['2026*', 125.1]];
const ChartBoard: React.FC<{t: number}> = ({t}) => (
  <div style={{width: 2400, height: 1300, background: '#FBFAF7', borderRadius: 30, padding: 90, boxSizing: 'border-box', color: C.ink, fontFamily: FONT}}>
    <div style={{fontSize: 40, fontWeight: 600, letterSpacing: 6, color: C.green, textTransform: 'uppercase'}}>The business as the system describes it</div>
    <div style={{fontSize: 84, fontWeight: 700, color: C.navy, marginTop: 20, letterSpacing: -2}}>Revenue by year · $M</div>
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 90, height: 760, marginTop: 60, paddingLeft: 40}}>
      {REV.map(([y, v], i) => {
        const p = Math.min(1, Math.max(0, (t - 0.08 - i * 0.07) / 0.3));
        const e = easeFall(p) * 0 + EASE.overshoot(p);
        return (
          <div key={y} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: 250}}>
            <div style={{fontSize: 58, fontWeight: 700, color: C.navy, opacity: p}}>{(v * Math.min(1, p * 1.2)).toFixed(1)}</div>
            <div style={{width: 200, height: (v / 200) * 560 * e, borderRadius: 16, background: i === 4 ? C.gold : i === 5 ? '#C9D7DF' : C.navy, marginTop: 16}} />
            <div style={{fontSize: 46, fontWeight: 500, color: C.muted, marginTop: 20}}>{y}</div>
          </div>
        );
      })}
    </div>
  </div>
);
type Row = [string, 'In use' | 'Partial use' | 'Not used' | 'Not enabled', string];
const ROWS: Row[] = [
  ['OneWorld / Subsidiaries', 'In use', '3 subsidiaries'],
  ['Multiple Currencies', 'In use', '4 currencies · 8,770 exchange rates'],
  ['Accounting Periods', 'In use', '323 accounting periods'],
  ['Class / Department / Location', 'In use', '18 departments · 7 classes · 55 locations'],
  ['NetSuite Native Budgets', 'In use', '15,749 budget rows — built outside, loaded in'],
  ['Advanced Revenue Management', 'In use', '19,551 arrangements · 54,369 plans'],
  ['Fixed Assets Management', 'In use', '324 assets · 7 types'],
  ['Project Management', 'Partial use', '15,553 projects · 0 project tasks'],
  ['Multi-Book Accounting', 'Not used', '1 accounting book — primary only'],
  ['Intercompany Framework', 'Not used', '3 subsidiaries, no intercompany transactions'],
  ['Expense Reports', 'Not used', 'Feature enabled · 0 expense reports'],
  ['CRM / Opportunities', 'Not used', 'Feature enabled · 0 opportunities'],
  ['SuiteBilling', 'Not enabled', 'Billing tables not visible'],
  ['Manufacturing', 'Not enabled', 'No manufacturing tables'],
];
const PILL: Record<Row[1], [string, string]> = {
  'In use': ['#376858', '#E5ECE8'], 'Partial use': ['#8A6A10', '#FFF1C9'], 'Not used': ['#B4561F', '#FBE3D3'], 'Not enabled': ['#5B6B74', '#E6EAEC'],
};
const ModuleTable: React.FC<{t: number; lift?: number}> = ({t, lift = 0}) => (
  <div style={{width: 2900, background: '#FBFAF7', borderRadius: 34, padding: '80px 90px', boxSizing: 'border-box', fontFamily: FONT, color: C.ink}}>
    <Float h={liftOf(t, 0.18, 150)}>
      <div style={{fontSize: 74, fontWeight: 700, color: C.navy, letterSpacing: -2}}>Systems landscape</div>
    </Float>
    <Float h={liftOf(t, 0.26, 150)}>
      <div style={{display: 'flex', height: 46, borderRadius: 12, overflow: 'hidden', marginTop: 40, gap: 6}}>
        {([[21, '#376858', 'In use 21'], [3, C.gold, 'Partial 3'], [4, '#D9822B', 'Not used 4'], [4, '#9AA7AE', 'Not enabled 4'], [5, '#C9D2D7', 'Not visible 5']] as [number, string, string][]).map(([n, c, lb]) => (
          <div key={lb} style={{flex: n, background: c, color: 'white', fontSize: 28, fontWeight: 600, display: 'flex', alignItems: 'center', paddingLeft: 18}}>{lb}</div>
        ))}
      </div>
    </Float>
    <div style={{display: 'flex', fontSize: 36, fontWeight: 600, letterSpacing: 4, color: C.muted, textTransform: 'uppercase', marginTop: 70, paddingBottom: 24, borderBottom: '3px solid rgba(29,68,90,0.12)'}}>
      <div style={{width: 1050}}>Module</div><div style={{width: 420}}>Status</div><div>Evidence</div>
    </div>
    {ROWS.map((r, i) => {
      const isB = i === 4;
      const h = liftOf(t, 0.32 + (i / ROWS.length) * 0.6, 150) + (isB ? lift : 0);
      return (
        <Float key={r[0]} h={h}>
          <div style={{display: 'flex', alignItems: 'center', height: 130, fontSize: 52, borderBottom: '3px solid rgba(29,68,90,0.08)',
            background: isB && lift > 2 ? 'white' : undefined, borderRadius: isB && lift > 2 ? 20 : 0,
            outline: isB && lift > 2 ? `6px solid ${C.gold}` : undefined, paddingLeft: isB && lift > 2 ? 30 : 0, marginLeft: isB && lift > 2 ? -30 : 0}}>
            <div style={{width: 1050, fontWeight: 600, color: C.navy}}>{r[0]}</div>
            <div style={{width: 420}}>
              <span style={{background: PILL[r[1]][1], color: PILL[r[1]][0], padding: '10px 26px', borderRadius: 999, fontSize: 38, fontWeight: 600}}>{r[1]}</span>
            </div>
            <div style={{color: C.muted, fontSize: 46}}>{r[2]}</div>
          </div>
        </Float>
      );
    })}
  </div>
);
const APPS: [string, string, number, number][] = [['Concur', 'Travel & expense', -520, -250], ['Celigo', 'Salesforce CRM', 520, -250], ['Ramp', 'Corporate cards', -520, 250], ['FloQast', 'Close & reconciliation', 520, 250]];
const Hub: React.FC<{from: number}> = ({from}) => {
  const f = useCurrentFrame();
  const flip = ramp(f, from, 14, EASE.snappy);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', perspective: 1400}}>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {APPS.map(([n, , dx, dy], i) => {
          const t = ramp(f, from + 16 + i * 3, 20, EASE.swift);
          const x2 = 960 + dx * t, y2 = 540 + dy * t;
          const pulse = ((f - from - 36 - i * 6) % 40) / 40;
          return (
            <g key={n}>
              <line x1={960} y1={540} x2={x2} y2={y2} stroke="rgba(252,202,71,0.5)" strokeWidth={4} />
              {f > from + 36 && <circle cx={960 + dx * pulse} cy={540 + dy * pulse} r={9} fill={C.gold} style={{filter: 'drop-shadow(0 0 8px #FCCA47)'}} />}
            </g>
          );
        })}
      </svg>
      <div style={{position: 'absolute', width: 380, height: 180, borderRadius: 30, background: 'white', color: C.navy, fontSize: 56, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotateY(${(1 - flip) * 180}deg)`, boxShadow: '0 30px 80px rgba(0,0,0,0.45)'}}>NetSuite</div>
      {APPS.map(([n, s, dx, dy], i) => {
        const t = ramp(f, from + 28 + i * 3, 14, EASE.overshoot);
        return (
          <div key={n} style={{position: 'absolute', left: 960 + dx - 200, top: 540 + dy - 70, width: 400, height: 140, borderRadius: 24, background: 'rgba(255,255,255,0.08)',
            border: `2px solid ${C.gold}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', transform: `scale(${t})`, opacity: Math.min(1, t * 2)}}>
            <div style={{fontSize: 46, fontWeight: 700}}>{n}</div>
            <div style={{fontSize: 26, color: C.blueLight}}>{s}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
export const Relay: React.FC<{from: number; to: number; fade?: number; children: (u: number, local: number) => React.ReactNode}> = ({from, to, fade = 8, children}) => {
  const f = useCurrentFrame();
  const local = f - from;
  if (local < -fade || f > to + fade) return null;
  const u = local / (to - from);
  const o = Math.min(Math.min(1, (local + fade) / fade), Math.min(1, (to - f + fade) / fade));
  return <AbsoluteFill style={{opacity: o}}>{children(u, local)}</AbsoluteFill>;
};
const S06: React.FC = () => {
  const l = L('s06_ns_doc');
  const {durationInFrames: d} = useVideoConfig();
  const f = useCurrentFrame();
  const a = 0, b = at(l, 1, -8), c = at(l, 2, -8), e = at(l, 3, -8);
  const mid = Math.round((b + c) / 2);
  return (
    <Stage>
      {/* steep tilt glide over the revenue chart */}
      <Relay from={a} to={b}>
        {(u) => (
          <DoF fx={50} fy={48} blur={10}>
            <Plane cam={{rx: 8, ry: -32, rz: 3, scale: 0.62, x: [300, -250], y: [0, 0]}} p={cruise(u)}><ChartBoard t={Math.min(1, u * 1.4)} /></Plane>
          </DoF>
        )}
      </Relay>
      {/* graze-face tour over the module table: two segments */}
      <Relay from={b} to={mid}>
        {(u) => (
          <DoF fx={44} fy={46}>
            <Plane cam={{rx: 14, ry: 28, rz: -5, scale: 0.78, x: [350, 420], y: [700, 250]}} p={cruise(u)}><ModuleTable t={Math.min(1, u * 1.3)} /></Plane>
          </DoF>
        )}
      </Relay>
      <Relay from={mid} to={c}>
        {(u) => (
          <DoF fx={46} fy={50}>
            <Plane cam={{rx: 18, ry: -22, rz: 5, scale: 0.78, x: [-300, -380], y: [150, -450]}} p={cruise(u)}><ModuleTable t={1} /></Plane>
          </DoF>
        )}
      </Relay>
      {/* budget row lifts (contact-shadow lift) */}
      <Relay from={c} to={e}>
        {(u, local) => {
          const lift = mix(0, 90, ramp(local, 10, 18, EASE.overshoot));
          return (
            <>
              <Plane cam={{rx: 22, ry: 0, rz: 0, scale: 0.72, x: [0, 0], y: [180, 140]}} p={u}><ModuleTable t={1} lift={lift} /></Plane>
              <div style={{position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', opacity: ramp(local, 22, 14)}}>
                <div style={{display: 'inline-block', background: C.gold, color: C.navy, fontSize: 46, fontWeight: 700, padding: '16px 36px', borderRadius: 14,
                  transform: `rotate(-1.5deg) scale(${ramp(local, 22, 14, EASE.overshoot)})`, boxShadow: '0 20px 50px rgba(0,0,0,0.4)'}}>
                  15,749 budget rows built outside NetSuite
                </div>
              </div>
            </>
          );
        }}
      </Relay>
      <Relay from={e} to={d + 8}>{() => <Hub from={e} />}</Relay>
      <Sfx at={a} src="whoosh-fast" v={0.25} /><Sfx at={b} src="air-woosh-quick" v={0.35} /><Sfx at={mid} src="air-woosh-quick" v={0.25} />
      <Sfx at={c + 10} src="paper-slide" v={0.4} /><Sfx at={e} src="sweep-short" v={0.35} /><Sfx at={e + 28} src="pop" v={0.3} />
    </Stage>
  );
};

// ======================= 7. NSPB REPORT: frame forerun + orbit drop + spotlight + score slam =======================
type Cube = {id: string; t: string; s: string; x: number; y: number; st: 'active' | 'dormant' | 'partial' | 'empty' | 'src' | 'out'};
const CUBES: Cube[] = [
  {id: 'ns', t: 'NetSuite', s: '252 data loads', x: 60, y: 380, st: 'src'},
  {id: 'fin', t: 'Financials', s: 'Active · 10.7 GB', x: 560, y: 150, st: 'active'},
  {id: 'wf', t: 'Workforce', s: 'Dormant · 11.3 GB', x: 560, y: 400, st: 'dormant'},
  {id: 'rev', t: 'Revenue', s: 'Data, no rules running', x: 560, y: 650, st: 'partial'},
  {id: 'wfr', t: 'WF Reporting', s: '2.9M cells', x: 1100, y: 100, st: 'active'},
  {id: 'rvr', t: 'Rev Reporting', s: '2.3M cells', x: 1100, y: 300, st: 'active'},
  {id: 'fr', t: 'Fin Reporting', s: '22.8M cells', x: 1100, y: 500, st: 'active'},
  {id: 'frh', t: 'Fin History', s: 'Empty — 0 cells', x: 1100, y: 700, st: 'empty'},
  {id: 'sv', t: 'Smart View', s: '100% of input', x: 1600, y: 400, st: 'out'},
];
const STC: Record<Cube['st'], string> = {active: '#619C8A', dormant: '#E0703A', partial: C.gold, empty: '#E0703A', src: C.blueLight, out: C.blueLight};
const LINKS: [string, string][] = [['ns', 'fin'], ['ns', 'wf'], ['ns', 'rev'], ['fin', 'fr'], ['wf', 'wfr'], ['rev', 'rvr'], ['fin', 'frh'], ['fr', 'sv'], ['rvr', 'sv'], ['wfr', 'sv']];
const CubeMap: React.FC<{drop: number; spot: number; local: number}> = ({drop, spot, local}) => {
  const W = 1980, H = 900, BW = 400, BH = 150;
  const pos = (id: string) => CUBES.find((c) => c.id === id)!;
  return (
    <div style={{width: W, height: H, position: 'relative', fontFamily: FONT, transformStyle: 'preserve-3d'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: drop}}>
        {LINKS.map(([a, b]) => {
          const p = pos(a), q = pos(b);
          const x1 = p.x + BW, y1 = p.y + BH / 2, x2 = q.x, y2 = q.y + BH / 2;
          return <path key={a + b} d={`M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`} stroke="rgba(175,200,216,0.45)" strokeWidth={4} fill="none" />;
        })}
      </svg>
      {CUBES.map((c) => {
        const hero = c.id === 'wf';
        const h = (1 - easeFall(drop)) * 260 + (hero ? spot * 140 : 0);
        const dim = hero ? 1 : 1 - spot * 0.6;
        return (
          <div key={c.id} style={{position: 'absolute', left: c.x, top: c.y, width: BW, height: BH, transformStyle: 'preserve-3d'}}>
            <div style={{position: 'absolute', inset: 0, borderRadius: 22, background: 'rgba(0,0,0,0.5)', filter: `blur(${8 + h * 0.12}px)`,
              transform: `translate(${h * 0.15}px, ${h * 0.25}px) scale(${1 + h * 0.0008})`, opacity: 0.25 + Math.min(0.4, h * 0.002)}} />
            <div style={{position: 'absolute', inset: 0, borderRadius: 22, background: hero && spot > 0 ? 'white' : 'rgba(251,250,247,0.96)', borderLeft: `14px solid ${STC[c.st]}`,
              transform: `translateZ(${h}px) scale(${hero ? 1 + spot * 0.12 : 1})`, opacity: dim * Math.min(1, drop * 3), padding: '24px 28px', boxSizing: 'border-box',
              boxShadow: hero && spot > 0 ? `0 0 0 ${6 * spot}px ${C.gold}, 0 40px 90px rgba(0,0,0,0.5)` : undefined}}>
              <div style={{fontSize: 44, fontWeight: 700, color: C.navy}}>{c.t}</div>
              <div style={{fontSize: 28, fontWeight: 500, color: c.st === 'dormant' || c.st === 'empty' ? '#C25A2A' : C.muted, marginTop: 6}}>{c.s}</div>
            </div>
          </div>
        );
      })}
      {spot > 0 && (
        <div style={{position: 'absolute', left: 560 + 420, top: 330, transform: `translateZ(200px) scale(${EASE.overshoot(Math.min(1, spot * 1.2))})`, transformOrigin: '0 50%',
          background: C.gold, color: C.navy, padding: '18px 30px', borderRadius: 14, fontSize: 42, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 20px 50px rgba(0,0,0,0.45)'}}>
          Dormant for 108 days
        </div>
      )}
      <div style={{position: 'absolute', left: -40, top: -40, width: W + 80, height: H + 80, borderRadius: 40, pointerEvents: 'none', transform: 'translateZ(-2px)',
        border: `5px solid ${C.gold}`, opacity: 0.9, boxShadow: `0 0 40px rgba(252,202,71,0.35)`,
        clipPath: `inset(0 ${100 - Math.min(100, local * 4)}% 0 0)`}} />
    </div>
  );
};
const S07: React.FC = () => {
  const l = L('s07_nspb_doc');
  const f = useCurrentFrame();
  const {durationInFrames: d} = useVideoConfig();
  const b = at(l, 1, -4), c = at(l, 2, -8);
  const drop = ramp(f, 22, 16, (x) => x);
  const spot = ramp(f, b + 6, 20, EASE.snappy);
  const orbit = mix(-20, 14, ramp(f, 0, b, EASE.smooth));
  const zoomIn = ramp(f, b, 26, EASE.smooth);
  const right = c;
  const sv = ramp(f, right + 10, 30, EASE.snappy);
  return (
    <Stage glow={[0.5, 0.3]}>
      <Relay from={0} to={right}>
        {(_, local) => (
          <AbsoluteFill style={{perspective: 1500}}>
            <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
              <div style={{transformStyle: 'preserve-3d', transform: `scale(${mix(0.78, 1.0, zoomIn)}) translate(${mix(0, 260, zoomIn)}px, ${mix(0, 40, zoomIn)}px) rotateX(${mix(22, 14, zoomIn)}deg) rotateY(${mix(orbit, 6, zoomIn)}deg)`}}>
                <CubeMap drop={drop} spot={spot} local={local} />
              </div>
            </AbsoluteFill>
          </AbsoluteFill>
        )}
      </Relay>
      <Relay from={right} to={d + 8}>
        {(_, local) => (
          <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 160}}>
            <div style={{textAlign: 'center', opacity: ramp(local, 0, 12)}}>
              <div style={{fontSize: 190, fontWeight: 700, letterSpacing: -8, fontVariantNumeric: 'tabular-nums'}}>{Math.round(54892 * sv).toLocaleString('en-US')}</div>
              <div style={{fontSize: 40, color: C.blueLight, fontWeight: 500}}>data changes in Smart View</div>
            </div>
            <div style={{width: 4, height: 360, background: 'rgba(175,200,216,0.3)'}} />
            <div style={{textAlign: 'center'}}>
              <Slam from={right + 44} shake={16}><div style={{fontSize: 190, fontWeight: 700, color: C.gold, letterSpacing: -8}}>0</div></Slam>
              <div style={{fontSize: 40, color: C.blueLight, fontWeight: 500, opacity: ramp(local, 50, 12)}}>in the 172 Planning forms</div>
            </div>
          </AbsoluteFill>
        )}
      </Relay>
      <Flash at={right + 44} peak={0.25} color="#FCCA47" />
      <Sfx at={8} src="sweep-short" v={0.3} /><Sfx at={36} src="hit-weak" v={0.4} /><Sfx at={b + 6} src="shimmer-sparkle-sweep" v={0.3} />
      <Sfx at={right + 10} src="clock-tick-single" v={0.3} /><Sfx at={right + 42} src="impact-cine-big" v={0.45} />
    </Stage>
  );
};

// ======================= 8. RECOMMENDATIONS: card flock tumble =======================
const RECS = [
  {n: '01', tag: 'NetSuite', t: 'Retire unused accounts before Planning', p: '93 of 445 accounts have no activity at all.'},
  {n: '02', tag: 'Planning', t: 'Plan your real seasonality', p: 'Monthly revenue swings 5.3× between the best and worst month.'},
  {n: '03', tag: 'Planning', t: 'Keep or retire each module', p: 'Workforce dormant since February · 11 GB stored.'},
];
const S08: React.FC = () => {
  const l = L('s08_recs');
  const f = useCurrentFrame();
  return (
    <Stage glow={[0.5, 0.15]}>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 110}}>
        <Eyebrow2>Recommendations</Eyebrow2>
        <div style={{marginTop: 22}}><BlurWords from={at(l, 0)} size={64} weight={600} parts={['Each', 'one', 'tied', 'to', 'a', 'number', 'from', 'your', 'system.']} hot={5} color="white" /></div>
      </AbsoluteFill>
      <AbsoluteFill style={{perspective: 1700}}>
        {RECS.map((r, i) => {
          const from = at(l, i + 1, -6);
          const t = ramp(f, from, 26, EASE.snappy);
          const sway = Math.sin((f - from) / 40) * 3 * t;
          const x = mix(1500, 0, t), z = mix(-500, 0, t);
          const ry = mix(88, -14, t) + sway;
          const left = 210 + i * 520, top = 400 + i * 40;
          return (
            <div key={r.n} style={{position: 'absolute', left, top, width: 480, height: 470, transform: `translate3d(${x}px, 0, ${z}px) rotateY(${ry}deg)`,
              opacity: f < from ? 0 : 1, background: 'linear-gradient(160deg, #FFFFFF, #F1EEE6)', borderRadius: 26, padding: 42, boxSizing: 'border-box', color: C.ink,
              boxShadow: '0 40px 90px rgba(0,0,0,0.45)', borderLeft: `10px solid ${i === 0 ? C.green : C.gold}`}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div style={{fontSize: 40, fontWeight: 500, color: C.green}}>{r.n}</div>
                <div style={{fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: C.green, background: C.greenLight, padding: '8px 14px', borderRadius: 8}}>{r.tag}</div>
              </div>
              <div style={{fontSize: 44, fontWeight: 700, color: C.navy, marginTop: 26, lineHeight: 1.15}}>{r.t}</div>
              <div style={{fontSize: 30, color: C.muted, marginTop: 20, lineHeight: 1.35}}>{r.p}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {RECS.map((_, i) => <Sfx key={'s' + i} at={at(l, i + 1, -6)} src="whoosh-fast" v={0.3} />)}
    </Stage>
  );
};

// ======================= 9. WHAT YOU GET: row embed =======================
const S09: React.FC = () => {
  const l = L('s09_get');
  const f = useCurrentFrame();
  const s = at(l, 0);
  const items = ['A written report', 'A walkthrough with your team', 'Prioritized next steps'];
  return (
    <Stage glow={[0.3, 0.4]}>
      <div style={{position: 'absolute', left: 260, top: 200}}><Eyebrow2>What you get</Eyebrow2></div>
      <div style={{position: 'absolute', left: 260, top: 300, width: 1400, perspective: 1200}}>
        {items.map((it, i) => {
          const from = s + 6 + i * 26;
          const t = ramp(f, from, 18, easeFall);
          const seam = Math.max(0, 1 - Math.abs(f - (from + 18)) / 10);
          return (
            <div key={it} style={{position: 'relative', height: 150, marginBottom: 24, transformOrigin: '50% 100%',
              transform: `translateY(${(1 - t) * -120}px) rotateX(${(1 - t) * 70}deg)`, opacity: f < from ? 0 : Math.min(1, t * 2)}}>
              <div style={{position: 'absolute', inset: 0, borderRadius: 22, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(175,200,216,0.2)',
                display: 'flex', alignItems: 'center', gap: 34, padding: '0 40px'}}>
                <div style={{width: 64, height: 64, borderRadius: 32, background: C.gold, color: C.navy, fontSize: 38, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✓</div>
                <div style={{fontSize: 62, fontWeight: 600}}>{it}</div>
              </div>
              <div style={{position: 'absolute', left: 30, right: 30, bottom: -2, height: 5, borderRadius: 3, background: C.gold, opacity: seam, boxShadow: '0 0 18px #FCCA47'}} />
            </div>
          );
        })}
      </div>
      {items.map((_, i) => <Sfx key={i} at={s + 6 + i * 26 + 16} src="switch-tap" v={0.4} />)}
    </Stage>
  );
};

// ======================= 10. CTA: ring shrink → icon → wordmark lockup =======================
const S10: React.FC = () => {
  const l = L('s10_cta');
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
        <div style={{marginTop: 70, fontSize: 60, fontWeight: 700, color: C.navy, opacity: t1, transform: `translateY(${(1 - t1) * 24}px)`, letterSpacing: -1}}>
          Write to BPC to request your assessment.
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
  s01_hook: S01, s02_nspb: S02, s03_ns: S03, s04_promise: S04, s05_how: S05,
  s06_ns_doc: S06, s07_nspb_doc: S07, s08_recs: S08, s09_get: S09, s10_cta: S10,
};

export const AssessmentVideoV2: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT}}>
      <FontFaces />
      <Audio src={staticFile('audio/tonight-hiphop.mp3')} volume={(fr) => 0.075 * interpolate(fr, [0, 20, TOTAL2 - 75, TOTAL2], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s, i) => {
        const dur = frames(s);
        const Comp = COMPONENTS[s.key];
        const el = (
          <Sequence key={s.key} from={from} durationInFrames={dur} name={s.key}>
            <Comp />
            {s.key !== 's10_cta' && <CornerLogo dark={!LIGHT.has(s.key)} />}
            {s.captions && <Captions lines={s.lines} />}
            <Audio src={staticFile(`vo/${s.key}.wav`)} />
            {i > 0 && <Flash at={0} peak={0.12} />}
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};
