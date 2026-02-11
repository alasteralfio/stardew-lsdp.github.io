import { TILE_SIZE } from "./constants.js";

let locationsData = null;
let currentLocation = null;

export async function loadLocations() {
    try {
        // Load the manifest to get list of available locations
        const manifestResponse = await fetch('data/locations-manifest.json');
        const locationKeys = await manifestResponse.json();
        
        // Load all location files in parallel
        const locationPromises = locationKeys.map(key =>
            fetch(`data/locations/${key}.json`)
                .then(r => {
                    if (!r.ok) throw new Error(`Failed to load location: ${key}`);
                    return r.json();
                })
        );
        
        const locationArrays = await Promise.all(locationPromises);
        
        // Combine into single object for backwards compatibility
        locationsData = {};
        locationKeys.forEach((key, index) => {
            locationsData[key] = locationArrays[index];
        });
        
        console.log('Locations data loaded:', Object.keys(locationsData));
        return locationsData;
    } catch (error) {
        console.error('Failed to load locations:', error);
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

// Check 7: Location swap functions for building entry/exit
export function createLocationInstance(baseLocationKey, instanceId) {
    if (!locationsData || !locationsData[baseLocationKey]) {
        console.error(`Base location ${baseLocationKey} not found`);
        return null;
    }
    
    // Create new location instance if it doesn't exist
    if (!locationsData[instanceId]) {
        console.log(`Creating new location instance: ${instanceId} from ${baseLocationKey}`);
        
        // Deep copy the base location to avoid shared state
        const base = locationsData[baseLocationKey];
        locationsData[instanceId] = { 
            ...base, 
            locationKey: instanceId,
            instanceId: instanceId, // Mark as instance
            directPlacements: base.directPlacements ? JSON.parse(JSON.stringify(base.directPlacements)) : [],
            buildings: base.buildings ? JSON.parse(JSON.stringify(base.buildings)) : []
        };
    }
    
    return locationsData[instanceId];
}

export function enterLocation(targetLocationKey, appState) {
    // Push current location to stack
    if (appState.currentView.locationKey) {
        appState.navigationStack.push(appState.currentView.locationKey);
    }
    
    // Ensure location data is loaded/created
    if (!locationsData[targetLocationKey]) {
        console.warn(`Location ${targetLocationKey} data not found!`);
    }
    
    // Use the global switchLocation function which handles canvas resizing and rendering
    if (window.switchLocation) {
        window.switchLocation(targetLocationKey);
    } else {
        // Fallback if interactions not initialized yet (shouldn't happen in game)
        appState.currentView.locationKey = targetLocationKey;
        setCurrentLocation(targetLocationKey);
    }
}

export function exitLocation(appState) {
    if (appState.navigationStack.length === 0) {
        console.warn("Navigation stack empty, cannot exit");
        return;
    }
    
    // Pop previous location
    const previousLocation = appState.navigationStack.pop();
    
    // Use the global switchLocation function
    if (window.switchLocation) {
        window.switchLocation(previousLocation);
    } else {
        appState.currentView.locationKey = previousLocation;
        setCurrentLocation(previousLocation);
    }
}

export function getAvailableLocations() {
    if (!locationsData) {
        throw new Error('Locations data not loaded. Call loadLocations() first.');
    }
    return Object.keys(locationsData).map(key => ({
        key: key,
        name: locationsData[key].name,
        gridWidth: locationsData[key].gridWidth,
        gridHeight: locationsData[key].gridHeight,
        indoors: locationsData[key].indoors || false
    }));
}