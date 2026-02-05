/**
 * Element management - CRUD, popups, list UI
 * @module elements
 */

import { CONFIG } from './config.js';
import {
    createElementItem,
    createFolder,
    createFolderElement,
    handleDragLeave,
    handleDragOver,
    handleDrop
} from './folders.js';
import { createLayerFromFeature, extractDataFromFeature } from './geojson.js';
import { saveState } from './persistence.js';
import { state } from './state.js';
import {
    createColoredMarkerIcon,
    generateId,
    getCardinalDirection,
    parsePointsFromText
} from './utils.js';

/**
 * Create a new element
 * @param {string} type - Element type
 * @param {Object} data - Element data
 */
export function createElement(type, data) {
    const id = generateId();

    if (!data.color) {
        data.color = CONFIG.colors['drawing-' + type] || CONFIG.colors.default;
    }

    if (!data.title) {
        data.title = {
            'marker': 'Marqueur',
            'circle': 'Cercle',
            'line': 'Ligne',
            'bearing': 'Ligne directionnelle',
            'polygon': 'Polygone'
        }[type] || type;
    }

    const properties = {
        type: type,
        title: data.title,
        description: data.description || '',
        color: data.color,
        folderId: data.folderId || null
    };

    // Create GeoJSON feature
    let feature = null;

    switch (type) {
        case 'marker':
            feature = turf.point([data.lng, data.lat], properties);
            break;
        case 'circle':
            properties.radius = data.radius;
            feature = turf.point([data.center.lng, data.center.lat], properties);
            break;
        case 'line':
            if (data.points) {
                const lineCoords = data.points.map(p => [p.lng, p.lat]);
                const line = turf.lineString(lineCoords);
                properties.distance = turf.length(line, { units: 'meters' });
                feature = turf.lineString(lineCoords, properties);
            } else {
                if (!data.distance) {
                    data.distance = state.map.distance(
                        [data.start.lat, data.start.lng],
                        [data.end.lat, data.end.lng]
                    );
                }
                properties.distance = data.distance;
                feature = turf.lineString([
                    [data.start.lng, data.start.lat],
                    [data.end.lng, data.end.lat]
                ], properties);
            }
            break;
        case 'bearing':
            if (!data.distance) {
                data.distance = state.map.distance(
                    [data.start.lat, data.start.lng],
                    [data.end.lat, data.end.lng]
                );
            }
            properties.distance = data.distance;
            if (data.bearing !== undefined) properties.bearing = data.bearing;
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;
        case 'polygon': {
            const polyCoords = data.points.map(p => [p.lng, p.lat]);
            polyCoords.push(polyCoords[0]);
            feature = turf.polygon([polyCoords], properties);
            break;
        }
    }

    feature.id = id;

    // Create Leaflet layer
    const layer = createLayerFromFeature(feature);
    layer.addTo(state.map);

    // Store feature and layer
    state.features.push(feature);
    state.featureLayers.set(id, layer);
    state.featureVisibility.set(id, true);

    // Bind popup
    layer.bindPopup(() => createPopupContent(feature));
    if (type === 'marker') layer.openPopup();

    updateElementList();
    saveState();
}

/**
 * Create popup content for a feature
 * @param {Object} feature - GeoJSON feature
 * @returns {HTMLElement} Popup content element
 */
export function createPopupContent(feature) {
    const div = document.createElement('div');
    div.className = 'popup-content';

    const props = feature.properties;
    const type = props.type;
    const id = feature.id;

    let fieldsHtml = createPopupField('Titre', 'text', props.title, 'title-input');
    fieldsHtml += createPopupField('Couleur', 'color', props.color || CONFIG.colors.default, 'color-input');

    // Type-specific fields
    fieldsHtml += createTypeSpecificFields(feature);

    // Description
    fieldsHtml += `
        <div class="popup-field">
            <label class="popup-label">Description:</label>
            <textarea class="popup-textarea desc-input">${props.description || ''}</textarea>
        </div>
        <div class="popup-buttons">
            <button class="popup-btn popup-btn-save">Sauvegarder</button>
            <button class="popup-btn popup-btn-delete">Supprimer</button>
        </div>
    `;

    div.innerHTML = fieldsHtml;

    // Bind events
    div.querySelector('.popup-btn-save').addEventListener('click', () => updateElementFromPopup(feature, div));
    div.querySelector('.popup-btn-delete').addEventListener('click', () => deleteElement(id));

    // Special handling for measurement-along
    if (type === 'measurement-along') {
        setupAlongInputs(div, feature);
    }

    return div;
}

