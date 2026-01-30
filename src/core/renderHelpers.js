import { TILE_SIZE } from "./constants.js";

const TILE_PIXEL_SIZE = 16;

// Y-sorts placements for correct visual layering.
// Primary: gridY (lower Y drawn first/behind, higher Y drawn last/on top)
// Secondary: at equal Y, user placements drawn first, front tiles drawn last (on top)
export function ySortPlacements(placementsArray) {
    return [...placementsArray].sort((a, b) => {
        if (a.gridY !== b.gridY) {
            return a.gridY - b.gridY;
        }
        // At same Y: user placements (0) before front tiles (1)
        return (a.isFrontTile ? 1 : 0) - (b.isFrontTile ? 1 : 0);
    });
}

// Converts grid coordinates to pixel coordinates (Top-left origin).
export function gridToPixel(gridX, gridY) {
    const pixelX = gridX * TILE_SIZE;
    const pixelY = gridY * TILE_SIZE;
    return { pixelX, pixelY };
}

// Extract non-transparent front tiles from a full front layer PNG
// Returns array of synthetic placement objects with gridX, gridY, layer=3
export function extractFrontTiles(frontImage, gridWidth, gridHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = frontImage.width;
    canvas.height = frontImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(frontImage, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, frontImage.width, frontImage.height);
    const data = imageData.data;
    
    const tiles = [];
    
    // Iterate through each 16x16 tile
    for (let tileY = 0; tileY < gridHeight; tileY++) {
        for (let tileX = 0; tileX < gridWidth; tileX++) {
            // Check if this tile has any non-transparent pixels
            const hasContent = checkTileTransparency(data, tileX, tileY, frontImage.width, frontImage.height);
            
            if (hasContent) {
                // Create synthetic placement object for front tile
                tiles.push({
                    id: `front_${tileX}_${tileY}`,
                    objectKey: `front_tile_${tileX}_${tileY}`,
                    gridX: tileX,
                    gridY: tileY,
                    layer: 3,
                    isFrontTile: true, // Mark as front tile for special rendering
                    frontTileCoord: { x: tileX, y: tileY },
                    frontImage: frontImage // Store reference to full image
                });
            }
        }
    }
    
    return tiles;
}

// Check if a 16x16 tile at (tileX, tileY) has any non-transparent pixels
function checkTileTransparency(imageData, tileX, tileY, imgWidth, imgHeight) {
    const pixelStartX = tileX * TILE_PIXEL_SIZE;
    const pixelStartY = tileY * TILE_PIXEL_SIZE;
    
    // Clamp to image bounds
    const pixelEndX = Math.min(pixelStartX + TILE_PIXEL_SIZE, imgWidth);
    const pixelEndY = Math.min(pixelStartY + TILE_PIXEL_SIZE, imgHeight);
    
    // Check alpha channel of each pixel in the tile
    for (let y = pixelStartY; y < pixelEndY; y++) {
        for (let x = pixelStartX; x < pixelEndX; x++) {
            const index = (y * imgWidth + x) * 4; // RGBA format: 4 bytes per pixel
            const alpha = imageData[index + 3]; // Alpha is 4th component
            if (alpha > 0) {
                return true; // Found non-transparent pixel
            }
        }
    }
    
    return false; // All pixels transparent
}