/**
 * Measurement tools - distance, area, bearing, center, centroid, bbox, along
 * @module measurements
 */

import { CONFIG } from './config.js';
import { setActiveTool } from './drawing.js';
import { createPopupContent, updateElementList } from './elements.js';
import { elementToGeoJSON } from './geojson.js';
import { saveState } from './persistence.js';
import { clearCursorLayer, resetMeasurementState, state } from './state.js';
import { closeModal, generateId, getCardinalDirection, openModal } from './utils.js';

/**
 * Initialize measurement tools
 */
export function initMeasurementTools() {
    // Tool buttons
    document.getElementById('measure-distance')?.addEventListener('click', () => startMeasurement('distance'));
    document.getElementById('measure-area')?.addEventListener('click', () => startMeasurement('area'));
    document.getElementById('measure-bearing')?.addEventListener('click', () => startMeasurement('bearing'));
    document.getElementById('measure-center')?.addEventListener('click', () => startMeasurement('center'));
    document.getElementById('measure-centroid')?.addEventListener('click', () => startMeasurement('centroid'));
    document.getElementById('measure-bbox')?.addEventListener('click', () => startMeasurement('bbox'));
    document.getElementById('measure-along')?.addEventListener('click', () => startMeasurement('along'));

    // Cancel button
    document.getElementById('cancel-measurement')?.addEventListener('click', cancelMeasurement);

    // Modal buttons
    document.getElementById('btn-discard-measurement')?.addEventListener('click', () => {
        closeModal('modal-measurement-result');
        cancelMeasurement();
    });
    document.getElementById('btn-save-measurement')?.addEventListener('click', saveMeasurementAsElement);
}

/**
 * Start a measurement
 * @param {string} type - Measurement type
 */
export function startMeasurement(type) {
    setActiveTool(null);
    cancelMeasurement();

    state.measurement.active = type;

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`measure-${type}`)?.classList.add('active');

    const statusEl = document.getElementById('measurement-status');
    const instructionEl = document.getElementById('measurement-instruction');
    statusEl?.classList.remove('hidden');

    const instructions = {
        'distance': 'Cliquez sur le premier point, puis sur le second',
        'area': 'Cliquez pour tracer le polygone. Double-cliquez pour terminer',
        'bearing': 'Cliquez sur le point de départ, puis le point d\'arrivée',
        'center': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'centroid': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'bbox': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'along': 'Cliquez pour tracer la ligne. Double-cliquez pour terminer'
    };
    if (instructionEl) instructionEl.textContent = instructions[type];

    document.querySelector('.leaflet-container')?.classList.add('drawing-cursor');

    if (['area', 'center', 'centroid', 'bbox', 'along'].includes(type)) {
        state.map.doubleClickZoom.disable();
    }
}

/**
 * Cancel current measurement
 */
export function cancelMeasurement() {
    resetMeasurementState();
    clearCursorLayer();

    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('measurement-status')?.classList.add('hidden');
    document.querySelector('.leaflet-container')?.classList.remove('drawing-cursor');

    state.map?.doubleClickZoom.enable();
}

/**
 * Handle click during measurement
 * @param {L.LatLng} latlng - Click location
 */
export function handleMeasurementClick(latlng) {
    const { lat, lng } = latlng;
    state.measurement.points.push({ lat, lng });

    // Add temporary marker
    const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#16a085',
        fillColor: '#16a085',
        fillOpacity: 1,
        interactive: false
    }).addTo(state.map);
    state.measurement.tempLayers.push(marker);

    const type = state.measurement.active;
    const points = state.measurement.points;

    switch (type) {
        case 'distance':
        case 'bearing':
            if (points.length === 2) {
                completeMeasurement();
            } else {
                document.getElementById('measurement-instruction').textContent = 'Cliquez sur le second point';
            }
            break;
        case 'area':
        case 'center':
        case 'centroid':
        case 'bbox':
            if (points.length >= 2) {
                const line = L.polyline(points.map(p => [p.lat, p.lng]), {
                    color: '#16a085',
                    weight: 2,
                    interactive: false
                }).addTo(state.map);
                state.measurement.tempLayers.push(line);
            }
            document.getElementById('measurement-instruction').textContent =
                `${points.length} points. Double-cliquez pour terminer (min 3)`;
            break;
        case 'along':
            if (points.length >= 2) {
                const line = L.polyline(points.map(p => [p.lat, p.lng]), {
                    color: '#16a085',
                    weight: 2,
                    interactive: false
                }).addTo(state.map);
                state.measurement.tempLayers.push(line);
            }
            document.getElementById('measurement-instruction').textContent =
                `${points.length} points. Double-cliquez pour terminer (min 2)`;
            break;
    }
}

