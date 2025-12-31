import { TILE_SIZE } from "./constants.js";

let locationsData = null;
let currentLocation = null;

export async function loadLocations() {
    try {
        const response = await fetch('data/locations.json');
        locationsData = await response.json();
        console.log('Locations data loaded');
        return locationsData;
    } catch (error) {
        console.error('Failed to load locations.json:', error);
        throw error;
    }
}

export function getLocation(key) {
    if (!locationsData) {
        throw new Error('Locations data not loaded. Call loadLocations() first.');
    }
    return locationsData[key];
}

export function getCurrentLocation() {
    return currentLocation;
}

export function setCurrentLocation(key) {
    const location = getLocation(key);
    if (location) {
        currentLocation = location;
        currentLocation.pixelWidth = location.gridWidth * TILE_SIZE;
        currentLocation.pixelHeight = location.gridHeight * TILE_SIZE;
        console.log(`Set location: ${key} (${currentLocation.pixelWidth}x${currentLocation.pixelHeight}px)`);
    }
    return currentLocation;
}