import React from "react";
import { Img, staticFile } from "remotion";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

const ReportCard: React.FC<{
  src: string;
  label: string;
  left: number;
  accent: string;
}> = ({ src, label, left, accent }) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 300,
      width: 350,
      height: 580,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: theme.white,
      border: `2px solid ${theme.line}`,
      boxShadow: "0 18px 44px rgba(15,40,54,.14)",
    }}
  >
    <Img
      src={staticFile(src)}
      style={{
        width: "100%",
        height: 455,
        objectFit: "cover",
        objectPosition: "center 18%",
      }}
    />
    <div
      style={{
        height: 125,
        borderTop: `7px solid ${accent}`,
        padding: "25px 24px",
        fontSize: 26,
        lineHeight: 1.2,
        fontWeight: 650,
      }}
    >
      {label}
    </div>
  </div>
);

export const DeliverablesV2: React.FC = () => (
  <V2Shell
    eyebrow="THE DELIVERABLE"
    title="A decision-ready package — not just documentation"
  >
    <ReportCard
      src="stills-v2/cover-current.png"
      label="Current State Assessment"
      left={70}
      accent={theme.sage}
    />
    <ReportCard
      src="stills-v2/cover-performance.png"
      label="NSPB Optimization Review"
      left={455}
      accent={theme.gold}
    />
    <ReportCard
      src="stills-v2/cover-netsuite.png"
      label="NetSuite Account Analysis"
      left={840}
      accent={theme.orange}
    />
    <div
      style={{
        position: "absolute",
        left: 1255,
        top: 300,
        width: 590,
        height: 580,
        borderRadius: 22,
        backgroundColor: theme.navyDeep,
        color: theme.white,
        padding: 42,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: theme.gold,
          letterSpacing: 3.2,
          fontWeight: 900,
        }}
      >
        PRIORITIZED ACTION PLAN
      </div>
      <div style={{ fontSize: 31, lineHeight: 1.58, marginTop: 34 }}>
        ✓ Executive summary
        <br />✓ Evidence-backed findings
        <br />✓ Technical actions
        <br />✓ Functional actions
        <br />✓ Training needs
        <br />✓ Governance decisions
        <br />✓ Practical roadmap
      </div>
    </div>
  </V2Shell>
);