/**
 * Create a popup field HTML
 */
function createPopupField(label, type, value, className) {
    return `
        <div class="popup-field">
            <label class="popup-label">${label}:</label>
            <input type="${type}" step="any" class="popup-input ${className}" value="${value || ''}">
        </div>
    `;
}

/**
 * Create type-specific popup fields
 */
function createTypeSpecificFields(feature) {
    const props = feature.properties;
    const type = props.type;
    const geom = feature.geometry;
    let html = '';

    if (type === 'marker') {
        html += createPopupField('Latitude', 'number', geom.coordinates[1], 'lat-input');
        html += createPopupField('Longitude', 'number', geom.coordinates[0], 'lng-input');
    } else if (type === 'circle') {
        html += createPopupField('Centre Lat', 'number', geom.coordinates[1], 'lat-input');
        html += createPopupField('Centre Lng', 'number', geom.coordinates[0], 'lng-input');
        html += createPopupField('Rayon (m)', 'number', props.radius, 'radius-input');
    } else if (type === 'line') {
        const coords = geom.coordinates;
        if (coords.length === 2) {
            html += createPopupField('Départ Lat', 'number', coords[0][1], 'start-lat-input');
            html += createPopupField('Départ Lng', 'number', coords[0][0], 'start-lng-input');
            html += createPopupField('Arrivée Lat', 'number', coords[1][1], 'end-lat-input');
            html += createPopupField('Arrivée Lng', 'number', coords[1][0], 'end-lng-input');
        } else {
            const pointsStr = coords.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
            html += `
                <div class="popup-field">
                    <label class="popup-label">Points (Lat, Lng):</label>
                    <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
                </div>`;
        }
        if (props.distance !== undefined) {
            const distStr = props.distance < 1000
                ? props.distance.toFixed(2) + ' m'
                : (props.distance / 1000).toFixed(3) + ' km';
            html += `
                <div class="popup-field">
                    <label class="popup-label">Longueur:</label>
                    <span class="computed-value">${distStr}</span>
                </div>`;
        }
    } else if (type === 'bearing') {
        html += createPopupField('Départ Lat', 'number', geom.coordinates[0][1], 'start-lat-input');
        html += createPopupField('Départ Lng', 'number', geom.coordinates[0][0], 'start-lng-input');
        html += createPopupField('Arrivée Lat', 'number', geom.coordinates[1][1], 'end-lat-input');
        html += createPopupField('Arrivée Lng', 'number', geom.coordinates[1][0], 'end-lng-input');
    } else if (type === 'polygon') {
        const points = geom.coordinates[0].slice(0, -1);
        const pointsStr = points.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
        html += `
            <div class="popup-field">
                <label class="popup-label">Points (Lat, Lng):</label>
                <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
            </div>`;
    } else if (type.startsWith('measurement-')) {
        html += createMeasurementFields(feature);
    }

    return html;
}

/**
 * Create measurement-specific popup fields
 */
