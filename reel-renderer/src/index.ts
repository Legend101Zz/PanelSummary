/**
 * index.ts — Remotion Entry Point
 *
 * Registers the ReelComposition with Remotion.
 * The CLI uses this to find what to render.
 */

import { registerRoot } from "remotion";
import { Composition } from "remotion";
import React from "react";
import { ReelComposition } from "./ReelComposition";

const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ReelComposition"
        component={ReelComposition}
        // These are defaults — overridden by CLI flags
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={900} // 30s default, overridden by --frames
        defaultProps={{}}
      />
    </>
  );
};

registerRoot(Root);
