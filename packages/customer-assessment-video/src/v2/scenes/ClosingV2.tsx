import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Brand } from "../../components/Brand";
import { fontFamily, theme } from "../../theme";

export const ClosingV2: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.navyDeep,
        color: theme.white,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 56, left: 74 }}>
        <Brand light />
      </div>
      <div
        style={{
          position: "absolute",
          right: -180,
          top: -250,
          width: 780,
          height: 780,
          borderRadius: 999,
          backgroundColor: theme.sage,
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 80,
          bottom: -330,
          width: 700,
          height: 700,
          borderRadius: 999,
          backgroundColor: theme.gold,
          opacity: 0.66,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 115,
          top: 260,
          width: 1200,
          opacity: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: theme.gold,
            fontWeight: 900,
            letterSpacing: 4,
          }}
        >
          YOU PROVIDE THE SECURE EXPORTS
        </div>
        <div
          style={{
            fontSize: 78,
            lineHeight: 1.03,
            letterSpacing: -3,
            fontWeight: 380,
            marginTop: 34,
          }}
        >
          We turn them into clarity —<br />
          within one business day.
        </div>
        <div
          style={{
            width: 110,
            height: 8,
            backgroundColor: theme.gold,
            margin: "34px 0",
          }}
        />
        <div style={{ fontSize: 34, color: "#d7e6e1" }}>
          A confident next step for NetSuite and NSPB.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 116,
          bottom: 74,
          fontSize: 20,
          color: "#abc3ba",
        }}
      >
        bryantparkconsulting.com · Customer Assessment
      </div>
    </AbsoluteFill>
  );
};
