import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Brand } from "../../components/Brand";
import { fontFamily, theme } from "../../theme";

export const V2Shell: React.FC<{
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}> = ({ eyebrow, title, children, dark = false }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: dark ? theme.navyDeep : theme.paper,
        color: dark ? theme.white : theme.ink,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 38, left: 72, zIndex: 10 }}>
        <Brand light={dark} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 48,
          right: 74,
          fontSize: 15,
          letterSpacing: 3.2,
          color: dark ? "#c9ddd6" : theme.sage,
          fontWeight: 800,
        }}
      >
        CUSTOMER ASSESSMENT
      </div>
      <div
        style={{
          position: "absolute",
          top: 104,
          left: 72,
          right: 72,
          height: 4,
          backgroundColor: dark ? theme.sage : theme.navy,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 132,
          left: 78,
          right: 78,
          zIndex: 8,
        }}
      >
        <div
          style={{
            fontSize: 16,
            letterSpacing: 3.4,
            color: theme.sage,
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontSize: 50,
            lineHeight: 1.02,
            fontWeight: 420,
            letterSpacing: -1.8,
            opacity: interpolate(frame, [0, 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0, 16], ["0px 14px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {title}
        </div>
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 74,
          right: 74,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          color: dark ? "#abc3ba" : theme.muted,
        }}
      >
        <span>Bryant Park Consulting · Evidence-led assessment</span>
        <span>NetSuite ERP · Oracle NSPB</span>
      </div>
    </AbsoluteFill>
  );
};
