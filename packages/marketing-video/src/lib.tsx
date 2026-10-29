import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

// BPC 2026 brand (from Juan Krevisky's bpc-demo-video skill)
export const C = {
  navy: '#1D445A',
  navyDeep: '#163647',
  gold: '#FCCA47',
  green: '#376858',
  blueLight: '#AFC8D8',
  greenLight: '#E5ECE8',
  goldLight: '#FFF1C9',
  neutral: '#F3F1ED',
  ink: '#1B2B34',
  muted: '#5B6B74',
  orange: '#D9822B',
};
export const FONT = 'GoogleSansFlex';

export const FontFaces: React.FC = () => (
  <style>{`
    @font-face{font-family:${FONT};src:url(${staticFile('fonts/GoogleSansFlex-Light.ttf')});font-weight:300}
    @font-face{font-family:${FONT};src:url(${staticFile('fonts/GoogleSansFlex-Regular.ttf')});font-weight:400}
    @font-face{font-family:${FONT};src:url(${staticFile('fonts/GoogleSansFlex-Medium.ttf')});font-weight:500}
    @font-face{font-family:${FONT};src:url(${staticFile('fonts/GoogleSansFlex-SemiBold.ttf')});font-weight:600}
    @font-face{font-family:${FONT};src:url(${staticFile('fonts/GoogleSansFlex-Bold.ttf')});font-weight:700}
  `}</style>
);

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0..1 progress of an entrance starting at `from` lasting `dur` frames. */
export const useIn = (from: number, dur = 18) => {
  const f = useCurrentFrame();
  return interpolate(f, [from, from + dur], [0, 1], {...clamp, easing: ease});
};

export const Bg: React.FC<{dark?: boolean; children?: React.ReactNode}> = ({dark, children}) => (
  <AbsoluteFill style={{background: dark ? C.navy : C.neutral, fontFamily: FONT, color: dark ? 'white' : C.ink}}>
    {dark && (
      <AbsoluteFill
        style={{background: `radial-gradient(ellipse at 75% 20%, rgba(175,200,216,0.16), transparent 55%), radial-gradient(ellipse at 10% 100%, rgba(55,104,88,0.35), transparent 50%)`}}
      />
    )}
    {children}
  </AbsoluteFill>
);

/** Corner logo on every frame: full-colour on light, white wordmark on navy (brand rule). */
export const CornerLogo: React.FC<{dark?: boolean}> = ({dark}) => (
  <Img
    src={staticFile(dark ? 'brand/bpc_wordmark_2026_white.png' : 'brand/bpc_logo_2026.png')}
    style={{position: 'absolute', top: 44, right: 56, height: dark ? 40 : 46, opacity: 0.95}}
  />
);

export const Eyebrow: React.FC<{children: React.ReactNode; from?: number; dark?: boolean}> = ({children, from = 0, dark}) => {
  const p = useIn(from, 16);
  return (
    <div
      style={{
        fontSize: 22, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase',
        color: dark ? C.gold : C.green, opacity: p, transform: `translateY(${(1 - p) * 14}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Word-by-word rise. Words wrapped in *stars* are gold. */
export const Words: React.FC<{text: string; from: number; stagger?: number; size: number; weight?: number; color?: string; accent?: string}> = ({
  text, from, stagger = 4, size, weight = 500, color, accent = C.gold,
}) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div style={{fontSize: size, fontWeight: weight, lineHeight: 1.12, letterSpacing: -size * 0.02, color}}>
      {words.map((w, i) => {
        const hot = w.startsWith('*');
        const clean = w.replace(/\*/g, '');
        const p = interpolate(f, [from + i * stagger, from + i * stagger + 16], [0, 1], {...clamp, easing: ease});
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', marginRight: size * 0.26}}>
            <span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 105}%)`, color: hot ? accent : undefined}}>{clean}</span>
          </span>
        );
      })}
    </div>
  );
};

/** Punch-in word (scale 1.6 -> 1 with overshoot). */
export const Punch: React.FC<{children: React.ReactNode; from: number; style?: React.CSSProperties}> = ({children, from, style}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - from, fps, config: {damping: 13, stiffness: 160, mass: 0.7}});
  const o = interpolate(f, [from, from + 5], [0, 1], clamp);
  return <div style={{transform: `scale(${1.6 - 0.6 * s})`, opacity: o, ...style}}>{children}</div>;
};

/** Counter that rolls from 0 to `to`. */
export const Count: React.FC<{to: number; from: number; dur?: number; format?: (n: number) => string}> = ({to, from, dur = 30, format}) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [from, from + dur], [0, to], {...clamp, easing: Easing.out(Easing.cubic)});
  const n = Math.round(v);
  return <>{format ? format(n) : n.toLocaleString('en-US')}</>;
};