function createMeasurementFields(feature) {
    const props = feature.properties;
    const type = props.type;
    const geom = feature.geometry;
    let html = '';

    if (type === 'measurement-distance' || type === 'measurement-bearing') {
        const coords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates : geom.coordinates;
        html += createPopupField('Point A - Lat', 'number', coords[0][1], 'start-lat-input');
        html += createPopupField('Point A - Lng', 'number', coords[0][0], 'start-lng-input');
        html += createPopupField('Point B - Lat', 'number', coords[1][1], 'end-lat-input');
        html += createPopupField('Point B - Lng', 'number', coords[1][0], 'end-lng-input');

        if (props.distanceM !== undefined) {
            const distStr = props.distanceM < 1000
                ? props.distanceM.toFixed(2) + ' m'
                : props.distanceKm.toFixed(3) + ' km';
            html += `
                <div class="popup-field">
                    <label class="popup-label">Distance:</label>
                    <span class="computed-value">${distStr}</span>
                </div>`;
        }

        if (type === 'measurement-bearing' && props.bearing !== undefined) {
            html += `
                <div class="popup-field">
                    <label class="popup-label">Direction:</label>
                    <span class="computed-value">${props.bearing.toFixed(1)}° (${props.cardinal})</span>
                </div>`;
        }
    } else if (['measurement-area', 'measurement-center', 'measurement-centroid', 'measurement-bbox'].includes(type)) {
        const polyCoords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates[0] : geom.coordinates[0];
        const points = polyCoords.slice(0, -1);
        const pointsStr = points.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
        html += `
            <div class="popup-field">
                <label class="popup-label">Points (Lat, Lng):</label>
                <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
            </div>`;

        if (props.areaM2 !== undefined) {
            const areaStr = props.areaM2 < 10000
                ? props.areaM2.toFixed(2) + ' m²'
                : props.areaHa.toFixed(4) + ' ha';
            html += `
                <div class="popup-field">
                    <label class="popup-label">Surface:</label>
                    <span class="computed-value">${areaStr}</span>
                </div>`;
        }

        if (type === 'measurement-center' && props.center) {
            html += `
                <div class="popup-field">
                    <label class="popup-label">Centre:</label>
                    <span class="computed-value">${props.center.lat.toFixed(6)}, ${props.center.lng.toFixed(6)}</span>
                </div>`;
        }

        if (type === 'measurement-centroid' && props.centroid) {
            html += `
                <div class="popup-field">
                    <label class="popup-label">Centre de masse:</label>
                    <span class="computed-value">${props.centroid.lat.toFixed(6)}, ${props.centroid.lng.toFixed(6)}</span>
                </div>`;
        }

        if (type === 'measurement-bbox' && props.bbox) {
            html += `
                <div class="popup-field">
                    <label class="popup-label">Dimensions:</label>
                    <span class="computed-value">${props.width.toFixed(1)}m × ${props.height.toFixed(1)}m</span>
                </div>`;
        }
    } else if (type === 'measurement-along') {
        const lineCoords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates : geom.coordinates;
        const pointsStr = lineCoords.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
        html += `
            <div class="popup-field">
                <label class="popup-label">Points (Lat, Lng):</label>
                <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
            </div>`;

        if (props.lengthM !== undefined) {
            const lenStr = props.lengthM < 1000
                ? props.lengthM.toFixed(2) + ' m'
                : props.lengthKm.toFixed(3) + ' km';
            html += `
                <div class="popup-field">
                    <label class="popup-label">Longueur totale:</label>
                    <span class="computed-value">${lenStr}</span>
                </div>`;
        }

        const alongPercent = props.alongPercent ?? 50;
        const alongDistance = props.alongDistance ?? (props.lengthM / 2);

        html += `
            <div class="popup-field">
                <label class="popup-label">Position (%):</label>
                <input type="number" step="0.1" class="popup-input along-percent-input" value="${alongPercent.toFixed(1)}" min="0" max="100">
            </div>
            <div class="popup-field">
                <label class="popup-label">Position (m):</label>
                <input type="number" step="0.1" class="popup-input along-distance-input" value="${alongDistance.toFixed(2)}" min="0" max="${props.lengthM}">
            </div>`;

        if (props.alongPoint) {
            html += `
                <div class="popup-field">
                    <label class="popup-label">Point calculé:</label>
                    <span class="computed-value along-point-display">${props.alongPoint.lat.toFixed(6)}, ${props.alongPoint.lng.toFixed(6)}</span>
                </div>`;
        }
    }

    return html;
}

/**
 * Setup input synchronization for along measurement
 */
