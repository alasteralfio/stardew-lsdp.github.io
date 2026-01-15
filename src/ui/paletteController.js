import { loadObjects } from '../core/assetLoader.js';

class PaletteController {
    constructor(appState) {
        this.appState = appState;
        this.currentCategory = null;
        this.allObjects = null;
        this.filteredObjects = [];
        this.searchTimeout = null;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        
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
        const categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => {
            const clickHandler = (e) => {
                const category = e.currentTarget.dataset.category;
                this.togglePalette(category);
            };
            btn.addEventListener('click', clickHandler);
            this.eventListeners.set(`category-btn-${btn.dataset.category}`, { element: btn, handler: clickHandler, type: 'click' });
        });
        
        // Close palette
        const closePaletteBtn = document.getElementById('close-palette-btn');
        const closePaletteHandler = () => this.hidePalette();
        closePaletteBtn.addEventListener('click', closePaletteHandler);
        this.eventListeners.set('close-palette-btn', { element: closePaletteBtn, handler: closePaletteHandler, type: 'click' });
        
        // Settings buttons
        const settingsBtns = document.querySelectorAll('#settings-panel button');
        settingsBtns.forEach((btn, idx) => {
            const btnHandler = (e) => {
                this.handleSettingsButton(e.target.textContent);
            };
            btn.addEventListener('click', btnHandler);
            this.eventListeners.set(`settings-btn-${idx}`, { element: btn, handler: btnHandler, type: 'click' });
        });
        
        // Search - with debouncing
        const searchInput = document.getElementById('search-input');
        const searchHandler = (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.filterObjects(e.target.value);
            }, 100); // 100ms debounce
        };
        searchInput.addEventListener('input', searchHandler);
        this.eventListeners.set('search-input', { element: searchInput, handler: searchHandler, type: 'input' });
        
        // File input for loading layouts
        const loadFileInput = document.getElementById('loadFileInput');
        const loadHandler = (e) => {
            if (e.target.files.length > 0) {
                this.appState.loadLayout(e.target.files[0]);
            }
        };
        loadFileInput.addEventListener('change', loadHandler);
        this.eventListeners.set('loadFileInput', { element: loadFileInput, handler: loadHandler, type: 'change' });
    }
    
    cleanup() {
        // Remove all event listeners to prevent memory leaks
        this.eventListeners.forEach(({ element, handler, type }) => {
            if (element) {
                element.removeEventListener(type, handler);
            }
        });
        this.eventListeners.clear();
        
        // Clear any pending search timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        console.log('PaletteController cleanup complete');
    }
    
    togglePalette(category) {
        const panel = document.getElementById('palette-panel');
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        const searchInput = document.getElementById('search-input');
        
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
            
            // Clear search input when switching categories
            if (searchInput) {
                searchInput.value = '';
            }
            
            if (category === 'settings') {
                search.style.display = 'none';
                grid.style.display = 'none';
                settings.classList.add('show');
            } else {
                search.style.display = 'flex';
                grid.style.display = 'grid';
                settings.classList.remove('show');
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
        settings.classList.add('show');
    }
    
    loadCategoryObjects(category) {
        this.currentCategory = category;
        this.filteredObjects = Object.entries(this.allObjects)
            .filter(([key, obj]) => obj.category === category)
            .map(([key, obj]) => ({ ...obj, objectKey: key }));
        
        console.log(`Loaded ${this.filteredObjects.length} objects for category ${category}:`, this.filteredObjects.map(obj => obj.name));
        this.renderObjectsGrid();
    }
    
    filterObjects(searchTerm) {
        // If no search term, show all objects in current category
        if (!searchTerm || !searchTerm.trim()) {
            this.loadCategoryObjects(this.currentCategory);
            return;
        }
        
        // Filter objects by current category AND search term
        const searchLower = searchTerm.toLowerCase();
        this.filteredObjects = Object.entries(this.allObjects)
            .filter(([key, obj]) => {
                const matchesCategory = obj.category === this.currentCategory;
                const matchesSearch = obj.name.toLowerCase().includes(searchLower);
                return matchesCategory && matchesSearch;
            })
            .map(([key, obj]) => ({ ...obj, objectKey: key }));
        
        console.log(`Search "${searchTerm}" found ${this.filteredObjects.length} objects in ${this.currentCategory}`);
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