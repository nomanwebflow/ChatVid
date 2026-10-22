import { Composition } from "remotion";
import { ChatComposition } from "../composition/ChatComposition";
import { buildTimeline } from "../timeline";
import { createSampleProject } from "../sampleProject";
import type { Project } from "../types";
import { FPS } from "../types";

// The render target. Duration is derived from the project via the SAME timeline
// engine the preview uses, so export matches preview exactly.
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ChatReel"
      component={ChatComposition as React.FC<Record<string, unknown>>}
      durationInFrames={buildTimeline(createSampleProject()).totalFrames}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ project: createSampleProject() }}
      // recompute duration from the real project passed at render time
      calculateMetadata={({ props }) => {
        const project = (props as { project: Project }).project;
        return { durationInFrames: buildTimeline(project).totalFrames, fps: FPS, width: 1080, height: 1920 };
      }}
    />
  );
};