function setupAlongInputs(div, feature) {
    const percentInput = div.querySelector('.along-percent-input');
    const distanceInput = div.querySelector('.along-distance-input');
    const pointDisplay = div.querySelector('.along-point-display');
    const props = feature.properties;

    if (!percentInput || !distanceInput || !pointDisplay) return;

    const lengthM = props.lengthM;

    percentInput.addEventListener('input', (e) => {
        const percent = Number.parseFloat(e.target.value);
        if (Number.isFinite(percent) && lengthM) {
            const distance = (percent / 100) * lengthM;
            distanceInput.value = distance.toFixed(2);
            updateAlongPoint(feature, distance, pointDisplay);
        }
    });

    distanceInput.addEventListener('input', (e) => {
        const distance = Number.parseFloat(e.target.value);
        if (Number.isFinite(distance) && lengthM) {
            const percent = (distance / lengthM) * 100;
            percentInput.value = percent.toFixed(1);
            updateAlongPoint(feature, distance, pointDisplay);
        }
    });
}

/**
 * Update along point display
 */
function updateAlongPoint(feature, distanceM, displayElement) {
    const geom = feature.geometry;
    const coords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates : geom.coordinates;

    try {
        const line = turf.lineString(coords);
        const lengthKm = turf.length(line, { units: 'kilometers' });
        const distanceKm = Math.max(0, Math.min(distanceM / 1000, lengthKm));

        const alongPoint = turf.along(line, distanceKm, { units: 'kilometers' });
        const lat = alongPoint.geometry.coordinates[1];
        const lng = alongPoint.geometry.coordinates[0];

        displayElement.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (e) {
        console.error('Error calculating along point:', e);
    }
}

/**
 * Update element from popup inputs
 */
export function updateElementFromPopup(feature, div) {
    const props = feature.properties;
    const type = props.type;
    const layer = state.featureLayers.get(feature.id);

    // Common fields
    const titleInput = div.querySelector('.title-input');
    if (titleInput) props.title = titleInput.value;

    const descInput = div.querySelector('.desc-input');
    if (descInput) props.description = descInput.value;

    const colorInput = div.querySelector('.color-input');
    if (colorInput) {
        props.color = colorInput.value;
        updateLayerColor(layer, type, props.color);
    }

    // Type-specific updates
    updateTypeSpecificFromPopup(feature, div, layer);

    updateElementList();
    saveState();
    layer.closePopup();
}

/**
 * Update layer color
 */
function updateLayerColor(layer, type, color) {
    if (type === 'marker' && layer.setIcon) {
        layer.setIcon(createColoredMarkerIcon(color));
    } else if (layer.setStyle) {
        layer.setStyle({ color: color, fillColor: color });
    } else if (layer instanceof L.LayerGroup) {
        layer.eachLayer(subLayer => {
            if (subLayer.setStyle) {
                subLayer.setStyle({ color: color, fillColor: color });
            }
        });
    }
}

/**
 * Parse coordinate value from input element
 * @param {Element} container - Parent container
 * @param {string} selector - CSS selector
 * @returns {number|null} Parsed value or null
 */
function parseInputValue(container, selector) {
    const value = Number.parseFloat(container.querySelector(selector)?.value);
    return Number.isFinite(value) ? value : null;
}

/**
 * Update type-specific properties from popup
 */
function updateTypeSpecificFromPopup(feature, div, layer) {
    const props = feature.properties;
    const type = props.type;

    if (type === 'marker') {
        const lat = parseInputValue(div, '.lat-input');
        const lng = parseInputValue(div, '.lng-input');
        if (lat !== null && lng !== null) {
            feature.geometry.coordinates = [lng, lat];
            layer.setLatLng([lat, lng]);
        }
    } else if (type === 'circle') {
        const lat = parseInputValue(div, '.lat-input');
        const lng = parseInputValue(div, '.lng-input');
        const radius = parseInputValue(div, '.radius-input');
        if (lat !== null && lng !== null) {
            feature.geometry.coordinates = [lng, lat];
            layer.setLatLng([lat, lng]);
        }
        if (radius !== null) {
            props.radius = radius;
            layer.setRadius(radius);
        }
    } else if (type === 'line') {
        updateLineFromPopup(feature, div, layer);
    } else if (type === 'bearing') {
        updateBearingFromPopup(feature, div, layer);
    } else if (type === 'polygon') {
        const pointsText = div.querySelector('.points-input')?.value;
        const newPoints = parsePointsFromText(pointsText || '');
        if (newPoints.length >= 3) {
            feature.geometry.coordinates = [newPoints.map(p => [p.lng, p.lat])];
            layer.setLatLngs(newPoints.map(p => [p.lat, p.lng]));
        }
    } else if (type.startsWith('measurement-')) {
        updateMeasurementFromPopup(feature, div, layer);
    }
}

/**
 * Update line from popup
 */
function updateLineFromPopup(feature, div, layer) {
    const props = feature.properties;
    const pointsInput = div.querySelector('.points-input');

    if (pointsInput) {
        const newPoints = parsePointsFromText(pointsInput.value);
        if (newPoints.length >= 2) {
            feature.geometry.coordinates = newPoints.map(p => [p.lng, p.lat]);
            layer.setLatLngs(newPoints.map(p => [p.lat, p.lng]));
            const line = turf.lineString(feature.geometry.coordinates);
            props.distance = turf.length(line, { units: 'meters' });
        }
    } else {
        const startLat = parseInputValue(div, '.start-lat-input');
        const startLng = parseInputValue(div, '.start-lng-input');
        const endLat = parseInputValue(div, '.end-lat-input');
        const endLng = parseInputValue(div, '.end-lng-input');
        if (startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
            feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
            layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
            props.distance = state.map.distance([startLat, startLng], [endLat, endLng]);
        }
    }
}

/**
 * Update bearing from popup
 */
function updateBearingFromPopup(feature, div, layer) {
    const props = feature.properties;
    const startLat = parseInputValue(div, '.start-lat-input');
    const startLng = parseInputValue(div, '.start-lng-input');
    const endLat = parseInputValue(div, '.end-lat-input');
    const endLng = parseInputValue(div, '.end-lng-input');

    if (startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
        feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
        layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
        props.distance = state.map.distance([startLat, startLng], [endLat, endLng]);
    }
}

/**
 * Update measurement from popup (handles all measurement types)
 */
function updateMeasurementFromPopup(feature, div, layer) {
    const props = feature.properties;
    const type = props.type;

    if (type === 'measurement-distance' || type === 'measurement-bearing') {
        const startLat = parseInputValue(div, '.start-lat-input');
        const startLng = parseInputValue(div, '.start-lng-input');
        const endLat = parseInputValue(div, '.end-lat-input');
        const endLng = parseInputValue(div, '.end-lng-input');

        if (startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
            if (feature.geometry.type === 'GeometryCollection') {
                feature.geometry.geometries[0].coordinates = [[startLng, startLat], [endLng, endLat]];
            } else {
                feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
            }

            if (layer.setLatLngs) {
                layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
            } else if (layer instanceof L.LayerGroup) {
                layer.eachLayer(subLayer => {
                    if (subLayer.setLatLngs) {
                        subLayer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
                    }
                });
            }

            const distance = state.map.distance([startLat, startLng], [endLat, endLng]);
            props.distanceM = distance;
            props.distanceKm = distance / 1000;

            if (type === 'measurement-bearing') {
                const bearing = turf.bearing(
                    turf.point([startLng, startLat]),
                    turf.point([endLng, endLat])
                );
                props.bearing = (bearing + 360) % 360;
                props.cardinal = getCardinalDirection(props.bearing);
            }
        }
    }
    // Additional measurement type handlers could be added here
}

/**
 * Update the element list UI
 */
export function updateElementList() {
    const list = document.getElementById('elements-list');
    if (!list) return;

    list.innerHTML = '';

    // Gather all elements
    const allElements = state.features.map(feature => {
        const layer = state.featureLayers.get(feature.id);
        const props = feature.properties;
        return {
            id: feature.id,
            type: props.type,
            data: extractDataFromFeature(feature),
            layer: layer,
            folderId: props.folderId || null,
            visible: state.featureVisibility.get(feature.id) !== false
        };
    });

    // Add folder button
    const addFolderBtn = document.createElement('button');
    addFolderBtn.className = 'add-folder-btn';
    addFolderBtn.innerHTML = '<i class="fas fa-folder-plus"></i> Nouveau dossier';
    addFolderBtn.addEventListener('click', createFolder);
    list.appendChild(addFolderBtn);

    // Render folders
    state.folders.forEach(folder => {
        const folderElements = allElements.filter(el => el.folderId === folder.id);
        const folderEl = createFolderElement(folder, folderElements);
        list.appendChild(folderEl);
    });

    // Root elements
    const rootElements = allElements.filter(el => !el.folderId);
    if (rootElements.length > 0 || allElements.length === 0) {
        const rootContainer = document.createElement('div');
        rootContainer.className = 'root-elements';
        rootContainer.dataset.folderId = '';

        rootContainer.addEventListener('dragover', handleDragOver);
        rootContainer.addEventListener('dragleave', handleDragLeave);
        rootContainer.addEventListener('drop', handleDrop);

        rootElements.forEach(el => {
            const item = createElementItem(el);
            rootContainer.appendChild(item);
        });
        list.appendChild(rootContainer);
    }

    // Update count
    const countEl = document.getElementById('element-count');
    if (countEl) countEl.textContent = `(${allElements.length})`;

    // Update toggle all button
    const anyVisible = allElements.some(el => el.visible);
    updateToggleAllButton(anyVisible);
}

/**
 * Toggle element visibility
 * @param {string} id - Element ID
 */
export function toggleElementVisibility(id) {
    const currentVisibility = state.featureVisibility.get(id) !== false;
    const newVisibility = !currentVisibility;
    state.featureVisibility.set(id, newVisibility);

    const layer = state.featureLayers.get(id);
    if (layer) {
        if (newVisibility) {
            layer.addTo(state.map);
        } else {
            state.map.removeLayer(layer);
        }
    }

    updateElementList();
    saveState();
}

/**
 * Toggle visibility of all elements
 * @param {boolean} [forceVisible] - Force visibility state
 */
export function toggleAllElementsVisibility(forceVisible) {
    const targetVisibility = forceVisible ?? !state.features.some(f => state.featureVisibility.get(f.id) !== false);

    state.features.forEach(feature => {
        state.featureVisibility.set(feature.id, targetVisibility);
        const layer = state.featureLayers.get(feature.id);
        if (layer) {
            if (targetVisibility) {
                layer.addTo(state.map);
            } else {
                state.map.removeLayer(layer);
            }
        }
    });

    state.folders.forEach(folder => {
        folder.visible = targetVisibility;
    });

    updateToggleAllButton(targetVisibility);
    updateElementList();
    saveState();
}

/**
 * Update toggle all button icon
 */
function updateToggleAllButton(anyVisible) {
    const btn = document.getElementById('btn-toggle-all-visibility');
    if (!btn) return;

    const icon = btn.querySelector('i');
    if (anyVisible) {
        icon.className = 'fas fa-eye';
        btn.classList.remove('all-hidden');
        btn.title = 'Tout cacher';
    } else {
        icon.className = 'fas fa-eye-slash';
        btn.classList.add('all-hidden');
        btn.title = 'Tout montrer';
    }
}

/**
 * Delete an element
 * @param {string} id - Element ID
 */
export function deleteElement(id) {
    const featureIndex = state.features.findIndex(f => f.id === id);
    if (featureIndex !== -1) {
        const layer = state.featureLayers.get(id);
        if (layer) {
            if (layer.isPopupOpen?.()) layer.closePopup();
            state.map.removeLayer(layer);
            state.featureLayers.delete(id);
        }
        state.featureVisibility.delete(id);
        state.features.splice(featureIndex, 1);
        updateElementList();
        saveState();
    }
}

// Expose for HTML access
globalThis.deleteElement = deleteElement;
