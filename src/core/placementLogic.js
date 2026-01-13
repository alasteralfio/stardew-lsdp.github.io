// src/core/placementLogic.js
import { fetchObjectDefinition } from './assetLoader.js';

// Places a new object at the specified grid coordinates
export async function placeObjectAtGrid(appState, objectKey, gridX, gridY, layer) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) {
        console.error('No current location found');
        return false;
    }

    // Check if position is already occupied
    const existingPlacement = currentLocation.directPlacements.find(p =>
        p.gridX === gridX && p.gridY === gridY && p.layer === layer
    );

    if (existingPlacement) {
        console.log('Position already occupied');
        return false;
    }

    // Get object definition
    const objDef = await fetchObjectDefinition(objectKey);
    if (!objDef) {
        console.error('Object definition not found:', objectKey);
        return false;
    }

    // Check if object can be placed at this location (indoor/outdoor)
    if (objDef.placeableIndoors === false && currentLocation.locationKey !== 'farm') {
        console.log('Object can only be placed outdoors');
        return false;
    }

    // Create new placement
    const newPlacement = {
        id: appState.generatePlacementId(),
        objectKey: objectKey,
        gridX: gridX,
        gridY: gridY,
        layer: layer
    };

    // Add to placements
    currentLocation.directPlacements.push(newPlacement);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('placementsUpdated'));

    console.log('Placed object:', objectKey, 'at', gridX, gridY);
    return true;
}

// Removes an object at the specified grid coordinates
export function removeObjectAtGrid(appState, gridX, gridY, layer) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) return false;

    const index = currentLocation.directPlacements.findIndex(p =>
        p.gridX === gridX && p.gridY === gridY && p.layer === layer
    );

    if (index === -1) return false;

    currentLocation.directPlacements.splice(index, 1);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('placementsUpdated'));

    console.log('Removed object at', gridX, gridY);
    return true;
}