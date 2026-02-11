/**
 * Folder management and drag-drop functionality
 * @module folders
 */

import { CONFIG } from './config.js';
import { deleteElement, toggleElementVisibility, updateElementList } from './elements.js';
import { saveState } from './persistence.js';
import { state } from './state.js';
import { formatArea, formatCoord, formatDistance, generateId, getIcon } from './utils.js';

// Drag and drop state
let draggedElementId = null;

/**
 * Create a new folder
 */
export function createFolder() {
    const id = `folder-${generateId()}`;
    const folder = {
        id: id,
        name: 'Nouveau dossier',
        collapsed: false,
        visible: true
    };
    state.folders.push(folder);
    updateElementList();
    saveState();
}

/**
 * Create folder DOM element
 * @param {Object} folder - Folder data
 * @param {Array} elements - Elements in the folder
 * @returns {HTMLElement} Folder DOM element
 */
export function createFolderElement(folder, elements) {
    const folderEl = document.createElement('div');
    folderEl.className = 'folder-item' + (folder.collapsed ? ' collapsed' : '');
    folderEl.dataset.folderId = folder.id;

    folderEl.innerHTML = `
        <div class="folder-header">
            <span class="folder-toggle"><i class="fas fa-chevron-down"></i></span>
            <span class="folder-title">${folder.name}</span>
            <span class="folder-count">${elements.length}</span>
            <div class="folder-actions">
                <button class="folder-btn folder-visibility ${folder.visible ? '' : 'hidden-state'}" title="Afficher/Masquer">
                    <i class="fas ${folder.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button class="folder-btn folder-edit" title="Renommer">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="folder-btn folder-delete" title="Supprimer le dossier">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="folder-content"></div>
    `;

    const header = folderEl.querySelector('.folder-header');
    const content = folderEl.querySelector('.folder-content');
    const titleSpan = folderEl.querySelector('.folder-title');

    // Toggle collapse
    header.addEventListener('click', (e) => {
        if (e.target.closest('.folder-actions')) return;
        folder.collapsed = !folder.collapsed;
        folderEl.classList.toggle('collapsed', folder.collapsed);
        saveState();
    });

    // Visibility toggle
    folderEl.querySelector('.folder-visibility').addEventListener('click', (e) => {
        e.stopPropagation();
        folder.visible = !folder.visible;
        toggleFolderVisibility(folder);
        updateElementList();
        saveState();
    });

    // Edit folder name
    folderEl.querySelector('.folder-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'folder-title-input';
        input.value = folder.name;
        titleSpan.replaceWith(input);
        input.focus();
        input.select();

        const saveTitle = () => {
            folder.name = input.value.trim() || 'Dossier';
            const newSpan = document.createElement('span');
            newSpan.className = 'folder-title';
            newSpan.textContent = folder.name;
            input.replaceWith(newSpan);
            saveState();
        };

        input.addEventListener('blur', saveTitle);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') saveTitle();
            if (ev.key === 'Escape') {
                input.value = folder.name;
                saveTitle();
            }
        });
    });

    // Delete folder
    folderEl.querySelector('.folder-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Supprimer ce dossier ? Les éléments seront déplacés à la racine.')) {
            elements.forEach(el => {
                const feature = state.features.find(f => f.id === el.id);
                if (feature) feature.properties.folderId = null;
            });
            const idx = state.folders.findIndex(f => f.id === folder.id);
            if (idx !== -1) state.folders.splice(idx, 1);
            updateElementList();
            saveState();
        }
    });

    // Drag and drop for folder content
    content.dataset.folderId = folder.id;
    content.addEventListener('dragover', handleDragOver);
    content.addEventListener('dragleave', handleDragLeave);
    content.addEventListener('drop', handleDrop);

    // Add elements to folder content
    elements.forEach(el => {
        const item = createElementItem(el);
        content.appendChild(item);
    });

    return folderEl;
}

/**
 * Create element item DOM for the list
 * @param {Object} el - Element data
 * @returns {HTMLElement} Element item DOM
 */