/** Sweep underline in gold. */
export const Underline: React.FC<{from: number; width: number; color?: string}> = ({from, width, color = C.gold}) => {
  const p = useIn(from, 20);
  return <div style={{height: 8, width: width * p, background: color, borderRadius: 4, marginTop: 10}} />;
};

/** Mask reveal line. */
export const MaskLine: React.FC<{children: React.ReactNode; from: number; style?: React.CSSProperties}> = ({children, from, style}) => {
  const p = useIn(from, 22);
  return (
    <div style={{overflow: 'hidden', ...style}}>
      <div style={{transform: `translateY(${(1 - p) * 110}%)`}}>{children}</div>
    </div>
  );
};

export type Box = [number, number, number, number]; // x0,y0,x1,y1 as page fractions
export type CamKey = {f: number; cx: number; cy: number; w: number};

/**
 * Document camera: shows a rendered PDF page and flies between keyframes.
 * w = fraction of page width visible across the 1920px frame.
 */
export const DocCam: React.FC<{
  src: string; pageW: number; pageH: number; keys: CamKey[]; highlights?: {box: Box; from: number; to?: number}[]; shadow?: boolean;
}> = ({src, pageW, pageH, keys, highlights = [], shadow = true}) => {
  const f = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const opt = {...clamp, easing: easeInOut};
  const cx = interpolate(f, fs, keys.map((k) => k.cx), opt);
  const cy = interpolate(f, fs, keys.map((k) => k.cy), opt);
  const w = interpolate(f, fs, keys.map((k) => k.w), opt);
  const scale = 1920 / (w * pageW);
  const tx = 960 - cx * pageW * scale;
  const ty = 540 - cy * pageH * scale;
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: pageW, height: pageH, transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          boxShadow: shadow ? `0 ${30 / scale}px ${90 / scale}px rgba(10,30,40,0.35)` : undefined,
          background: 'white',
        }}
      >
        <Img src={staticFile(src)} style={{width: pageW, height: pageH, display: 'block'}} />
        {highlights.map((h, i) => {
          const pin = interpolate(f, [h.from, h.from + 12], [0, 1], {...clamp, easing: ease});
          const pout = h.to ? interpolate(f, [h.to, h.to + 10], [1, 0], clamp) : 1;
          const o = pin * pout;
          const [x0, y0, x1, y1] = h.box;
          const pad = 0.006 * pageW;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x0 * pageW - pad, top: y0 * pageH - pad,
                width: (x1 - x0) * pageW + 2 * pad, height: (y1 - y0) * pageH + 2 * pad,
                border: `${5 / scale}px solid ${C.gold}`, borderRadius: 10 / scale,
                boxShadow: `0 0 0 ${4000}px rgba(22,54,71,${0.45 * o})`, opacity: o,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Insight card that slides in from the left over a DocCam. */
export const Insight: React.FC<{from: number; to?: number; eyebrow: string; title: React.ReactNode; y?: number; right?: boolean}> = ({
  from, to, eyebrow, title, y = 640, right,
}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [from, from + 18], [0, 1], {...clamp, easing: ease});
  const out = to ? interpolate(f, [to, to + 12], [0, 1], {...clamp, easing: ease}) : 0;
  const dx = (1 - p) * -60 + out * -60;
  return (
    <div
      style={{
        position: 'absolute', top: y, [right ? 'right' : 'left']: 80, width: 620, padding: '28px 34px',
        background: C.navy, color: 'white', borderRadius: 18, borderLeft: `8px solid ${C.gold}`,
        boxShadow: '0 24px 60px rgba(10,30,40,0.35)', opacity: p * (1 - out),
        transform: `translateX(${right ? -dx : dx}px)`, fontFamily: FONT,
      }}
    >
      <div style={{fontSize: 20, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.gold}}>{eyebrow}</div>
      <div style={{fontSize: 40, fontWeight: 500, lineHeight: 1.18, marginTop: 10}}>{title}</div>
    </div>
  );
};

export type Line = {text: string; start: number; end: number};

/** Burned-in captions, one line at a time. */
export const Captions: React.FC<{lines: Line[]}> = ({lines}) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const cur = lines.find((l, i) => t >= l.start - 0.05 && t < (lines[i + 1]?.start ?? l.end + 0.6));
  if (!cur) return null;
  const p = interpolate(t, [cur.start - 0.05, cur.start + 0.2], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', bottom: 54, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p}}>
      <div
        style={{
          maxWidth: 1500, padding: '14px 30px', borderRadius: 12, background: 'rgba(22,54,71,0.88)', color: 'white',
          fontFamily: FONT, fontSize: 34, fontWeight: 500, lineHeight: 1.3, textAlign: 'center',
        }}
      >
        {cur.text}
      </div>
    </div>
  );
};

/** t (seconds) of line i in a scene -> frame. */
export const at = (lines: Line[], i: number, offset = 0) => Math.round((lines[i]?.start ?? 0) * 30 + offset);
