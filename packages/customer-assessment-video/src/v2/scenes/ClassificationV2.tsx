import React from "react";
import { EvidenceStage, PortraitSidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const ClassificationV2: React.FC = () => (
  <V2Shell
    eyebrow="USAGE CLASSIFICATION"
    title="Installed is not the same as active"
  >
    <EvidenceStage
      stillSrc="stills-v2/current-usage.png"
      focuses={[
        {
          x: 18.5,
          y: 21,
          width: 60.2,
          height: 39,
          start: 4,
          end: 170,
          label: "Real usage by cube, year, and scenario",
          color: theme.gold,
        },
      ]}
    />
    <PortraitSidePanel kicker="EVIDENCE-BASED STATUS" accent={theme.gold}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.sagePale,
            fontSize: 31,
            fontWeight: 650,
          }}
        >
          Active
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.goldPale,
            fontSize: 31,
            fontWeight: 650,
          }}
        >
          Partially used
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.orangePale,
            fontSize: 31,
            fontWeight: 650,
          }}
        >
          Dormant
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: "#edf0f1",
            fontSize: 31,
            fontWeight: 650,
          }}
        >
          No longer relevant
        </div>
      </div>
      <div
        style={{
          marginTop: 38,
          fontSize: 28,
          lineHeight: 1.46,
          color: theme.muted,
        }}
      >
        Configuration tells us what exists. Audit and data evidence tell us what
        is actually used.
      </div>
    </PortraitSidePanel>
  </V2Shell>
);