export function createElementItem(el) {
    const item = document.createElement('div');
    item.className = `element-item type-${el.type}${el.visible ? '' : ' element-hidden'}`;
    item.draggable = true;
    item.dataset.elementId = el.id;

    const borderColor = el.data.color || CONFIG.colors.default;
    item.style.borderLeftColor = borderColor;

    const details = getElementDetails(el);

    item.innerHTML = `
        <button class="element-visibility ${el.visible ? '' : 'hidden-state'}" title="Afficher/Masquer">
            <i class="fas ${el.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
        <div class="element-info">
            <div class="element-title">${getIcon(el.type)} ${el.data.title}</div>
            <div class="element-details">${details}</div>
        </div>
        <button class="element-edit" title="Modifier"><i class="fas fa-pencil-alt"></i></button>
        <button class="element-delete" title="Supprimer"><i class="fas fa-trash"></i></button>
    `;

    // Visibility toggle
    item.querySelector('.element-visibility').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleElementVisibility(el.id);
    });

    // Edit button
    item.querySelector('.element-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.layer.getBounds) {
            state.map.fitBounds(el.layer.getBounds(), { padding: [50, 50] });
        } else if (el.layer.getLatLng) {
            state.map.setView(el.layer.getLatLng(), Math.max(state.map.getZoom(), 14));
        }
        setTimeout(() => el.layer.openPopup(), 100);
    });

    // Delete button
    item.querySelector('.element-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteElement(el.id);
    });

    // Click to focus
    item.querySelector('.element-info').addEventListener('click', () => {
        if (el.layer.getBounds) {
            state.map.fitBounds(el.layer.getBounds(), { padding: [50, 50] });
        } else if (el.layer.getLatLng) {
            state.map.setView(el.layer.getLatLng(), 14);
            el.layer.openPopup();
        }
    });

    // Hover highlight on map
    item.addEventListener('mouseenter', () => {
        if (el.layer && el.visible) {
            highlightLayer(el.layer, true);
        }
    });
    item.addEventListener('mouseleave', () => {
        if (el.layer) {
            highlightLayer(el.layer, false);
        }
    });

    // Drag events
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);

    return item;
}

/**
 * Highlight or unhighlight a layer on the map
 * @param {L.Layer} layer - The Leaflet layer
 * @param {boolean} highlight - Whether to highlight or restore
 */
function highlightLayer(layer, highlight) {
    if (layer instanceof L.LayerGroup) {
        layer.eachLayer(subLayer => applyHighlight(subLayer, highlight));
    } else {
        applyHighlight(layer, highlight);
    }
}

/**
 * Apply highlight style to a single layer
 */
function applyHighlight(layer, highlight) {
    if (layer instanceof L.Marker) {
        const el = layer.getElement?.();
        if (el) {
            if (highlight) {
                el.classList.add('marker-highlighted');
            } else {
                el.classList.remove('marker-highlighted');
            }
        }
    } else if (layer.setStyle) {
        if (highlight) {
            if (!layer._originalStyle) {
                layer._originalStyle = {
                    weight: layer.options.weight,
                    opacity: layer.options.opacity,
                    fillOpacity: layer.options.fillOpacity
                };
            }
            layer.setStyle({ weight: 5, opacity: 1, fillOpacity: 0.5 });
            if (layer.bringToFront) layer.bringToFront();
        } else {
            if (layer._originalStyle) {
                layer.setStyle(layer._originalStyle);
                delete layer._originalStyle;
            }
        }
    }
}

/**
 * Get details string for element display
 * @param {Object} el - Element data
 * @returns {string} Details string
 */
function getElementDetails(el) {
    const type = el.type;
    const data = el.data;

    switch (type) {
        case 'circle':
            return `Rayon: ${data.radius}m`;
        case 'line':
            return `Dist: ${formatDistance(data.distance)}`;
        case 'bearing':
            return `${formatDistance(data.distance)} @ ${data.bearing}°`;
        case 'polygon':
            return `${data.points?.length || 0} pts`;
        case 'measurement-distance':
            return formatDistance(data.distanceM);
        case 'measurement-area':
            return formatArea(data.areaM2);
        case 'measurement-bearing':
            return `${data.bearing.toFixed(1)}° (${data.cardinal})`;
        case 'measurement-center':
            return formatCoord(data.center, 4);
        case 'measurement-centroid':
            return formatCoord(data.centroid, 4);
        case 'measurement-bbox':
            return `${data.width.toFixed(1)}m × ${data.height.toFixed(1)}m`;
        case 'measurement-along':
            return data.lengthM < 1000 ? `${data.lengthM.toFixed(2)} m` : `${data.lengthKm.toFixed(3)} km`;
        default:
            return `${data.lat?.toFixed(4) || ''}, ${data.lng?.toFixed(4) || ''}`;
    }
}

/**
 * Toggle visibility of all elements in a folder
 * @param {Object} folder - Folder data
 */
export function toggleFolderVisibility(folder) {
    state.features.forEach(feature => {
        if (feature.properties.folderId === folder.id) {
            state.featureVisibility.set(feature.id, folder.visible);
            const layer = state.featureLayers.get(feature.id);
            if (layer) {
                if (folder.visible) {
                    layer.addTo(state.map);
                } else {
                    state.map.removeLayer(layer);
                }
            }
        }
    });
}

// Drag and drop handlers
function handleDragStart(e) {
    draggedElementId = e.target.dataset.elementId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElementId = null;
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

export function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

export function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

export function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    if (!draggedElementId) return;

    const targetFolderId = e.currentTarget.dataset.folderId || null;
    const feature = state.features.find(f => f.id === draggedElementId);

    if (feature) {
        feature.properties.folderId = targetFolderId;

        if (targetFolderId) {
            const folder = state.folders.find(f => f.id === targetFolderId);
            if (folder && !folder.visible) {
                state.featureVisibility.set(feature.id, false);
                const layer = state.featureLayers.get(feature.id);
                if (layer) state.map.removeLayer(layer);
            }
        }

        updateElementList();
        saveState();
    }
}
