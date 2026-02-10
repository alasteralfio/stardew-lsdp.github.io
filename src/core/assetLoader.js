// Simple in-memory sprite cache
const spriteCache = new Map();
const frontLayerCache = new Map();

// loads and caches imgs
export async function loadSprite(src) {
    if (spriteCache.has(src)) {
        const cached = spriteCache.get(src);
        if (cached.complete) {
            return Promise.resolve(cached.cloneNode());
        }
        spriteCache.delete(src);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            spriteCache.set(src, img);
            resolve(img.cloneNode());
        };
        img.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
        img.src = src;
    });
}

// Load and cache front layer PNG (full image, unsliced)
export async function loadFrontLayer(src) {
    if (frontLayerCache.has(src)) {
        const cached = frontLayerCache.get(src);
        if (cached.complete) {
            return Promise.resolve(cached);
        }
        frontLayerCache.delete(src);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            frontLayerCache.set(src, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load front layer: ${src}`));
        img.src = src;
    });
}

// Loads objects.json data

let objectsData = null;
export async function loadObjects() {
    if (objectsData) return objectsData;
    
    console.log('Loading object data from JSON files...');
    
    // Load all object category files
    const [buildings, crops, decor, machines, wallpaper] = await Promise.all([
        fetch('data/objects/buildings.json').then(r => r.json()).catch(e => { console.error('Failed to load buildings.json:', e); return {}; }),
        fetch('data/objects/crops.json').then(r => r.json()).catch(e => { console.error('Failed to load crops.json:', e); return {}; }),
        fetch('data/objects/decor.json').then(r => r.json()).catch(e => { console.error('Failed to load decor.json:', e); return {}; }),
        fetch('data/objects/machines.json').then(r => r.json()).catch(e => { console.error('Failed to load machines.json:', e); return {}; }),
        fetch('data/objects/wallpaper.json').then(r => r.json()).catch(e => { console.error('Failed to load wallpaper.json:', e); return {}; })
    ]);
    
    // Merge into single object for easy lookup
    objectsData = {
        ...buildings,
        ...crops,
        ...decor,
        ...machines,
        ...wallpaper
    };
    
    console.log('Loaded objects from files:', {
        buildings: Object.keys(buildings).length,
        crops: Object.keys(crops).length,
        decor: Object.keys(decor).length,
        machines: Object.keys(machines).length,
        wallpaper: Object.keys(wallpaper).length,
        total: Object.keys(objectsData).length
    });
    
    console.log('Objects data loaded:', Object.keys(objectsData).length, 'objects');
    return objectsData;
}

//Gets object definition by key
export async function fetchObjectDefinition(objectKey) {
    const data = await loadObjects();
    const def = data[objectKey];
    if (!def) {
        console.warn(`Object definition not found: ${objectKey}`);
        return null;
    }
    return def;
}

// Helper: Check if an object is a building
export function isBuilding(objectKey) {
    // Synchronous check - assumes objectsData is already loaded
    if (!objectsData) {
        console.warn('Objects data not loaded yet - cannot check if building');
        return false;
    }
    
    const def = objectsData[objectKey];
    return def && def.type === 'building';
}

// Helper: Check if a building can be entered
export function canEnterBuilding(objectKey) {
    if (!objectsData) {
        console.warn('Objects data not loaded yet - cannot check if enterable');
        return false;
    }
    
    const def = objectsData[objectKey];
    return def && def.type === 'building' && def.canEnter === true && def.doorPosition;
}