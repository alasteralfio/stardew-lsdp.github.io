// Simple in-memory sprite cache
const spriteCache = new Map();

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

// Loads objects.json data

let objectsData = null;
export async function loadObjects() {
    if (objectsData) return objectsData;
    
    try {
        const response = await fetch('data/objects.json');
        objectsData = await response.json();
        console.log('Objects data loaded:', Object.keys(objectsData).length, 'objects');
        return objectsData;
    } catch (error) {
        console.error('Failed to load objects.json:', error);
        throw error;
    }
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