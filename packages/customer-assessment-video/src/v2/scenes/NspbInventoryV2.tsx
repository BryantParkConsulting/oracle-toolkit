import React from "react";
import { EvidenceStage, PortraitSidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const NspbInventoryV2: React.FC = () => (
  <V2Shell
    eyebrow="NSPB CURRENT STATE"
    title="Inventory the application before recommending change"
  >
    <EvidenceStage
      stillSrc="stills-v2/current-summary.png"
      focuses={[
        {
          x: 18.5,
          y: 28,
          width: 60,
          height: 39,
          start: 10,
          end: 302,
          label: "Executive findings",
          color: theme.sage,
        },
      ]}
    />
    <PortraitSidePanel kicker="WHAT WE INVENTORY">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          fontSize: 29,
          lineHeight: 1.2,
        }}
      >
        <div>Dimensions</div>
        <div>Forms</div>
        <div>Business rules</div>
        <div>Cubes</div>
        <div>Dashboards</div>
        <div>Integrations</div>
        <div>Scheduled jobs</div>
        <div>Security</div>
      </div>
      <div
        style={{
          marginTop: 42,
          borderTop: `2px solid ${theme.line}`,
          paddingTop: 30,
          fontSize: 27,
          lineHeight: 1.45,
          color: theme.muted,
        }}
      >
        The report begins with evidence, not assumptions.
      </div>
    </PortraitSidePanel>
  </V2Shell>
);
