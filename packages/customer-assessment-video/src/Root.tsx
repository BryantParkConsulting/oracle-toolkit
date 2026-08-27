import "./index.css";
import { AssessmentOverviewV4Composition } from "./v4/AssessmentOverviewV4";
import { DataPreparationGuideComposition } from "./v4/DataPreparationGuide";

export const RemotionRoot: React.FC = () => (
  <>
    <DataPreparationGuideComposition />
    <AssessmentOverviewV4Composition />
  </>
);
