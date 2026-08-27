import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const OneDayV2: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <V2Shell
      eyebrow="FAST BY DESIGN"
      title="From secure evidence to a decision-ready assessment"
    >
      <div
        style={{
          position: "absolute",
          left: 88,
          top: 340,
          width: 600,
          height: 510,
          backgroundColor: theme.navyDeep,
          color: theme.white,
          borderRadius: 28,
          padding: 46,
          boxShadow: "0 24px 58px rgba(15,40,54,.2)",
          scale: interpolate(frame, [0, 22], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            fontSize: 21,
            color: theme.gold,
            letterSpacing: 3.2,
            fontWeight: 850,
          }}
        >
          TYPICAL DELIVERY
        </div>
        <div
          style={{
            fontSize: 180,
            lineHeight: 0.9,
            fontWeight: 300,
            marginTop: 42,
          }}
        >
          1
        </div>
        <div style={{ fontSize: 51, fontWeight: 520, marginTop: 20 }}>
          business day
        </div>
        <div
          style={{
            fontSize: 24,
            lineHeight: 1.35,
            color: "#c9ddd6",
            marginTop: 28,
          }}
        >
          After secure access and exports are received.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 790,
          top: 395,
          width: 1040,
          display: "flex",
          alignItems: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            width: 260,
            padding: "32px 28px",
            borderRadius: 22,
            backgroundColor: theme.white,
            border: `2px solid ${theme.line}`,
            fontSize: 30,
            fontWeight: 650,
          }}
        >
          Secure
          <br />
          inputs
        </div>
        <div style={{ fontSize: 48, color: theme.gold }}>→</div>
        <div
          style={{
            width: 260,
            padding: "32px 28px",
            borderRadius: 22,
            backgroundColor: theme.white,
            border: `2px solid ${theme.line}`,
            fontSize: 30,
            fontWeight: 650,
          }}
        >
          Evidence
          <br />
          analysis
        </div>
        <div style={{ fontSize: 48, color: theme.gold }}>→</div>
        <div
          style={{
            width: 260,
            padding: "32px 28px",
            borderRadius: 22,
            backgroundColor: theme.white,
            border: `2px solid ${theme.line}`,
            fontSize: 30,
            fontWeight: 650,
          }}
        >
          Prioritized
          <br />
          roadmap
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 804,
          top: 670,
          width: 1000,
          fontSize: 31,
          lineHeight: 1.45,
          color: theme.muted,
        }}
      >
        A concise engagement designed to establish facts quickly — before larger
        optimization, reactivation, or transformation work begins.
      </div>
    </V2Shell>
  );
};
