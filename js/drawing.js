/**
 * Drawing tools - marker, circle, line, polygon, bearing
 * @module drawing
 */

import { createElement } from './elements.js';
import { clearCursorLayer, resetDrawingState as resetState, state } from './state.js';
import { calculateDestination, closeModal } from './utils.js';

/**
 * Set the active drawing tool
 * @param {string|null} tool - Tool name or null to deactivate
 */
export function setActiveTool(tool) {
    clearCursorLayer();

    // Cleanup previous tool state
    if (state.activeTool === 'polygon' || state.activeTool === 'line') {
        state.map.doubleClickZoom.enable();
        resetDrawingState();
    }

    state.activeTool = tool;

    // Setup new tool state
    if (tool === 'polygon' || tool === 'line') {
        state.map.doubleClickZoom.disable();
    }

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

    if (tool) {
        document.getElementById(`tool-${tool}`)?.classList.add('active');
        document.querySelector('.leaflet-container')?.classList.add('drawing-cursor');
    } else {
        document.querySelector('.leaflet-container')?.classList.remove('drawing-cursor');
    }
}

/**
 * Reset drawing state
 */
export function resetDrawingState() {
    resetState();
}

/**
 * Handle click for line drawing
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export function handleLineClick(lat, lng) {
    if (!state.drawing.points) state.drawing.points = [];

    state.drawing.points.push({ lat, lng });
    updateLineTempLayer();
    clearCursorLayer();
}

/** @constant {Object} Temp layer marker styles */
const TEMP_MARKER_STYLE = {
    color: 'red',
    fillColor: 'red',
    fillOpacity: 1,
    interactive: false
};

/** @constant {Object} Temp layer line styles */
const TEMP_LINE_STYLE = {
    color: 'red',
    weight: 2,
    interactive: false
};

/**
 * Create vertex markers for temp layer
 * @param {Array<{lat: number, lng: number}>} points - Points to mark
 * @param {L.LayerGroup} layerGroup - Layer group to add markers to
 */
function createVertexMarkers(points, layerGroup) {
    points.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], {
            ...TEMP_MARKER_STYLE,
            radius: i === 0 ? 8 : 5,
            fillColor: i === 0 ? '#ff6b6b' : 'red'
        }).addTo(layerGroup);
    });
}

/**
 * Update temporary layer for drawing (line or polygon)
 * @param {string} [type='line'] - Drawing type ('line' or 'polygon')
 */
function updateDrawingTempLayer() {
    if (state.drawing.tempLayer) {
        state.map.removeLayer(state.drawing.tempLayer);
    }

    if (state.drawing.points.length >= 1) {
        const pointsLatLng = state.drawing.points.map(p => [p.lat, p.lng]);
        state.drawing.tempLayer = L.layerGroup();

        // Add polyline for clicked points
        if (state.drawing.points.length >= 2) {
            L.polyline(pointsLatLng, TEMP_LINE_STYLE).addTo(state.drawing.tempLayer);
        }

        // Add markers at each vertex
        createVertexMarkers(state.drawing.points, state.drawing.tempLayer);

        state.drawing.tempLayer.addTo(state.map);
    }
}

/**
 * Update temporary layer for line drawing
 */
export function updateLineTempLayer() {
    updateDrawingTempLayer();
}

/**
 * Finish line drawing
 */
export function finishLine() {
    if (state.drawing.points.length >= 2) {
        createElement('line', {
            points: state.drawing.points,
            title: 'Ligne'
        });
    }
    resetDrawingState();
    setActiveTool(null);
}

/**
 * Handle click for polygon drawing
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export function handlePolygonClick(lat, lng) {
    if (!state.drawing.points) state.drawing.points = [];

    state.drawing.points.push({ lat, lng });
    updateTempLayer();
    clearCursorLayer();
}

/**
 * Update temporary layer for polygon drawing
 */
export function updateTempLayer() {
    updateDrawingTempLayer();
}

/**
 * Finish polygon drawing
 */
export function finishPolygon() {
    createElement('polygon', {
        points: state.drawing.points,
        title: 'Polygone'
    });
    resetDrawingState();
    setActiveTool(null);
}

/**
 * Create circle from modal
 */
export function createCircle() {
    const radius = Number.parseFloat(document.getElementById('circle-radius').value);

    if (radius > 0 && state.drawing.center) {
        createElement('circle', {
            center: state.drawing.center,
            radius: radius
        });
        closeModal('modal-circle');
        setActiveTool(null);
        state.drawing.center = null;
    }
}

/**
 * Create bearing line from modal
 */
export function createBearingLine() {
    const distance = Number.parseFloat(document.getElementById('bearing-distance').value);
    const angle = Number.parseFloat(document.getElementById('bearing-angle').value);

    if (distance > 0 && state.drawing.startPoint) {
        const end = calculateDestination(state.drawing.startPoint, distance, angle);
        createElement('bearing', {
            start: state.drawing.startPoint,
            end: end,
            distance: distance,
            bearing: angle
        });
        closeModal('modal-bearing');
        setActiveTool(null);
        state.drawing.startPoint = null;
    }
}

/**
 * Initialize drawing tools
 */
export function initTools() {
    // Tool buttons
    ['marker', 'circle', 'line', 'polygon', 'bearing'].forEach(tool => {
        document.getElementById(`tool-${tool}`)?.addEventListener('click', () => setActiveTool(tool));
    });

    // Modal buttons
    document.getElementById('btn-cancel-circle')?.addEventListener('click', () => closeModal('modal-circle'));
    document.getElementById('btn-confirm-circle')?.addEventListener('click', createCircle);
    document.getElementById('btn-cancel-bearing')?.addEventListener('click', () => closeModal('modal-bearing'));
    document.getElementById('btn-confirm-bearing')?.addEventListener('click', createBearingLine);

    // Escape key handler
    document.addEventListener('keydown', handleEscapeKey);
}

/**
 * Handle escape key to cancel drawing or measurement
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleEscapeKey(e) {
    if (e.key !== 'Escape') return;

    // Import dynamically to avoid circular dependency
    import('./measurements.js').then(({ cancelMeasurement }) => {
        if (state.measurement.active) {
            cancelMeasurement();
        } else if (state.activeTool === 'line' && state.drawing.points?.length > 0) {
            if (state.drawing.points.length >= 2) {
                finishLine();
            } else {
                resetDrawingState();
                setActiveTool(null);
            }
        } else if (state.activeTool) {
            resetDrawingState();
            setActiveTool(null);
        }
    });
}
