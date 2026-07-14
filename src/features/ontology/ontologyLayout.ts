import { ontologyLanes } from "./ontologyData";

export const ontologyLaneY: Record<string, number> = {
  "product-material": -520,
  process: -300,
  resource: -80,
  quality: 160,
  "engineering-document": 400,
  "value-stream": 640,
  governance: 880,
};

export const ontologyNodePositions = Object.fromEntries(
  ontologyLanes.flatMap((lane) =>
    lane.objectTypeIds.map((objectTypeId, index) => [
      objectTypeId,
      { x: -620 + index * 285, y: ontologyLaneY[lane.id] },
    ]),
  ),
) as Record<string, { x: number; y: number }>;

export const laneByObjectId = new Map(
  ontologyLanes.flatMap((lane) => lane.objectTypeIds.map((objectTypeId) => [objectTypeId, lane.id] as const)),
);

