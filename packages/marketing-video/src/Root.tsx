import {Composition} from 'remotion';
import {AssessmentVideo, TOTAL} from './Video';
import {AssessmentVideoV2, TOTAL2} from './V2';
import {WorkforceVideo, TOTAL_WF} from './WF';
import {ManagedServicesVideo, TOTAL_MS} from './MS';

export const Root: React.FC = () => (
  <>
    <Composition id="Assessments" component={AssessmentVideo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="AssessmentsV2" component={AssessmentVideoV2} durationInFrames={TOTAL2} fps={30} width={1920} height={1080} />
    <Composition id="Workforce" component={WorkforceVideo} durationInFrames={TOTAL_WF} fps={30} width={1920} height={1080} />
    <Composition id="ManagedServices" component={ManagedServicesVideo} durationInFrames={TOTAL_MS} fps={30} width={1920} height={1080} />
  </>
);
