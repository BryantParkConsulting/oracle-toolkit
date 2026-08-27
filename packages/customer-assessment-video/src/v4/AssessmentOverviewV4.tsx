import React from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BusinessImpactV2 } from "../v2/scenes/BusinessImpactV2";
import { ClassificationV2 } from "../v2/scenes/ClassificationV2";
import { ClosingV2 } from "../v2/scenes/ClosingV2";
import { DeliverablesV2 } from "../v2/scenes/DeliverablesV2";
import { InputsV2 } from "../v2/scenes/InputsV2";
import { NetSuiteAnalysisV2 } from "../v2/scenes/NetSuiteAnalysisV2";
import { NspbInventoryV2 } from "../v2/scenes/NspbInventoryV2";
import { OneDayV2 } from "../v2/scenes/OneDayV2";
import { PerformanceV2 } from "../v2/scenes/PerformanceV2";
import { QuestionsV2 } from "../v2/scenes/QuestionsV2";
import { RecommendationsV2 } from "../v2/scenes/RecommendationsV2";
import { ServiceIntroV2 } from "../v2/scenes/ServiceIntroV2";
import { V2Shell } from "../v2/components/V2Shell";
import { theme } from "../theme";

const EvidenceVsConfiguration: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = (start: number) => ({
    opacity: interpolate(frame, [start, start + 18], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    transform: `translateY(${interpolate(frame, [start, start + 18], [22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })}px)`,
  });

  return (
    <V2Shell
      eyebrow="EVIDENCE, NOT ASSUMPTIONS"
      title="Configured does not automatically mean used"
    >
      <div
        style={{
          position: "absolute",
          left: 86,
          top: 345,
          width: 500,
          height: 455,
          padding: 40,
          borderRadius: 28,
          backgroundColor: theme.white,
          border: `3px solid ${theme.line}`,
          boxShadow: "0 20px 48px rgba(15,40,54,.12)",
          ...reveal(5),
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: theme.sage,
            letterSpacing: 3.2,
            fontWeight: 900,
          }}
        >
          CONFIGURATION
        </div>
        <div
          style={{
            fontSize: 51,
            lineHeight: 1.04,
            marginTop: 32,
            fontWeight: 520,
          }}
        >
          What exists
        </div>
        <div
          style={{
            width: 70,
            height: 7,
            backgroundColor: theme.sage,
            margin: "28px 0",
          }}
        />
        <div style={{ fontSize: 28, lineHeight: 1.5, color: theme.muted }}>
          Enabled features
          <br />
          Application artifacts
          <br />
          Security and setup
          <br />
          Connected systems
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 710,
          top: 345,
          width: 500,
          height: 455,
          padding: 40,
          borderRadius: 28,
          backgroundColor: theme.white,
          border: `3px solid ${theme.gold}`,
          boxShadow: "0 20px 48px rgba(15,40,54,.12)",
          ...reveal(55),
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: "#a77b00",
            letterSpacing: 3.2,
            fontWeight: 900,
          }}
        >
          OPERATIONAL EVIDENCE
        </div>
        <div
          style={{
            fontSize: 51,
            lineHeight: 1.04,
            marginTop: 32,
            fontWeight: 520,
          }}
        >
          What happens
        </div>
        <div
          style={{
            width: 70,
            height: 7,
            backgroundColor: theme.gold,
            margin: "28px 0",
          }}
        />
        <div style={{ fontSize: 28, lineHeight: 1.5, color: theme.muted }}>
          Transactions and data
          <br />
          User activity
          <br />
          Jobs and calculations
          <br />
          Recent adoption
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1332,
          top: 345,
          width: 500,
          height: 455,
          padding: 40,
          borderRadius: 28,
          backgroundColor: theme.navyDeep,
          color: theme.white,
          boxShadow: "0 24px 54px rgba(15,40,54,.24)",
          ...reveal(110),
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
          ASSESSMENT STATUS
        </div>
        <div
          style={{
            fontSize: 51,
            lineHeight: 1.04,
            marginTop: 32,
            fontWeight: 520,
          }}
        >
          What it means
        </div>
        <div
          style={{
            width: 70,
            height: 7,
            backgroundColor: theme.orange,
            margin: "28px 0",
          }}
        />
        <div style={{ fontSize: 28, lineHeight: 1.5, color: "#d7e6e1" }}>
          Working
          <br />
          Partially adopted
          <br />
          Dormant
          <br />
          Ready to improve
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 585,
          top: 555,
          width: 125,
          height: 7,
          backgroundColor: theme.gold,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1210,
          top: 555,
          width: 122,
          height: 7,
          backgroundColor: theme.orange,
        }}
      />
    </V2Shell>
  );
};

