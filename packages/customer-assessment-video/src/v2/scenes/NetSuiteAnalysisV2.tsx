import React from "react";
import { EvidenceStage, PortraitSidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const NetSuiteAnalysisV2: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE ACCOUNT ANALYSIS"
    title="Measure module status with transaction and configuration evidence"
  >
    <EvidenceStage
      stillSrc="stills-v2/netsuite-landscape.png"
      focuses={[
        {
          x: 19.5,
          y: 8.2,
          width: 58.2,
          height: 4.8,
          start: 6,
          end: 135,
          label: "Status summary",
          color: theme.sage,
        },
        {
          x: 19.2,
          y: 67.5,
          width: 59,
          height: 28.5,
          start: 130,
          end: 324,
          label: "Partial · not used · not enabled",
          color: theme.orange,
        },
      ]}
    />
    <PortraitSidePanel kicker="WHAT THE ANALYSIS CONNECTS">
      <div style={{ fontSize: 31, lineHeight: 1.5 }}>
        Enabled modules
        <br />
        Actual transaction activity
        <br />
        Chart of accounts
        <br />
        Customizations and scripts
        <br />
        Connected applications
        <br />
        Planning readiness
      </div>
      <div
        style={{
          marginTop: 34,
          padding: 22,
          borderRadius: 16,
          backgroundColor: theme.sagePale,
          fontSize: 25,
          lineHeight: 1.4,
        }}
      >
        Every status is paired with the evidence behind it.
      </div>
    </PortraitSidePanel>
  </V2Shell>
);
