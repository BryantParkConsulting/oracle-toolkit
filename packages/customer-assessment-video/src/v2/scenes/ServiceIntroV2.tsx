import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Brand } from "../../components/Brand";
import { fontFamily, theme } from "../../theme";

export const ServiceIntroV2: React.FC = () => {
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
      <div style={{ position: "absolute", top: 54, left: 74, zIndex: 8 }}>
        <Brand light />
      </div>
      <div
        style={{
          position: "absolute",
          right: -180,
          top: -260,
          width: 900,
          height: 900,
          borderRadius: 999,
          backgroundColor: theme.sage,
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 150,
          top: 340,
          width: 560,
          height: 560,
          borderRadius: 999,
          backgroundColor: theme.gold,
          opacity: 0.62,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -120,
          bottom: -260,
          width: 630,
          height: 630,
          borderRadius: 999,
          backgroundColor: theme.orange,
          opacity: 0.58,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 250,
          width: 1120,
          opacity: interpolate(frame, [4, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [4, 28], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontSize: 19,
            letterSpacing: 4.8,
            color: theme.gold,
            fontWeight: 850,
            marginBottom: 28,
          }}
        >
          BRYANT PARK CONSULTING INTRODUCES
        </div>
        <div
          style={{
            fontSize: 98,
            lineHeight: 0.96,
            letterSpacing: -4.5,
            fontWeight: 380,
          }}
        >
          Customer
          <br />
          Assessments
        </div>
        <div
          style={{
            width: 116,
            height: 8,
            backgroundColor: theme.gold,
            marginTop: 34,
            marginBottom: 30,
          }}
        />
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.35,
            color: "#d7e6e1",
            maxWidth: 980,
          }}
        >
          A fast, evidence-led review of NetSuite ERP and Oracle NSPB.
        </div>
      </div>
    </AbsoluteFill>
  );
};
