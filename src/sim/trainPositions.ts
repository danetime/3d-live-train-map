/**
 * A tiny shared registry of each train's current world position, updated every
 * frame by the Train components and read by the camera controller when a train
 * is selected. Kept outside React state so per-frame writes don't trigger
 * re-renders.
 */
import * as THREE from "three";

export const trainPositions = new Map<string, THREE.Vector3>();
