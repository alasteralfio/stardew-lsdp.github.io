// src/core/renderHelpers.js
import { TILE_SIZE } from "./constants.js";


// Y-sorts placements for correct visual layering.
// Objects with higher gridY (lower on screen) draw last (on top).
export function ySortPlacements(placementsArray) {
    return [...placementsArray].sort((a, b) => a.gridY - b.gridY);
}


// Converts grid coordinates to pixel coordinates (Top-left origin).
export function gridToPixel(gridX, gridY) {
    const pixelX = gridX * TILE_SIZE;
    const pixelY = gridY * TILE_SIZE;
    return { pixelX, pixelY };
}