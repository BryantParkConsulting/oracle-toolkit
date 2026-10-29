// Shared motion pieces for v2, adapted from video-shotcraft recipes (Apache-2.0, Vincent Wei):
// kanada slam, score slam, marker underline, float-and-land with contact shadow, 3D plane camera, dark stage.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT} from './lib';
import {EASE, Grain, Vignette, bezier, mix, ramp} from './polish';

export {EASE, mix, ramp};
export const easeFall = bezier(0.5, 0.05, 0.6, 1);

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Dark navy stage with soft brand-colour glows, vignette and grain. */
export const Stage: React.FC<{children?: React.ReactNode; glow?: [number, number]}> = ({children, glow = [0.72, 0.22]}) => (
  <AbsoluteFill style={{background: '#0F2A3A', fontFamily: FONT, color: 'white'}}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 55% at ${glow[0] * 100}% ${glow[1] * 100}%, rgba(29,68,90,0.95), transparent 70%),
          radial-gradient(ellipse 45% 40% at 12% 92%, rgba(55,104,88,0.45), transparent 70%),
          radial-gradient(ellipse 30% 25% at 88% 85%, rgba(252,202,71,0.10), transparent 70%)`,
      }}
    />
    {children}
    <Vignette strength={0.5} inner={0.45} color="#081822" />
    <Grain opacity={0.07} blend="soft-light" />
  </AbsoluteFill>
);

export const LightStage: React.FC<{children?: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{background: C.neutral, fontFamily: FONT, color: C.ink}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 60% at 50% 40%, #FBFAF7, transparent 75%)'}} />
    {children}
    <Vignette strength={0.18} inner={0.5} color="#8C8577" />
    <Grain opacity={0.05} />
  </AbsoluteFill>
);

/** Kanada perspective snap: flies in from huge + tilted, lands in 7f, then a short decaying shake. */
export const Slam: React.FC<{from: number; children: React.ReactNode; style?: React.CSSProperties; shake?: number}> = ({from, children, style, shake = 10}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, 7, EASE.snappy);
  if (f < from) return <div style={{...style, opacity: 0}}>{children}</div>;
  const k = f - from - 7;
  const sh = k >= 0 && k < 10 ? Math.sin(k * 2.6) * shake * (1 - k / 10) : 0;
  return (
    <div style={{perspective: 900, ...style}}>
      <div
        style={{
          transform: `translate(${sh}px, ${sh * 0.6}px) scale(${mix(2.8, 1, t)}) rotateX(${mix(-38, 0, t)}deg)`,
          filter: `blur(${(1 - t) * 14}px)`, opacity: Math.min(1, t * 3),
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Score slam: drops from above with squash, lands with a contact shadow. */
export const Drop: React.FC<{from: number; children: React.ReactNode; h?: number}> = ({from, children, h = 220}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, 12, easeFall);
  const land = f - from - 12;
  const squash = land >= 0 && land < 8 ? Math.sin((land / 8) * Math.PI) * 0.08 : 0;
  const y = -(1 - t) * h;
  return (
    <div style={{position: 'relative', opacity: f < from ? 0 : 1}}>
      <div
        style={{
          position: 'absolute', left: '10%', right: '10%', bottom: -18, height: 26, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', filter: `blur(${6 + (1 - t) * 18}px)`, opacity: 0.25 + 0.5 * t, transform: `scaleX(${0.6 + 0.4 * t})`,
        }}
      />
      <div style={{transform: `translateY(${y}px) scale(${1 + squash}, ${1 - squash})`, transformOrigin: '50% 100%'}}>{children}</div>
    </div>
  );
};

/** Hand-drawn gold marker underline (variable width, slight upward slant). */
export const Marker: React.FC<{from: number; width: number; color?: string; dur?: number}> = ({from, width, color = C.gold, dur = 12}) => {
  const f = useCurrentFrame();
  const t = ramp(f, from, dur, EASE.out);
  const L = width * 1.05;
  return (
    <svg width={width} height={40} viewBox={`0 0 ${width} 40`} style={{overflow: 'visible', display: 'block'}}>
      <path d={`M 4 30 C ${width * 0.3} 26, ${width * 0.65} 22, ${width - 4} 16`} stroke={color} strokeWidth={16} strokeLinecap="round" fill="none"
        strokeDasharray={L} strokeDashoffset={L * (1 - t)} opacity={0.95} />
    </svg>
  );
};

/** Element hovering above a surface with a same-shape soft shadow; lands when h -> 0. */
export const Float: React.FC<{h: number; children: React.ReactNode}> = ({h, children}) => (
  <div style={{position: 'relative'}}>
    {h > 1.5 && (
      <div style={{
        position: 'absolute', inset: 0, transform: `translate(${h * 0.22}px, ${h * 0.42}px) scale(${1 + h * 0.0011})`,
        filter: `brightness(0) blur(${2 + h * 0.09}px)`, opacity: Math.min(0.28, 0.1 + h * 0.003), pointerEvents: 'none',
      }}>{children}</div>
    )}
    <div style={{transform: `translate(${-h * 0.34}px, ${-h * 0.78}px)`, filter: h > 1.5 ? `brightness(${1 + Math.min(0.25, h * 0.002)})` : undefined}}>{children}</div>
  </div>
);
export const liftOf = (t: number, land: number, H = 130) => {
  const FALL = 0.32;
  const p = Math.min(1, Math.max(0, (t - (land - FALL)) / FALL));
  return (1 - easeFall(p)) * H;
};

export type Cam = {rx: number; ry: number; rz: number; scale: number; x: [number, number]; y: [number, number]};
/** 3D plane camera: content is translated under a tilted perspective; p = 0..1 travel. */
export const Plane: React.FC<{cam: Cam; p: number; children: React.ReactNode; persp?: number}> = ({cam, p, children, persp = 1100}) => {
  const x = mix(cam.x[0], cam.x[1], p);
  const y = mix(cam.y[0], cam.y[1], p);
  const roll = cam.rz + (p - 0.5) * 2;
  return (
    <AbsoluteFill style={{perspective: persp, perspectiveOrigin: '50% 46%'}}>
      <div style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d',
        transform: `scale(${cam.scale}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) rotateZ(${roll}deg)`}}>
        <div style={{position: 'absolute', transform: `translate3d(${x}px, ${y}px, 0)`}}>
          <div style={{position: 'relative', transform: 'translate(-50%, -50%)'}}>{children}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Cruise curve: eased start/end, constant middle. */
export const cruise = (u: number) => {
  const A = 0.28;
  const k = 1 / (1 - A);
  const part = (x: number) => (x < A ? (x * x) / (2 * A) : x - A / 2);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.5 ? k * part(u) : 1 - k * part(1 - u);
};

/** Screen-space depth of field: blurred copy outside a focus ellipse. */
export const DoF: React.FC<{children: React.ReactNode; fx?: number; fy?: number; blur?: number}> = ({children, fx = 50, fy = 48, blur = 12}) => (
  <AbsoluteFill>
    {children}
    <AbsoluteFill style={{
      filter: `blur(${blur}px)`,
      WebkitMaskImage: `radial-gradient(ellipse 60% 55% at ${fx}% ${fy}%, transparent 38%, rgba(0,0,0,0.85) 75%, black 95%)`,
      maskImage: `radial-gradient(ellipse 60% 55% at ${fx}% ${fy}%, transparent 38%, rgba(0,0,0,0.85) 75%, black 95%)`,
    }}>{children}</AbsoluteFill>
  </AbsoluteFill>
);

/** White flash over a cut: peaks at `at`. */
export const Flash: React.FC<{at: number; color?: string; peak?: number}> = ({at, color = '#FFF8E6', peak = 0.85}) => {
  const f = useCurrentFrame();
  const d = Math.abs(f - at);
  if (d > 5) return null;
  return <AbsoluteFill style={{background: color, opacity: peak * (1 - d / 5), pointerEvents: 'none'}} />;
};