/**
 * Complete the current measurement
 */
export function completeMeasurement() {
    const type = state.measurement.active;
    const points = state.measurement.points;

    if (!type || points.length < 2) return;
    if (['area', 'center', 'centroid', 'bbox'].includes(type) && points.length < 3) return;

    let result;

    switch (type) {
        case 'distance':
            result = calculateDistance(points[0], points[1]);
            break;
        case 'bearing':
            result = calculateBearing(points[0], points[1]);
            break;
        case 'area':
            result = calculateArea(points);
            break;
        case 'center':
            result = calculateCenter(points);
            break;
        case 'centroid':
            result = calculateCentroid(points);
            break;
        case 'bbox':
            result = calculateBbox(points);
            break;
        case 'along':
            result = calculateAlong(points);
            break;
    }

    state.measurement.result = result;
    showMeasurementResult(result);
}

// Measurement calculation functions
function calculateDistance(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;

    return {
        type: 'measurement-distance',
        title: 'Mesure de distance',
        data: { start: p1, end: p2, distanceKm, distanceM },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Distance:</span>
                <span class="result-value">${distanceM < 1000 ? distanceM.toFixed(2) + ' m' : distanceKm.toFixed(3) + ' km'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Point A:</span>
                <span class="result-value">${p1.lat.toFixed(6)}, ${p1.lng.toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Point B:</span>
                <span class="result-value">${p2.lat.toFixed(6)}, ${p2.lng.toFixed(6)}</span>
            </div>
        `
    };
}

function calculateBearing(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);
    const bearing = turf.bearing(from, to);
    const normalizedBearing = bearing < 0 ? bearing + 360 : bearing;
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;
    const cardinal = getCardinalDirection(normalizedBearing);

    return {
        type: 'measurement-bearing',
        title: 'Mesure d\'azimut',
        data: { start: p1, end: p2, bearing: normalizedBearing, cardinal, distanceKm, distanceM },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Azimut:</span>
                <span class="result-value">${normalizedBearing.toFixed(2)}° (${cardinal})</span>
            </div>
            <div class="result-item">
                <span class="result-label">Distance:</span>
                <span class="result-value">${distanceM < 1000 ? distanceM.toFixed(2) + ' m' : distanceKm.toFixed(3) + ' km'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Point de départ:</span>
                <span class="result-value">${p1.lat.toFixed(6)}, ${p1.lng.toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Point d'arrivée:</span>
                <span class="result-value">${p2.lat.toFixed(6)}, ${p2.lng.toFixed(6)}</span>
            </div>
        `
    };
}

function calculateArea(points) {
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    const polygon = turf.polygon([coords]);
    const areaM2 = turf.area(polygon);
    const areaKm2 = areaM2 / 1000000;
    const areaHa = areaM2 / 10000;
    const line = turf.lineString(coords);
    const perimeterKm = turf.length(line, { units: 'kilometers' });
    const perimeterM = perimeterKm * 1000;

    return {
        type: 'measurement-area',
        title: 'Mesure de surface',
        data: { points, areaM2, areaKm2, areaHa, perimeterM, perimeterKm },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Surface:</span>
                <span class="result-value">${areaM2 < 10000 ? areaM2.toFixed(2) + ' m²' : areaHa.toFixed(4) + ' ha'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Périmètre:</span>
                <span class="result-value">${perimeterM < 1000 ? perimeterM.toFixed(2) + ' m' : perimeterKm.toFixed(3) + ' km'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Nombre de points:</span>
                <span class="result-value">${points.length}</span>
            </div>
        `
    };
}

function calculateCenter(points) {
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    const polygon = turf.polygon([coords]);
    const centerPoint = turf.center(polygon);
    const centerLat = centerPoint.geometry.coordinates[1];
    const centerLng = centerPoint.geometry.coordinates[0];
    const areaM2 = turf.area(polygon);
    const areaHa = areaM2 / 10000;

    return {
        type: 'measurement-center',
        title: 'Centre de zone',
        data: { points, center: { lat: centerLat, lng: centerLng }, areaM2, areaHa },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Centre:</span>
                <span class="result-value">${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Surface:</span>
                <span class="result-value">${areaM2 < 10000 ? areaM2.toFixed(2) + ' m²' : areaHa.toFixed(4) + ' ha'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Nombre de points:</span>
                <span class="result-value">${points.length}</span>
            </div>
        `
    };
}

function calculateCentroid(points) {
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    const polygon = turf.polygon([coords]);
    const centroid = turf.centerOfMass(polygon);
    const centroidLat = centroid.geometry.coordinates[1];
    const centroidLng = centroid.geometry.coordinates[0];
    const areaM2 = turf.area(polygon);
    const areaHa = areaM2 / 10000;

    return {
        type: 'measurement-centroid',
        title: 'Centre de masse',
        data: { points, centroid: { lat: centroidLat, lng: centroidLng }, areaM2, areaHa },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Centre de masse:</span>
                <span class="result-value">${centroidLat.toFixed(6)}, ${centroidLng.toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Surface:</span>
                <span class="result-value">${areaM2 < 10000 ? areaM2.toFixed(2) + ' m²' : areaHa.toFixed(4) + ' ha'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Nombre de points:</span>
                <span class="result-value">${points.length}</span>
            </div>
        `
    };
}

function calculateBbox(points) {
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    const polygon = turf.polygon([coords]);
    const bbox = turf.bbox(polygon);
    const bboxPolygon = turf.bboxPolygon(bbox);
    const bboxArea = turf.area(bboxPolygon);
    const bboxAreaHa = bboxArea / 10000;
    const width = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: 'kilometers' }) * 1000;
    const height = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: 'kilometers' }) * 1000;

    return {
        type: 'measurement-bbox',
        title: 'Boîte englobante',
        data: {
            points,
            bbox: { minLat: bbox[1], minLng: bbox[0], maxLat: bbox[3], maxLng: bbox[2] },
            width, height, areaM2: bboxArea, areaHa: bboxAreaHa
        },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">SO (min):</span>
                <span class="result-value">${bbox[1].toFixed(6)}, ${bbox[0].toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">NE (max):</span>
                <span class="result-value">${bbox[3].toFixed(6)}, ${bbox[2].toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Dimensions:</span>
                <span class="result-value">${width.toFixed(1)}m × ${height.toFixed(1)}m</span>
            </div>
            <div class="result-item">
                <span class="result-label">Surface bbox:</span>
                <span class="result-value">${bboxArea < 10000 ? bboxArea.toFixed(2) + ' m²' : bboxAreaHa.toFixed(4) + ' ha'}</span>
            </div>
        `
    };
}

function calculateAlong(points) {
    const coords = points.map(p => [p.lng, p.lat]);
    const line = turf.lineString(coords);
    const lengthKm = turf.length(line, { units: 'kilometers' });
    const lengthM = lengthKm * 1000;
    const halfwayPoint = turf.along(line, lengthKm / 2, { units: 'kilometers' });
    const halfLat = halfwayPoint.geometry.coordinates[1];
    const halfLng = halfwayPoint.geometry.coordinates[0];

    return {
        type: 'measurement-along',
        title: 'Point sur ligne',
        data: {
            points, lengthM, lengthKm,
            alongPoint: { lat: halfLat, lng: halfLng },
            alongDistance: lengthM / 2,
            alongPercent: 50
        },
        displayHtml: `
            <div class="result-item">
                <span class="result-label">Longueur totale:</span>
                <span class="result-value">${lengthM < 1000 ? lengthM.toFixed(2) + ' m' : lengthKm.toFixed(3) + ' km'}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Point à 50%:</span>
                <span class="result-value">${halfLat.toFixed(6)}, ${halfLng.toFixed(6)}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Nombre de segments:</span>
                <span class="result-value">${points.length - 1}</span>
            </div>
        `
    };
}

/**
 * Show measurement result modal
 */
function showMeasurementResult(result) {
    const titles = {
        'measurement-distance': 'Distance mesurée',
        'measurement-bearing': 'Azimut calculé',
        'measurement-area': 'Surface mesurée',
        'measurement-center': 'Centre de zone',
        'measurement-centroid': 'Centre de masse',
        'measurement-bbox': 'Boîte englobante',
        'measurement-along': 'Point sur ligne'
    };

    const titleEl = document.getElementById('measurement-result-title');
    const contentEl = document.getElementById('measurement-result-content');
    const nameEl = document.getElementById('measurement-result-name');

    if (titleEl) titleEl.textContent = titles[result.type] || 'Résultat';
    if (contentEl) contentEl.innerHTML = result.displayHtml;
    if (nameEl) nameEl.value = result.title;

    openModal('modal-measurement-result');
}

/**
 * Save measurement as an element
 */
function saveMeasurementAsElement() {
    const result = state.measurement.result;
    if (!result) return;

    const title = document.getElementById('measurement-result-name')?.value || result.title;
    const id = generateId();
    const color = CONFIG.colors[result.type] || CONFIG.colors.default;

    let layer;
    const elementData = {
        ...result.data,
        title: title,
        measurementType: result.type,
        color: color
    };

    switch (result.type) {
        case 'measurement-distance':
        case 'measurement-bearing':
            layer = L.polyline([
                [result.data.start.lat, result.data.start.lng],
                [result.data.end.lat, result.data.end.lng]
            ], { color: color, weight: 3 });
            break;

        case 'measurement-area':
            layer = L.polygon(
                result.data.points.map(p => [p.lat, p.lng]),
                { color: color, fillColor: color, fillOpacity: 0.3, weight: 2 }
            );
            break;

        case 'measurement-center':
            layer = L.layerGroup([
                L.polygon(result.data.points.map(p => [p.lat, p.lng]), {
                    color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '5, 5'
                }),
                L.circleMarker([result.data.center.lat, result.data.center.lng], {
                    radius: 8, color, fillColor: color, fillOpacity: 1
                })
            ]);
            break;

        case 'measurement-centroid':
            layer = L.layerGroup([
                L.polygon(result.data.points.map(p => [p.lat, p.lng]), {
                    color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '5, 5'
                }),
                L.circleMarker([result.data.centroid.lat, result.data.centroid.lng], {
                    radius: 8, color, fillColor: color, fillOpacity: 1
                })
            ]);
            break;

        case 'measurement-bbox':
            layer = L.layerGroup([
                L.polygon(result.data.points.map(p => [p.lat, p.lng]), {
                    color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '5, 5'
                }),
                L.rectangle([
                    [result.data.bbox.minLat, result.data.bbox.minLng],
                    [result.data.bbox.maxLat, result.data.bbox.maxLng]
                ], { color, fillColor: color, fillOpacity: 0.1, weight: 3 })
            ]);
            break;

        case 'measurement-along':
            layer = L.layerGroup([
                L.polyline(result.data.points.map(p => [p.lat, p.lng]), { color, weight: 3 }),
                L.circleMarker([result.data.alongPoint.lat, result.data.alongPoint.lng], {
                    radius: 8, color, fillColor: color, fillOpacity: 1
                })
            ]);
            break;
    }

    layer.addTo(state.map);

    // Convert to GeoJSON and store
    const element = { id, type: result.type, data: elementData, layer };
    const feature = elementToGeoJSON(element);
    state.features.push(feature);
    state.featureLayers.set(id, layer);
    state.featureVisibility.set(id, true);

    // Bind popup
    if (layer instanceof L.LayerGroup) {
        layer.eachLayer(subLayer => {
            if (subLayer.bindPopup) {
                subLayer.bindPopup(() => createPopupContent(feature));
            }
        });
    } else if (layer.bindPopup) {
        layer.bindPopup(() => createPopupContent(feature));
    }

    updateElementList();
    saveState();
    closeModal('modal-measurement-result');
    cancelMeasurement();
}