const UseCases: React.FC = () => (
  <V2Shell
    eyebrow="WHEN TO USE THE ASSESSMENT"
    title="A practical starting point for the next planning decision"
  >
    <div
      style={{
        position: "absolute",
        left: 82,
        top: 340,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 34,
        width: 1756,
      }}
    >
      {[
        {
          number: "01",
          title: "Return to NSPB",
          detail:
            "Re-establish ownership, adoption, training, and reliable operating routines.",
          color: theme.sage,
        },
        {
          number: "02",
          title: "Prepare a budget cycle",
          detail:
            "Know what must be refreshed before teams begin the next planning process.",
          color: theme.gold,
        },
        {
          number: "03",
          title: "Prioritize investment",
          detail:
            "Decide what to enable, optimize, simplify, retire, or govern differently.",
          color: theme.orange,
        },
      ].map((item) => (
        <div
          key={item.number}
          style={{
            height: 480,
            borderRadius: 28,
            backgroundColor: theme.white,
            border: `2px solid ${theme.line}`,
            borderTop: `10px solid ${item.color}`,
            padding: 42,
            boxShadow: "0 20px 48px rgba(15,40,54,.12)",
          }}
        >
          <div
            style={{
              fontSize: 19,
              letterSpacing: 3.2,
              fontWeight: 900,
              color: item.color,
            }}
          >
            {item.number}
          </div>
          <div
            style={{
              fontSize: 48,
              lineHeight: 1.06,
              fontWeight: 540,
              marginTop: 40,
            }}
          >
            {item.title}
          </div>
          <div
            style={{
              width: 68,
              height: 7,
              backgroundColor: item.color,
              margin: "30px 0",
            }}
          />
          <div style={{ fontSize: 28, lineHeight: 1.48, color: theme.muted }}>
            {item.detail}
          </div>
        </div>
      ))}
    </div>
  </V2Shell>
);

export const AssessmentOverviewV4: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/assessment-overview.mp3")} volume={1} />
    <Series>
      <Series.Sequence name="01 · Introduction" durationInFrames={262}>
        <ServiceIntroV2 />
      </Series.Sequence>
      <Series.Sequence name="02 · Three questions" durationInFrames={277}>
        <QuestionsV2 />
      </Series.Sequence>
      <Series.Sequence name="03 · Secure inputs" durationInFrames={162}>
        <InputsV2 />
      </Series.Sequence>
      <Series.Sequence name="04 · One business day" durationInFrames={197}>
        <OneDayV2 />
      </Series.Sequence>
      <Series.Sequence name="05 · NSPB inventory" durationInFrames={293}>
        <NspbInventoryV2 />
      </Series.Sequence>
      <Series.Sequence name="06 · Usage classification" durationInFrames={193}>
        <ClassificationV2 />
      </Series.Sequence>
      <Series.Sequence name="07 · NetSuite analysis" durationInFrames={374}>
        <NetSuiteAnalysisV2 />
      </Series.Sequence>
      <Series.Sequence
        name="08 · Configuration versus usage"
        durationInFrames={468}
      >
        <EvidenceVsConfiguration />
      </Series.Sequence>
      <Series.Sequence name="09 · Performance" durationInFrames={332}>
        <PerformanceV2 />
      </Series.Sequence>
      <Series.Sequence name="10 · Recommendations" durationInFrames={361}>
        <RecommendationsV2 />
      </Series.Sequence>
      <Series.Sequence name="11 · Business impact" durationInFrames={331}>
        <BusinessImpactV2 />
      </Series.Sequence>
      <Series.Sequence name="12 · Deliverables" durationInFrames={313}>
        <DeliverablesV2 />
      </Series.Sequence>
      <Series.Sequence name="13 · Use cases" durationInFrames={323}>
        <UseCases />
      </Series.Sequence>
      <Series.Sequence name="14 · Closing" durationInFrames={282}>
        <ClosingV2 />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const AssessmentOverviewV4Composition = () => (
  <Composition
    id="BPC-Customer-Assessment-Overview"
    component={AssessmentOverviewV4}
    durationInFrames={4168}
    fps={30}
    width={1920}
    height={1080}
  />
);
