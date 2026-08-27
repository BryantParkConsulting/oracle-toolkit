import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Composition, Series, staticFile } from "remotion";
import { BusinessImpactV2 } from "./scenes/BusinessImpactV2";
import { ClassificationV2 } from "./scenes/ClassificationV2";
import { ClosingV2 } from "./scenes/ClosingV2";
import { ConnectV2 } from "./scenes/ConnectV2";
import { DeeperEvidenceV2 } from "./scenes/DeeperEvidenceV2";
import { DeliverablesV2 } from "./scenes/DeliverablesV2";
import { InputsV2 } from "./scenes/InputsV2";
import { MigrationV2 } from "./scenes/MigrationV2";
import { NetSuiteAnalysisV2 } from "./scenes/NetSuiteAnalysisV2";
import { NspbInventoryV2 } from "./scenes/NspbInventoryV2";
import { OneDayV2 } from "./scenes/OneDayV2";
import { PerformanceV2 } from "./scenes/PerformanceV2";
import { QuestionsV2 } from "./scenes/QuestionsV2";
import { RecommendationsV2 } from "./scenes/RecommendationsV2";
import { ServiceIntroV2 } from "./scenes/ServiceIntroV2";
import { TokenSafeV2 } from "./scenes/TokenSafeV2";
import { TokenSetupV2 } from "./scenes/TokenSetupV2";

export const AssessmentVideoV2: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/voiceover-v2.mp3")} volume={1} />
    <Series>
      <Series.Sequence name="01 · Service introduction" durationInFrames={262}>
        <ServiceIntroV2 />
      </Series.Sequence>
      <Series.Sequence name="02 · Three questions" durationInFrames={196}>
        <QuestionsV2 />
      </Series.Sequence>
      <Series.Sequence name="03 · One business day" durationInFrames={235}>
        <OneDayV2 />
      </Series.Sequence>
      <Series.Sequence name="04 · Two controlled inputs" durationInFrames={245}>
        <InputsV2 />
      </Series.Sequence>
      <Series.Sequence name="05 · NetSuite token setup" durationInFrames={272}>
        <TokenSetupV2 />
      </Series.Sequence>
      <Series.Sequence name="06 · Secure token handoff" durationInFrames={151}>
        <TokenSafeV2 />
      </Series.Sequence>
      <Series.Sequence
        name="07 · NSPB Migration snapshot"
        durationInFrames={216}
      >
        <MigrationV2 />
      </Series.Sequence>
      <Series.Sequence name="08 · Deeper evidence" durationInFrames={354}>
        <DeeperEvidenceV2 />
      </Series.Sequence>
      <Series.Sequence name="09 · Connected evidence" durationInFrames={115}>
        <ConnectV2 />
      </Series.Sequence>
      <Series.Sequence name="10 · NSPB inventory" durationInFrames={303}>
        <NspbInventoryV2 />
      </Series.Sequence>
      <Series.Sequence name="11 · Usage classification" durationInFrames={171}>
        <ClassificationV2 />
      </Series.Sequence>
      <Series.Sequence name="12 · NetSuite analysis" durationInFrames={325}>
        <NetSuiteAnalysisV2 />
      </Series.Sequence>
      <Series.Sequence name="13 · Recommendations" durationInFrames={258}>
        <RecommendationsV2 />
      </Series.Sequence>
      <Series.Sequence name="14 · Performance review" durationInFrames={303}>
        <PerformanceV2 />
      </Series.Sequence>
      <Series.Sequence name="15 · Business impact" durationInFrames={316}>
        <BusinessImpactV2 />
      </Series.Sequence>
      <Series.Sequence name="16 · Deliverables" durationInFrames={281}>
        <DeliverablesV2 />
      </Series.Sequence>
      <Series.Sequence name="17 · Closing" durationInFrames={259}>
        <ClosingV2 />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const V2Composition = () => (
  <Composition
    id="BPC-Customer-Assessment-V2"
    component={AssessmentVideoV2}
    durationInFrames={4262}
    fps={30}
    width={1920}
    height={1080}
  />
);
