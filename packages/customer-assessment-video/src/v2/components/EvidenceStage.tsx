import React from "react";
import {
  Img,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Video } from "@remotion/media";
import { theme } from "../../theme";

export type Focus = {
  x: number;
  y: number;
  width: number;
  height: number;
  start: number;
  end: number;
  label: string;
  color?: string;
  labelAlign?: "left" | "right";
};

const FocusRect: React.FC<{ focus: Focus }> = ({ focus }) => {
  const frame = useCurrentFrame();
  const color = focus.color ?? theme.gold;
  const opacity = interpolate(
    frame,
    [focus.start - 5, focus.start + 6, focus.end - 7, focus.end],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );
  return (
    <div
      style={{
        position: "absolute",
        left: `${focus.x}%`,
        top: `${focus.y}%`,
        width: `${focus.width}%`,
        height: `${focus.height}%`,
        border: `5px solid ${color}`,
        borderRadius: 12,
        boxShadow: `0 0 0 9999px rgba(15,40,54,${0.12 * opacity})`,
        opacity,
        scale: interpolate(
          frame,
          [focus.start - 5, focus.start + 6],
          [0.97, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        ),
        zIndex: 6,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: focus.labelAlign === "right" ? undefined : -5,
          right: focus.labelAlign === "right" ? -5 : undefined,
          top: -44,
          backgroundColor: color,
          color: color === theme.gold ? theme.navyDeep : theme.white,
          borderRadius:
            focus.labelAlign === "right" ? "9px 9px 0 9px" : "9px 9px 9px 0",
          padding: "8px 13px",
          fontSize: 20,
          fontWeight: 850,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 22px rgba(15,40,54,.22)",
        }}
      >
        {focus.label}
      </div>
    </div>
  );
};

export const EvidenceStage: React.FC<{
  stillSrc: string;
  wide?: boolean;
  focuses?: Focus[];
  videoSrc?: string;
  videoFrames?: number;
  playbackRate?: number;
}> = ({
  stillSrc,
  wide = false,
  focuses = [],
  videoSrc,
  videoFrames = 0,
  playbackRate = 1,
}) => {
  const frame = useCurrentFrame();
  const left = wide ? 72 : 80;
  const top = wide ? 268 : 246;
  const width = wide ? 1250 : 820;
  const height = wide ? 703 : 726;
  const stillOpacity = videoSrc
    ? interpolate(frame, [videoFrames - 8, videoFrames + 5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: 22,
        overflow: "hidden",
        backgroundColor: theme.white,
        border: `2px solid ${theme.line}`,
        boxShadow: "0 22px 54px rgba(15,40,54,.18)",
      }}
    >
      {videoSrc ? (
        <Video
          src={staticFile(videoSrc)}
          playbackRate={playbackRate}
          muted
          objectFit="fill"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: interpolate(
              frame,
              [videoFrames - 6, videoFrames + 3],
              [1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        />
      ) : null}
      <Img
        src={staticFile(stillSrc)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: stillOpacity,
        }}
      />
      {focuses.map((focus) => (
        <FocusRect key={`${focus.label}-${focus.start}`} focus={focus} />
      ))}
    </div>
  );
};

export const SidePanel: React.FC<{
  kicker: string;
  children: React.ReactNode;
  accent?: string;
}> = ({ kicker, children, accent = theme.sage }) => (
  <div
    style={{
      position: "absolute",
      left: 1370,
      top: 286,
      width: 470,
      minHeight: 590,
      backgroundColor: theme.white,
      border: `2px solid ${theme.line}`,
      borderRadius: 22,
      padding: "32px 34px",
      boxShadow: "0 18px 42px rgba(15,40,54,.11)",
    }}
  >
    <div
      style={{
        width: 58,
        height: 7,
        backgroundColor: accent,
        marginBottom: 24,
      }}
    />
    <div
      style={{
        fontSize: 16,
        letterSpacing: 2.8,
        color: accent,
        fontWeight: 850,
        marginBottom: 22,
      }}
    >
      {kicker}
    </div>
    {children}
  </div>
);

export const PortraitSidePanel: React.FC<{
  kicker: string;
  children: React.ReactNode;
  accent?: string;
}> = ({ kicker, children, accent = theme.sage }) => (
  <div
    style={{
      position: "absolute",
      left: 960,
      top: 258,
      width: 860,
      minHeight: 670,
      backgroundColor: theme.white,
      border: `2px solid ${theme.line}`,
      borderRadius: 22,
      padding: "34px 42px",
      boxShadow: "0 18px 42px rgba(15,40,54,.11)",
    }}
  >
    <div
      style={{
        width: 64,
        height: 7,
        backgroundColor: accent,
        marginBottom: 24,
      }}
    />
    <div
      style={{
        fontSize: 16,
        letterSpacing: 2.8,
        color: accent,
        fontWeight: 850,
        marginBottom: 24,
      }}
    >
      {kicker}
    </div>
    {children}
  </div>
);
