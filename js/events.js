/**
 * Event handlers - mouse move, map click, map double-click
 * @module events
 */

import {
    finishLine,
    finishPolygon,
    handleLineClick,
    handlePolygonClick,
    setActiveTool,
    updateLineTempLayer,
    updateTempLayer
} from './drawing.js';
import { createElement } from './elements.js';
import { completeMeasurement, handleMeasurementClick } from './measurements.js';
import { state } from './state.js';
import { openModal } from './utils.js';

/**
 * Handle mouse move events on the map
 * @param {L.MouseEvent} e - Leaflet mouse event
 */
export function handleMouseMove(e) {
    const { lat, lng } = e.latlng;
    document.getElementById('info-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    // Handle measurement tool visual feedback
    if (state.measurement.active && state.measurement.points.length > 0) {
        renderMeasurementPreview(e.latlng);
        return;
    }

    if (!state.activeTool) return;

    // Visual feedback for drawing tools
    if (state.drawing.cursorLayer) {
        state.map.removeLayer(state.drawing.cursorLayer);
    }

    if (state.activeTool === 'polygon' && state.drawing.points.length > 0) {
        renderPolygonPreview(e.latlng);
    } else if (state.activeTool === 'line' && state.drawing.points?.length > 0) {
        renderLinePreview(e.latlng);
    } else if (state.activeTool === 'bearing' && state.drawing.startPoint) {
        renderBearingPreview(e.latlng);
    }
}

/**
 * Render measurement preview line/polygon
 * @param {L.LatLng} latlng - Current mouse position
 */
function renderMeasurementPreview(latlng) {
    const { lat, lng } = latlng;
    const lastPoint = state.measurement.points[state.measurement.points.length - 1];

    if (state.drawing.cursorLayer) {
        state.map.removeLayer(state.drawing.cursorLayer);
    }

    const polygonMeasurements = ['area', 'center', 'centroid', 'bbox'];

    if (polygonMeasurements.includes(state.measurement.active) && state.measurement.points.length >= 1) {
        const previewPoints = [...state.measurement.points.map(p => [p.lat, p.lng]), [lat, lng]];
        state.drawing.cursorLayer = L.polygon(previewPoints, {
            color: '#16a085',
            dashArray: '5, 10',
            weight: 2,
            fillOpacity: 0.1,
            interactive: false
        }).addTo(state.map);
    } else {
        state.drawing.cursorLayer = L.polyline([[lastPoint.lat, lastPoint.lng], [lat, lng]], {
            color: '#16a085',
            dashArray: '5, 10',
            weight: 2,
            interactive: false
        }).addTo(state.map);
    }
}

/**
 * Render polygon drawing preview
 * @param {L.LatLng} latlng - Current mouse position
 */
function renderPolygonPreview(latlng) {
    const { lat, lng } = latlng;
    const previewPoints = [...state.drawing.points.map(p => [p.lat, p.lng]), [lat, lng]];

    state.drawing.cursorLayer = L.polygon(previewPoints, {
        color: 'red',
        dashArray: '5, 10',
        weight: 2,
        fillOpacity: 0.1,
        interactive: false
    }).addTo(state.map);
}

/**
 * Render line drawing preview
 * @param {L.LatLng} latlng - Current mouse position
 */
function renderLinePreview(latlng) {
    const { lat, lng } = latlng;
    const lastPoint = state.drawing.points[state.drawing.points.length - 1];

    state.drawing.cursorLayer = L.polyline([[lastPoint.lat, lastPoint.lng], [lat, lng]], {
        color: 'red',
        dashArray: '5, 10',
        weight: 2,
        interactive: false
    }).addTo(state.map);
}

/**
 * Render bearing line preview
 * @param {L.LatLng} latlng - Current mouse position
 */
function renderBearingPreview(latlng) {
    state.drawing.cursorLayer = L.polyline([state.drawing.startPoint, latlng], {
        color: 'red',
        dashArray: '5, 10',
        weight: 2,
        interactive: false
    }).addTo(state.map);
}

/**
 * Handle map click events
 * @param {L.MouseEvent} e - Leaflet mouse event
 */
export function handleMapClick(e) {
    // Handle measurement tools first
    if (state.measurement.active) {
        handleMeasurementClick(e.latlng);
        return;
    }

    if (!state.activeTool) return;

    const { lat, lng } = e.latlng;

    switch (state.activeTool) {
        case 'marker':
            createElement('marker', { lat, lng, title: 'Nouveau marqueur' });
            setActiveTool(null);
            break;
        case 'circle':
            state.drawing.center = { lat, lng };
            openModal('modal-circle');
            break;
        case 'line':
            handleLineClick(lat, lng);
            break;
        case 'polygon':
            handlePolygonClick(lat, lng);
            break;
        case 'bearing':
            state.drawing.startPoint = { lat, lng };
            openModal('modal-bearing');
            break;
    }
}

/**
 * Handle map double-click events
 * @param {L.MouseEvent} e - Leaflet mouse event
 */
export function handleMapDoubleClick(e) {
    // Handle polygon-based measurement double-click
    const polygonMeasurements = ['area', 'center', 'centroid', 'bbox'];
    if (polygonMeasurements.includes(state.measurement.active) && state.measurement.points.length >= 3) {
        L.DomEvent.stopPropagation(e);
        completeMeasurement();
        return;
    }

    // Handle line-based measurement double-click (along)
    if (state.measurement.active === 'along' && state.measurement.points.length >= 2) {
        L.DomEvent.stopPropagation(e);
        completeMeasurement();
        return;
    }

    // Handle line drawing double-click
    if (state.activeTool === 'line') {
        L.DomEvent.stopPropagation(e);
        if (state.drawing.points?.length >= 2) {
            finishLine();
        }
        return;
    }

    // Handle polygon drawing double-click
    if (state.activeTool === 'polygon') {
        L.DomEvent.stopPropagation(e);
        if (state.drawing.points?.length >= 3) {
            finishPolygon();
        }
        return;
    }
}

/**
 * Initialize context menu
 */
export function initContextMenu() {
    const menu = document.getElementById('context-menu');

    document.getElementById('map').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        menu.classList.remove('hidden');

        const containerPoint = state.map.mouseEventToContainerPoint(e);
        state.contextMenuLocation = state.map.containerPointToLatLng(containerPoint);
    });

    menu.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            menu.classList.add('hidden');

            if (!state.contextMenuLocation) return;

            const { lat, lng } = state.contextMenuLocation;

            setActiveTool(action);

            switch (action) {
                case 'marker':
                    createElement('marker', { lat, lng, title: 'Nouveau marqueur' });
                    setActiveTool(null);
                    break;
                case 'circle':
                    state.drawing.center = { lat, lng };
                    openModal('modal-circle');
                    break;
                case 'line':
                    state.drawing.points = [{ lat, lng }];
                    updateLineTempLayer();
                    break;
                case 'bearing':
                    state.drawing.startPoint = { lat, lng };
                    openModal('modal-bearing');
                    break;
                case 'polygon':
                    state.drawing.points = [{ lat, lng }];
                    updateTempLayer();
                    break;
            }
        });
    });
}
