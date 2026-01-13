import { loadObjects } from '../core/assetLoader.js';

class PaletteController {
    constructor(appState) {
        this.appState = appState;
        this.currentCategory = null;
        this.allObjects = null;
        this.filteredObjects = [];
        
        this.init();
    }
    
    async init() {
        // Load all objects
        this.allObjects = await loadObjects();
        console.log('Palette controller initialized with', Object.keys(this.allObjects).length, 'objects');
        console.log('Sample objects:', Object.keys(this.allObjects).slice(0, 5));
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Make togglePalette globally available
        window.togglePalette = this.togglePalette.bind(this);
    }
    
    setupEventListeners() {
        // Category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.togglePalette(category);
            });
        });
        
        // Close palette
        document.getElementById('close-palette-btn').addEventListener('click', () => {
            this.hidePalette();
        });
        
        // Settings buttons
        document.querySelectorAll('#settings-panel button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleSettingsButton(e.target.textContent);
            });
        });
        
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterObjects(e.target.value);
        });
        
        // File input for loading layouts
        document.getElementById('loadFileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.appState.loadLayout(e.target.files[0]);
            }
        });
    }
    
    togglePalette(category) {
        const panel = document.getElementById('palette-panel');
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        
        // Check if the same category is being clicked again
        if (this.currentCategory === category && panel.classList.contains('show')) {
            // Close the panel
            panel.classList.remove('show');
            setTimeout(() => {
                panel.style.display = 'none';
            }, 300); // Match transition duration
            this.currentCategory = null;
        } else {
            // Open the new category
            panel.style.display = 'block';
            setTimeout(() => panel.classList.add('show'), 10); // Small delay to trigger transition
            this.currentCategory = category;
            
            if (category === 'settings') {
                search.style.display = 'none';
                grid.style.display = 'none';
                settings.style.display = 'flex';
            } else {
                search.style.display = 'flex';
                grid.style.display = 'grid';
                settings.style.display = 'none';
                this.loadCategoryObjects(category);
            }
        }
    }
    
    selectCategory(category) {
        this.currentCategory = category;
        this.showPalette();
        if (category === 'settings') {
            this.showSettingsPanel();
        } else {
            this.loadCategoryObjects(category);
        }
    }
    
    hidePalette() {
        const panel = document.getElementById('palette-panel');
        panel.classList.remove('show');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300); // Match transition duration
        this.currentCategory = null;
    }
    
    showSettingsPanel() {
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        
        search.style.display = 'none';
        grid.style.display = 'none';
        settings.style.display = 'flex';
    }
    
    loadCategoryObjects(category) {
        this.filteredObjects = Object.entries(this.allObjects)
            .filter(([key, obj]) => obj.category === category)
            .map(([key, obj]) => ({ ...obj, objectKey: key }));
        
        console.log(`Loaded ${this.filteredObjects.length} objects for category ${category}:`, this.filteredObjects.map(obj => obj.name));
        this.renderObjectsGrid();
    }
    
    selectObject(obj) {
        // Clear previous selection
        document.querySelectorAll('.object-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Set new selection
        const selectedElement = document.querySelector(`[data-object-key="${obj.objectKey}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
        
        // Update appState
        this.appState.selectedItem = {
            objectKey: obj.objectKey,
            layer: obj.defaultLayer
        };
        
        // Update status bar
        const statusBar = document.getElementById('selected-object');
        statusBar.textContent = `Selected: ${obj.name}`;
        
        console.log('Selected object:', obj.objectKey, obj.name);
    }
    
    renderObjectsGrid() {
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        
        search.style.display = 'flex';
        grid.style.display = 'grid';
        settings.style.display = 'none';
        
        grid.innerHTML = '';
        
        this.filteredObjects.forEach(obj => {
            const objElement = this.createObjectElement(obj);
            grid.appendChild(objElement);
        });
    }
    
    createObjectElement(obj) {
        const element = document.createElement('div');
        element.className = 'object-item';
        element.dataset.objectKey = obj.objectKey;
        element.title = obj.name;
        element.innerHTML = `
            <div class="object-preview">
                ${obj.name.charAt(0)}
            </div>
            <div class="object-name">
                ${obj.name}
            </div>
        `;
        
        element.addEventListener('click', () => {
            this.selectObject(obj);
        });
        
        return element;
    }
    
    handleSettingsButton(action) {
        switch (action) {
            case 'Save Layout':
                this.appState.saveCurrentLayout();
                break;
            case 'Load Layout':
                document.getElementById('loadFileInput').click();
                break;
            case 'New Layout':
                this.appState.createNewLayout();
                break;
            case 'Debug State':
                console.log('Current appState:', this.appState);
                break;
        }
    }
}

export { PaletteController };