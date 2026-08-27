import React from "react";
import { EvidenceStage, PortraitSidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const RecommendationsV2: React.FC = () => (
  <V2Shell
    eyebrow="BUSINESS-ALIGNED RECOMMENDATIONS"
    title="Turn technical evidence into decisions that fit the operating model"
  >
    <EvidenceStage
      stillSrc="stills-v2/netsuite-recommendations.png"
      focuses={[
        {
          x: 19.4,
          y: 13.5,
          width: 59,
          height: 57.5,
          start: 5,
          end: 257,
          label: "Finding · recommendation · business impact",
          color: theme.orange,
        },
      ]}
    />
    <PortraitSidePanel kicker="DECISION OPTIONS" accent={theme.orange}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ fontSize: 38, fontWeight: 560 }}>Enable</div>
        <div style={{ fontSize: 38, fontWeight: 560 }}>Consolidate</div>
        <div style={{ fontSize: 38, fontWeight: 560 }}>Clean up</div>
        <div style={{ fontSize: 38, fontWeight: 560 }}>Retire</div>
      </div>
      <div
        style={{
          marginTop: 44,
          borderTop: `2px solid ${theme.line}`,
          paddingTop: 30,
          fontSize: 28,
          lineHeight: 1.48,
          color: theme.muted,
        }}
      >
        Recommendations are shaped by the client's industry, revenue model,
        operating structure, and planning needs.
      </div>
    </PortraitSidePanel>
  </V2Shell>
);
