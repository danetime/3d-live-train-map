/**
 * Full-screen pixelation pass — the step that turns the isometric 3D scene
 * into isometric *pixel art*. It renders the scene into a small buffer and
 * upscales it with hard (nearest-neighbour) edges, and adds a subtle outline
 * on geometry/depth edges for that crisp hand-placed-pixel feel.
 *
 * Implemented with three's own `RenderPixelatedPass` via an `EffectComposer`
 * (no extra dependency). Giving `useFrame` a positive priority makes R3F hand
 * the render over to us, so the composer draws every frame instead of the
 * default renderer.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/examples/jsm/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export function PixelEffect({ pixelSize = 5 }: { pixelSize?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const { composer, pass } = useMemo(() => {
    const composer = new EffectComposer(gl);
    const pass = new RenderPixelatedPass(pixelSize, scene, camera, {
      normalEdgeStrength: 0.3,
      depthEdgeStrength: 0.4,
    });
    composer.addPass(pass);
    composer.addPass(new OutputPass());
    return { composer, pass };
    // Rebuild only if the renderer/scene/camera identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // Keep the pixel size live-tunable without rebuilding the composer.
  useEffect(() => {
    pass.setPixelSize(pixelSize);
  }, [pass, pixelSize]);

  // Match the drawing buffer on resize / DPR change.
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);

  // Free GPU resources if the effect is ever unmounted.
  useEffect(() => () => composer.dispose(), [composer]);

  // Priority > 0 → R3F stops auto-rendering and lets us drive the composer.
  useFrame(() => {
    composer.render();
  }, 1);

  return null;
}
