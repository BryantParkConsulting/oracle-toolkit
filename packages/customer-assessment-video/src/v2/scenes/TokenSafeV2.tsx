import React from "react";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { StepRail } from "../components/StepRail";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const TokenSafeV2: React.FC = () => (
  <V2Shell
    eyebrow="SECURITY BY DESIGN"
    title="Create the token — then transfer it securely"
  >
    <EvidenceStage
      stillSrc="stills-v2/token-result.png"
      wide
      focuses={[
        {
          x: 16.7,
          y: 53.6,
          width: 21.7,
          height: 8.2,
          start: 235,
          end: 507,
          label: "CENSORED · Token ID and Token Secret",
          color: theme.orange,
        },
      ]}
    />
    <SidePanel kicker="SECURE HANDOFF" accent={theme.orange}>
      <StepRail
        accent={theme.orange}
        steps={[
          {
            number: "3",
            title: "Create the access token",
            detail:
              "Use the dedicated integration, read-only role, and approved user.",
            start: 0,
            end: 245,
          },
          {
            number: "4",
            title: "Copy and transfer once",
            detail:
              "Send Token ID and Token Secret through the approved secure channel — never by email.",
            start: 245,
            end: 507,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);
