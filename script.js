/**
 * Configuration constants
 */
const CONFIG = {
    ignApiKey: localStorage.getItem('ignApiKey') || 'xxx_xxx_xxx',
    defaultCenter: [46.603354, 1.888334],
    defaultZoom: 6,
    maxZoom: 22,
    maxBuildingsForDissolve: 512,
    colors: {
        'default': '#3388ff',
        'highlight': '#ff5500',
        'buffer': 'blue',
        // Type-specific default colors
        'drawing-marker': '#e74c3c',
        'drawing-circle': '#9b59b6',
        'drawing-line': '#3498db',
        'drawing-bearing': '#f39c12',
        'drawing-polygon': '#2ecc71',
        'measurement-distance': '#16a085',
        'measurement-bearing': '#8e44ad',
        'measurement-area': '#27ae60',
        'measurement-center': '#e74c3c',
        'measurement-centroid': '#9b59b6',
        'measurement-bbox': '#3498db',
        'measurement-along': '#1abc9c'
    },
    endpoints: {
        wmtsPublic: 'https://data.geopf.fr/wmts',
        wmtsPrivate: 'https://data.geopf.fr/private/wmts',
        wfs: 'https://data.geopf.fr/wfs/ows',
        nominatim: 'https://nominatim.openstreetmap.org/search'
    }
};
/**
 * Application state
 */
const state = {
    map: null,
    layers: {},
    activeTool: null,
    features: [],
    featureLayers: new Map(),
    folders: [],
    featureVisibility: new Map(), // Track visibility of each feature by id
    drawing: {
        startPoint: null,
        points: [],
        tempLayer: null,
        cursorLayer: null,
        center: null
    },
    buildingsLayer: null,
    buffersLayer: null,
    contextMenuLocation: null,
    measurement: {
        active: null,
        points: [],
        tempLayers: [],
        result: null
    }
};
/**
 * Utility functions
 */

/**
 * Create a colored marker icon using Leaflet DivIcon
 * @param {string} color - The color for the marker (hex or CSS color)
 * @returns {L.DivIcon} A Leaflet DivIcon with the specified color
 */
function createColoredMarkerIcon(color) {
    const markerHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
            <path fill="${color}" stroke="#fff" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"/>
            <circle fill="#fff" cx="12" cy="12" r="5"/>
        </svg>
    `;
    return L.divIcon({
        html: markerHtml,
        className: 'colored-marker-icon',
        iconSize: [24, 36],
        iconAnchor: [12, 36],
        popupAnchor: [0, -36]
    });
}

function calculateDistance(p1, p2) {
    return state.map.distance([p1.lat, p1.lng], [p2.lat, p2.lng]);
}

function calculateDestination(start, distance, bearing) {
    const R = 6371e3;
    const φ1 = start.lat * Math.PI / 180;
    const λ1 = start.lng * Math.PI / 180;
    const θ = bearing * Math.PI / 180;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(distance / R) + Math.cos(φ1) * Math.sin(distance / R) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(distance / R) * Math.cos(φ1), Math.cos(distance / R) - Math.sin(φ1) * Math.sin(φ2));
    return { lat: φ2 * 180 / Math.PI, lng: λ2 * 180 / Math.PI };
}

function getCardinalDirection(bearing) {
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const cardinalIndex = Math.round(bearing / 45) % 8;
    return cardinals[cardinalIndex];
}

function getIcon(type) {
    const icons = {
        'marker': '<i class="fas fa-map-marker-alt"></i>',
        'circle': '<i class="far fa-circle"></i>',
        'line': '<i class="fas fa-route"></i>',
        'bearing': '<i class="fas fa-location-arrow"></i>',
        'polygon': '<i class="fas fa-draw-polygon"></i>',
        'measurement-distance': '<i class="fas fa-ruler"></i>',
        'measurement-area': '<i class="fas fa-vector-square"></i>',
        'measurement-bearing': '<i class="fas fa-compass"></i>',
        'measurement-center': '<i class="fas fa-crosshairs"></i>',
        'measurement-centroid': '<i class="fas fa-bullseye"></i>',
        'measurement-bbox': '<i class="far fa-square"></i>',
        'measurement-along': '<i class="fas fa-map-pin"></i>'
    };
    return icons[type] || '';
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}
/**
 * Map initialization and info display
 */


function initMap() {
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        maxZoom: CONFIG.maxZoom
    });

    // Event Listeners
    state.map.on('moveend', () => {
        saveState();
        updateBuildings();
    });
    state.map.on('click', handleMapClick);
    state.map.on('dblclick', handleMapDoubleClick);
    state.map.on('mousedown', () => document.getElementById('context-menu').classList.add('hidden'));
    state.map.on('zoomend', updateInfo);
    state.map.on('mousemove', handleMouseMove);

    // Controls
    L.control.scale({ imperial: false }).addTo(state.map);

    updateInfo();
}

function updateInfo() {
    document.getElementById('info-zoom').textContent = state.map.getZoom();
}
/**
 * Layer management - IGN layers, buildings, buffers, WFS
 */


function initLayers() {
    // Base Layers
    const ignPlan = L.tileLayer(
        `${CONFIG.endpoints.wmtsPublic}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`,
        { attribution: '&copy; IGN', maxZoom: 22, maxNativeZoom: 19 }
    );

    const ignScan25 = L.tileLayer(
        `${CONFIG.endpoints.wmtsPrivate}?apikey=${CONFIG.ignApiKey}&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg`,
        { attribution: '&copy; IGN', maxZoom: 22, maxNativeZoom: 16, minZoom: 6 }
    );

    const ignOrthoBase = L.tileLayer(
        `${CONFIG.endpoints.wmtsPublic}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg`,
        { attribution: '&copy; IGN', maxZoom: 22, maxNativeZoom: 19 }
    );

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 22,
        maxNativeZoom: 19
    });

    state.layers.base = { 'scan25': ignScan25, 'plan': ignPlan, 'ortho': ignOrthoBase, 'osm': osm };
    state.layers.base['scan25'].addTo(state.map);

    // Overlays
    state.layers.overlayOrtho = L.tileLayer(
        `${CONFIG.endpoints.wmtsPublic}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg`,
        { attribution: '&copy; IGN', maxZoom: 19, opacity: 0.5 }
    );

    // Parc de Chartreuse layer
    state.layers.parcChartreuse = null;

    // Contour line layer
    state.layers.contourLine = null;

    setupLayerControls();
}

function setupLayerControls() {
    document.getElementById('base-layer-select').addEventListener('change', (e) => {
        Object.values(state.layers.base).forEach(layer => state.map.removeLayer(layer));
        state.layers.base[e.target.value].addTo(state.map);
    });

    document.getElementById('overlay-ortho').addEventListener('change', (e) => {
        const control = document.getElementById('opacity-control');
        if (e.target.checked) {
            state.layers.overlayOrtho.addTo(state.map);
            control.classList.remove('hidden');
        } else {
            state.map.removeLayer(state.layers.overlayOrtho);
            control.classList.add('hidden');
        }
    });

    document.getElementById('ortho-opacity').addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('opacity-value').textContent = `${val}%`;
        // Auto-check the overlay checkbox when changing opacity
        const checkbox = document.getElementById('overlay-ortho');
        if (!checkbox.checked) {
            checkbox.checked = true;
            state.layers.overlayOrtho.addTo(state.map);
            document.getElementById('opacity-control').classList.remove('hidden');
        }
        state.layers.overlayOrtho.setOpacity(val / 100);
    });

    document.getElementById('overlay-buildings').addEventListener('change', (e) => {
        if (e.target.checked) updateBuildings();
        else {
            if (state.buildingsLayer) state.map.removeLayer(state.buildingsLayer);
            if (state.buffersLayer) state.map.removeLayer(state.buffersLayer);
        }
    });

    document.getElementById('overlay-buffers').addEventListener('change', (e) => {
        document.getElementById('buffer-radius-control').classList.toggle('hidden', !e.target.checked);
        if (document.getElementById('overlay-buildings').checked) updateBuildings();
    });

    document.getElementById('buffer-radius').addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('buffer-radius-value').textContent = `${val}m`;
        // Auto-check the overlay checkboxes when changing buffer radius
        const buffersCheckbox = document.getElementById('overlay-buffers');
        const buildingsCheckbox = document.getElementById('overlay-buildings');
        if (!buffersCheckbox.checked) {
            buffersCheckbox.checked = true;
            document.getElementById('buffer-radius-control').classList.remove('hidden');
        }
        if (!buildingsCheckbox.checked) {
            buildingsCheckbox.checked = true;
        }
        updateBuildings();
    });

    document.getElementById('overlay-parc-chartreuse').addEventListener('change', async (e) => {
        if (e.target.checked) {
            await loadParcChartreuse();
        } else {
            if (state.layers.parcChartreuse) {
                state.map.removeLayer(state.layers.parcChartreuse);
            }
        }
    });

    // Contour line controls
    document.getElementById('overlay-contour').addEventListener('change', async (e) => {
        const controls = document.getElementById('contour-controls');
        if (e.target.checked) {
            controls.classList.remove('hidden');
            await loadContourLine();
        } else {
            controls.classList.add('hidden');
            if (state.layers.contourLine) {
                state.map.removeLayer(state.layers.contourLine);
            }
        }
    });

    const contourAltitudeInput = document.getElementById('contour-altitude');

    // Handle 'change' event (blur, enter, or spinner buttons) - round and update
    contourAltitudeInput.addEventListener('change', async (e) => {
        // Round to nearest multiple of 5
        let val = parseInt(e.target.value);
        if (isNaN(val)) return;
        val = Math.round(val / 5) * 5;
        val = Math.max(0, Math.min(5000, val)); // Clamp between 0 and 5000
        e.target.value = val;

        // Auto-check the overlay checkbox when changing altitude
        const checkbox = document.getElementById('overlay-contour');
        if (!checkbox.checked) {
            checkbox.checked = true;
            document.getElementById('contour-controls').classList.remove('hidden');
        }
        await loadContourLine();
    });
} async function updateBuildings() {
    if (!document.getElementById('overlay-buildings').checked) {
        document.getElementById('info-buildings').textContent = '0';
        return;
    }
    if (state.map.getZoom() < 16) {
        document.getElementById('info-buildings').textContent = '0 (Zoom < 16)';
        if (state.buildingsLayer) state.map.removeLayer(state.buildingsLayer);
        if (state.buffersLayer) state.map.removeLayer(state.buffersLayer);
        return;
    }

    const bounds = state.map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const wfsUrl = `${CONFIG.endpoints.wfs}?apikey=${CONFIG.ignApiKey}&SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:batiment&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&BBOX=${bbox}`;

    try {
        const response = await fetch(wfsUrl);
        const data = await response.json();
        document.getElementById('info-buildings').textContent = data.features ? data.features.length : 0;

        if (state.buildingsLayer) state.map.removeLayer(state.buildingsLayer);
        if (state.buffersLayer) state.map.removeLayer(state.buffersLayer);

        state.buildingsLayer = L.geoJSON(data, {
            style: { color: CONFIG.colors.highlight, weight: 1, fillColor: CONFIG.colors.highlight, fillOpacity: 0.4 },
            interactive: false
        }).addTo(state.map);

        if (document.getElementById('overlay-buffers').checked) {
            renderBuffers(data);
        }
    } catch (error) {
        console.error('WFS error:', error);
    }
}

function renderBuffers(data) {
    if (typeof turf !== 'undefined') {
        try {
            const bufferRadius = parseInt(document.getElementById('buffer-radius').value) / 1000; // Convert meters to km
            const bufferedCollection = turf.buffer(data, bufferRadius, { units: 'kilometers' });
            let finalGeoJSON = data.features.length <= CONFIG.maxBuildingsForDissolve
                ? turf.dissolve(bufferedCollection)
                : bufferedCollection;

            state.buffersLayer = L.geoJSON(finalGeoJSON, {
                style: { color: CONFIG.colors.buffer, weight: 1, fillColor: CONFIG.colors.buffer, fillOpacity: 0.2, dashArray: '5, 5' },
                interactive: false
            }).addTo(state.map);
        } catch (e) {
            console.error('Turf error:', e);
        }
    } else {
        console.warn('Turf.js not loaded');
    }
}

async function loadParcChartreuse() {
    try {
        // Use embedded data instead of fetching
        if (typeof PARC_CHARTREUSE_DATA === 'undefined') {
            throw new Error('Parc Chartreuse data not loaded');
        }

        if (state.layers.parcChartreuse) {
            state.map.removeLayer(state.layers.parcChartreuse);
        }

        state.layers.parcChartreuse = L.geoJSON(PARC_CHARTREUSE_DATA, {
            style: {
                color: '#d11212ff',
                weight: 3,
                fillColor: '#e31515ff',
                fillOpacity: 0.1,
                dashArray: '10, 5'
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(`<b>${feature.properties.name}</b><br>Source: ${feature.properties.source || 'Unknown'}`);
                }
            }
        }).addTo(state.map);
    } catch (error) {
        console.error('Error loading Parc de Chartreuse:', error);
        alert('Erreur lors du chargement du périmètre du Parc de Chartreuse');
    }
}

async function loadContourLine() {
    const altitude = parseInt(document.getElementById('contour-altitude').value);

    if (isNaN(altitude) || altitude < 0 || altitude > 5000) {
        alert('Veuillez entrer une altitude valide entre 0 et 5000 mètres');
        return;
    }

    // Remove existing contour layer
    if (state.layers.contourLine) {
        state.map.removeLayer(state.layers.contourLine);
    }

    // Check zoom level - vector tiles only available at zoom >= 14
    if (state.map.getZoom() < 14) {
        alert('Les courbes de niveau ne sont disponibles qu\'à partir du niveau de zoom 14.\nVeuillez zoomer davantage.');
        return;
    }

    // Use IGN vector tiles service (ISOHYPSE) - much faster than WFS
    // Tiles available at: https://data.geopf.fr/tms/1.0.0/ISOHYPSE/{z}/{x}/{y}.pbf
    const vectorTileUrl = 'https://data.geopf.fr/tms/1.0.0/ISOHYPSE/{z}/{x}/{y}.pbf';

    try {
        state.layers.contourLine = L.vectorGrid.protobuf(vectorTileUrl, {
            vectorTileLayerStyles: {
                // Layer name in the PBF is "courbe"
                courbe: (properties) => {
                    // Only show contour lines at the selected altitude
                    if (properties.altitude === altitude) {
                        return {
                            color: '#e74c3c',
                            weight: properties.importance === 'Principale' ? 5 : 3,
                            opacity: 0.9
                        };
                    }
                    // Hide other altitudes
                    return { opacity: 0, weight: 0 };
                }
            },
            interactive: true,
            maxZoom: 19,
            minZoom: 14,
            getFeatureId: (feature) => feature.properties.altitude
        });

        state.layers.contourLine.on('click', (e) => {
            if (e.layer.properties && e.layer.properties.altitude === altitude) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<b>Courbe de niveau</b><br>Altitude: ${e.layer.properties.altitude}m`)
                    .openOn(state.map);
            }
        });

        state.layers.contourLine.addTo(state.map);
        console.log(`Loaded contour line layer for altitude ${altitude}m using vector tiles`);
    } catch (error) {
        console.error('Error loading contour line:', error);
        alert(`Erreur lors du chargement de la courbe de niveau: ${error.message}`);
    }
}
/**
 * Event handlers - mouse move, map click, map double-click
 */


function handleMouseMove(e) {
    const { lat, lng } = e.latlng;
    document.getElementById('info-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    // Handle measurement tool visual feedback
    if (state.measurement.active && state.measurement.points.length > 0) {
        const lastPoint = state.measurement.points[state.measurement.points.length - 1];
        if (state.drawing.cursorLayer) state.map.removeLayer(state.drawing.cursorLayer);

        const polygonMeasurements = ['area', 'center', 'centroid', 'bbox'];
        if (polygonMeasurements.includes(state.measurement.active) && state.measurement.points.length >= 1) {
            // For polygon-based tools, show polygon preview
            const previewPoints = [...state.measurement.points.map(p => [p.lat, p.lng]), [lat, lng]];
            state.drawing.cursorLayer = L.polygon(previewPoints, {
                color: '#16a085',
                dashArray: '5, 10',
                weight: 2,
                fillOpacity: 0.1,
                interactive: false
            }).addTo(state.map);
        } else {
            // For other tools, show line preview
            state.drawing.cursorLayer = L.polyline([[lastPoint.lat, lastPoint.lng], [lat, lng]], {
                color: '#16a085',
                dashArray: '5, 10',
                weight: 2,
                interactive: false
            }).addTo(state.map);
        }
        return;
    }

    if (!state.activeTool) return;

    // Visual feedback for drawing tools
    if (state.drawing.cursorLayer) state.map.removeLayer(state.drawing.cursorLayer);

    if (state.activeTool === 'polygon' && state.drawing.points.length > 0) {
        // For polygon drawing, show polygon preview like measurement area
        const previewPoints = [...state.drawing.points.map(p => [p.lat, p.lng]), [lat, lng]];
        state.drawing.cursorLayer = L.polygon(previewPoints, {
            color: 'red',
            dashArray: '5, 10',
            weight: 2,
            fillOpacity: 0.1,
            interactive: false
        }).addTo(state.map);
    } else if (state.activeTool === 'line' && state.drawing.points && state.drawing.points.length > 0) {
        // For line drawing, show line preview extending from last point
        const lastPoint = state.drawing.points[state.drawing.points.length - 1];
        state.drawing.cursorLayer = L.polyline([[lastPoint.lat, lastPoint.lng], [lat, lng]], {
            color: 'red',
            dashArray: '5, 10',
            weight: 2,
            interactive: false
        }).addTo(state.map);
    } else {
        let points = [];
        if (state.activeTool === 'bearing' && state.drawing.startPoint) {
            points = [state.drawing.startPoint, e.latlng];
        }

        if (points.length > 0) {
            state.drawing.cursorLayer = L.polyline(points, {
                color: 'red',
                dashArray: '5, 10',
                weight: 2,
                interactive: false
            }).addTo(state.map);
        }
    }
}

function handleMapClick(e) {
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

function handleMapDoubleClick(e) {
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
        if (state.drawing.points && state.drawing.points.length >= 2) {
            finishLine();
        }
        return;
    }

    if (state.activeTool === 'polygon') {
        L.DomEvent.stopPropagation(e);
        // Any double-click finishes the polygon if we have at least 3 points
        if (state.drawing.points && state.drawing.points.length >= 3) {
            finishPolygon();
        }
        return;
    }
}
/**
 * Drawing tools - marker, circle, line, polygon, bearing
 */


function setActiveTool(tool) {
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
        document.getElementById(`tool-${tool}`).classList.add('active');
        document.querySelector('.leaflet-container').classList.add('drawing-cursor');
    } else {
        document.querySelector('.leaflet-container').classList.remove('drawing-cursor');
    }
}

function resetDrawingState() {
    if (state.drawing.tempLayer) state.map.removeLayer(state.drawing.tempLayer);
    state.drawing.points = [];
    state.drawing.tempLayer = null;
    state.drawing.startPoint = null;
    state.drawing.center = null;
}

function clearCursorLayer() {
    if (state.drawing.cursorLayer) {
        state.map.removeLayer(state.drawing.cursorLayer);
        state.drawing.cursorLayer = null;
    }
}

function updateTempLayer() {
    if (state.drawing.tempLayer) state.map.removeLayer(state.drawing.tempLayer);
    // Show polyline (not polygon) with markers at each vertex
    // The cursorLayer will show the full polygon preview with closing edge
    if (state.drawing.points.length >= 1) {
        const pointsLatLng = state.drawing.points.map(p => [p.lat, p.lng]);
        state.drawing.tempLayer = L.layerGroup();

        // Add polyline (open path) for clicked points - no closing edge
        if (state.drawing.points.length >= 2) {
            L.polyline(pointsLatLng, {
                color: 'red',
                weight: 2,
                interactive: false
            }).addTo(state.drawing.tempLayer);
        }

        // Add markers at each vertex
        state.drawing.points.forEach((p, i) => {
            L.circleMarker([p.lat, p.lng], {
                radius: i === 0 ? 8 : 5,
                color: 'red',
                fillColor: i === 0 ? '#ff6b6b' : 'red',
                fillOpacity: 1,
                interactive: false
            }).addTo(state.drawing.tempLayer);
        });

        state.drawing.tempLayer.addTo(state.map);
    }
}

function handleLineClick(lat, lng) {
    if (!state.drawing.points) state.drawing.points = [];

    state.drawing.points.push({ lat, lng });
    updateLineTempLayer();
    clearCursorLayer();
}

function updateLineTempLayer() {
    if (state.drawing.tempLayer) state.map.removeLayer(state.drawing.tempLayer);

    if (state.drawing.points.length >= 1) {
        const pointsLatLng = state.drawing.points.map(p => [p.lat, p.lng]);
        state.drawing.tempLayer = L.layerGroup();

        // Add polyline for clicked points
        if (state.drawing.points.length >= 2) {
            L.polyline(pointsLatLng, {
                color: 'red',
                weight: 2,
                interactive: false
            }).addTo(state.drawing.tempLayer);
        }

        // Add markers at each vertex
        state.drawing.points.forEach((p, i) => {
            L.circleMarker([p.lat, p.lng], {
                radius: i === 0 ? 8 : 5,
                color: 'red',
                fillColor: i === 0 ? '#ff6b6b' : 'red',
                fillOpacity: 1,
                interactive: false
            }).addTo(state.drawing.tempLayer);
        });

        state.drawing.tempLayer.addTo(state.map);
    }
}

function finishLine() {
    if (state.drawing.points.length >= 2) {
        createElement('line', {
            points: state.drawing.points,
            title: 'Ligne'
        });
    }
    resetDrawingState();
    setActiveTool(null);
}

function handlePolygonClick(lat, lng) {
    if (!state.drawing.points) state.drawing.points = [];

    state.drawing.points.push({ lat, lng });
    updateTempLayer();
    clearCursorLayer();
}

function finishPolygon() {
    createElement('polygon', {
        points: state.drawing.points,
        title: 'Polygone'
    });
    resetDrawingState();
    setActiveTool(null);
}

function createElement(type, data) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    if (!data.color) data.color = CONFIG.colors['drawing-' + type] || CONFIG.colors.default;
    if (!data.title) {
        data.title = {
            'marker': 'Marqueur',
            'circle': 'Cercle',
            'line': 'Ligne',
            'bearing': 'Ligne directionnelle',
            'polygon': 'Polygone'
        }[type] || type;
    }

    // Create GeoJSON feature using Turf
    let feature = null;
    const properties = {
        type: type,
        title: data.title,
        description: data.description || '',
        color: data.color,
        folderId: data.folderId || null // Folder assignment
    };

    switch (type) {
        case 'marker':
            feature = turf.point([data.lng, data.lat], properties);
            break;
        case 'circle':
            properties.radius = data.radius;
            feature = turf.point([data.center.lng, data.center.lat], properties);
            break;
        case 'line':
            // Support both old format (start/end) and new format (points array)
            if (data.points) {
                // New multi-point line format
                const lineCoords = data.points.map(p => [p.lng, p.lat]);
                const line = turf.lineString(lineCoords);
                properties.distance = turf.length(line, { units: 'meters' });
                feature = turf.lineString(lineCoords, properties);
            } else {
                // Old two-point format for backward compatibility
                if (!data.distance) data.distance = state.map.distance([data.start.lat, data.start.lng], [data.end.lat, data.end.lng]);
                properties.distance = data.distance;
                feature = turf.lineString([
                    [data.start.lng, data.start.lat],
                    [data.end.lng, data.end.lat]
                ], properties);
            }
            break;
        case 'bearing':
            if (!data.distance) data.distance = state.map.distance([data.start.lat, data.start.lng], [data.end.lat, data.end.lng]);
            properties.distance = data.distance;
            if (data.bearing !== undefined) properties.bearing = data.bearing;
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;
        case 'polygon':
            const polyCoords = data.points.map(p => [p.lng, p.lat]);
            polyCoords.push(polyCoords[0]); // Close the ring
            feature = turf.polygon([polyCoords], properties);
            break;
    }

    feature.id = id;

    // Create Leaflet layer from GeoJSON feature
    const layer = createLayerFromFeature(feature);
    layer.addTo(state.map);

    // Store feature and layer
    state.features.push(feature);
    state.featureLayers.set(id, layer);
    state.featureVisibility.set(id, true); // Visible by default

    // Bind popup
    layer.bindPopup(() => createPopupContent(feature));
    if (type === 'marker') layer.openPopup();

    updateElementList();
    saveState();
}

function createCircle() {
    const radius = parseFloat(document.getElementById('circle-radius').value);
    if (radius > 0 && state.drawing.center) {
        createElement('circle', { center: state.drawing.center, radius: radius });
        closeModal('modal-circle');
        setActiveTool(null);
        state.drawing.center = null;
    }
}

function createBearingLine() {
    const distance = parseFloat(document.getElementById('bearing-distance').value);
    const angle = parseFloat(document.getElementById('bearing-angle').value);
    if (distance > 0 && state.drawing.startPoint) {
        const end = calculateDestination(state.drawing.startPoint, distance, angle);
        createElement('bearing', { start: state.drawing.startPoint, end: end, distance: distance, bearing: angle });
        closeModal('modal-bearing');
        setActiveTool(null);
        state.drawing.startPoint = null;
    }
}
/**
 * Element management - CRUD, popups, list UI
 */


function createPopupContent(feature) {
    const div = document.createElement('div');
    div.className = 'popup-content';
    const props = feature.properties;
    const type = props.type;
    const id = feature.id;

    let fieldsHtml = createPopupField('Titre', 'text', props.title, 'title-input');
    fieldsHtml += createPopupField('Couleur', 'color', props.color || CONFIG.colors.default, 'color-input');

    const geom = feature.geometry;

    if (type === 'marker') {
        fieldsHtml += createPopupField('Latitude', 'number', geom.coordinates[1], 'lat-input');
        fieldsHtml += createPopupField('Longitude', 'number', geom.coordinates[0], 'lng-input');
    } else if (type === 'circle') {
        fieldsHtml += createPopupField('Centre Lat', 'number', geom.coordinates[1], 'lat-input');
        fieldsHtml += createPopupField('Centre Lng', 'number', geom.coordinates[0], 'lng-input');
        fieldsHtml += createPopupField('Rayon (m)', 'number', props.radius, 'radius-input');
    } else if (type === 'line') {
        // Handle both old 2-point format and new multi-point format
        const coords = geom.coordinates;
        if (coords.length === 2) {
            // Old 2-point format
            fieldsHtml += createPopupField('Départ Lat', 'number', coords[0][1], 'start-lat-input');
            fieldsHtml += createPopupField('Départ Lng', 'number', coords[0][0], 'start-lng-input');
            fieldsHtml += createPopupField('Arrivée Lat', 'number', coords[1][1], 'end-lat-input');
            fieldsHtml += createPopupField('Arrivée Lng', 'number', coords[1][0], 'end-lng-input');
        } else {
            // New multi-point format - use textarea like polygon
            const pointsStr = coords.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
            fieldsHtml += `
                <div class="popup-field">
                    <label class="popup-label">Points (Lat, Lng):</label>
                    <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
                </div>`;
        }
        // Show distance
        if (props.distance !== undefined) {
            fieldsHtml += `
                <div class="popup-field">
                    <label class="popup-label">Longueur:</label>
                    <span class="computed-value">${props.distance < 1000 ? props.distance.toFixed(2) + ' m' : (props.distance / 1000).toFixed(3) + ' km'}</span>
                </div>`;
        }
    } else if (type === 'bearing') {
        fieldsHtml += createPopupField('Départ Lat', 'number', geom.coordinates[0][1], 'start-lat-input');
        fieldsHtml += createPopupField('Départ Lng', 'number', geom.coordinates[0][0], 'start-lng-input');
        fieldsHtml += createPopupField('Arrivée Lat', 'number', geom.coordinates[1][1], 'end-lat-input');
        fieldsHtml += createPopupField('Arrivée Lng', 'number', geom.coordinates[1][0], 'end-lng-input');
    } else if (type === 'polygon') {
        const points = geom.coordinates[0].slice(0, -1);
        const pointsStr = points.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
        fieldsHtml += `
            <div class="popup-field">
                <label class="popup-label">Points (Lat, Lng):</label>
                <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
            </div>`;
    } else if (type.startsWith('measurement-')) {
        // Handle measurement types - points are editable, computed values shown as read-only
        if (type === 'measurement-distance' || type === 'measurement-bearing') {
            const coords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates : geom.coordinates;
            fieldsHtml += createPopupField('Point A - Lat', 'number', coords[0][1], 'start-lat-input');
            fieldsHtml += createPopupField('Point A - Lng', 'number', coords[0][0], 'start-lng-input');
            fieldsHtml += createPopupField('Point B - Lat', 'number', coords[1][1], 'end-lat-input');
            fieldsHtml += createPopupField('Point B - Lng', 'number', coords[1][0], 'end-lng-input');

            if (props.distanceM !== undefined) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Distance:</label>
                        <span class="computed-value">${props.distanceM < 1000 ? props.distanceM.toFixed(2) + ' m' : props.distanceKm.toFixed(3) + ' km'}</span>
                    </div>`;
            }

            if (type === 'measurement-bearing' && props.bearing !== undefined) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Direction:</label>
                        <span class="computed-value">${props.bearing.toFixed(1)}° (${props.cardinal})</span>
                    </div>`;
            }
        } else if (type === 'measurement-area' || type === 'measurement-center' || type === 'measurement-centroid' || type === 'measurement-bbox') {
            // Polygon-based measurements - editable points
            const polyCoords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates[0] : geom.coordinates[0];
            const points = polyCoords.slice(0, -1);
            const pointsStr = points.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
            fieldsHtml += `
                <div class="popup-field">
                    <label class="popup-label">Points (Lat, Lng):</label>
                    <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
                </div>`;

            if (props.areaM2 !== undefined) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Surface:</label>
                        <span class="computed-value">${props.areaM2 < 10000 ? props.areaM2.toFixed(2) + ' m²' : props.areaHa.toFixed(4) + ' ha'}</span>
                    </div>`;
            }

            if (type === 'measurement-center' && props.center) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Centre:</label>
                        <span class="computed-value">${props.center.lat.toFixed(6)}, ${props.center.lng.toFixed(6)}</span>
                    </div>`;
            }

            if (type === 'measurement-centroid' && props.centroid) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Centre de masse:</label>
                        <span class="computed-value">${props.centroid.lat.toFixed(6)}, ${props.centroid.lng.toFixed(6)}</span>
                    </div>`;
            }

            if (type === 'measurement-bbox' && props.bbox) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Dimensions:</label>
                        <span class="computed-value">${props.width.toFixed(1)}m × ${props.height.toFixed(1)}m</span>
                    </div>`;
            }
        } else if (type === 'measurement-along') {
            // Line-based measurement - editable points
            const lineCoords = geom.type === 'GeometryCollection' ? geom.geometries[0].coordinates : geom.coordinates;
            const pointsStr = lineCoords.map(p => `${p[1].toFixed(6)}, ${p[0].toFixed(6)}`).join('\n');
            fieldsHtml += `
                <div class="popup-field">
                    <label class="popup-label">Points (Lat, Lng):</label>
                    <textarea class="popup-textarea points-input" style="height: 100px;">${pointsStr}</textarea>
                </div>`;

            if (props.lengthM !== undefined) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Longueur totale:</label>
                        <span class="computed-value">${props.lengthM < 1000 ? props.lengthM.toFixed(2) + ' m' : props.lengthKm.toFixed(3) + ' km'}</span>
                    </div>`;
            }

            const alongPercent = props.alongPercent !== undefined ? props.alongPercent : 50;
            const alongDistance = props.alongDistance !== undefined ? props.alongDistance : (props.lengthM / 2);

            fieldsHtml += `
                <div class="popup-field">
                    <label class="popup-label">Position (%):</label>
                    <input type="number" step="0.1" class="popup-input along-percent-input" value="${alongPercent.toFixed(1)}" min="0" max="100">
                </div>
                <div class="popup-field">
                    <label class="popup-label">Position (m):</label>
                    <input type="number" step="0.1" class="popup-input along-distance-input" value="${alongDistance.toFixed(2)}" min="0" max="${props.lengthM}">
                </div>`;

            if (props.alongPoint) {
                fieldsHtml += `
                    <div class="popup-field">
                        <label class="popup-label">Point calculé:</label>
                        <span class="computed-value along-point-display">${props.alongPoint.lat.toFixed(6)}, ${props.alongPoint.lng.toFixed(6)}</span>
                    </div>`;
            }
        }
    }

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

    // Special handling for measurement-along: synchronize % and meters inputs
    if (type === 'measurement-along') {
        const percentInput = div.querySelector('.along-percent-input');
        const distanceInput = div.querySelector('.along-distance-input');
        const pointDisplay = div.querySelector('.along-point-display');

        if (percentInput && distanceInput && pointDisplay) {
            const lengthM = props.lengthM;

            // Update distance when percent changes
            percentInput.addEventListener('input', (e) => {
                const percent = parseFloat(e.target.value);
                if (!isNaN(percent) && lengthM) {
                    const distance = (percent / 100) * lengthM;
                    distanceInput.value = distance.toFixed(2);

                    // Recalculate point in real-time
                    updateAlongPoint(feature, distance, pointDisplay);
                }
            });

            // Update percent when distance changes
            distanceInput.addEventListener('input', (e) => {
                const distance = parseFloat(e.target.value);
                if (!isNaN(distance) && lengthM) {
                    const percent = (distance / lengthM) * 100;
                    percentInput.value = percent.toFixed(1);

                    // Recalculate point in real-time
                    updateAlongPoint(feature, distance, pointDisplay);
                }
            });
        }
    }

    return div;
}

// Helper function to update along point display in real-time
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

function createPopupField(label, type, value, className) {
    return `
        <div class="popup-field">
            <label class="popup-label">${label}:</label>
            <input type="${type}" step="any" class="popup-input ${className}" value="${value || ''}">
        </div>
    `;
}

function parsePointsFromText(text) {
    const points = [];
    text.split('\n').forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2) {
            const lat = parseFloat(parts[0].trim());
            const lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng });
        }
    });
    return points;
}

function updateElementFromPopup(feature, div) {
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
        // Apply color to layer (handle both simple layers and LayerGroups)
        if (type === 'marker' && layer.setIcon) {
            // Update marker icon with new color
            layer.setIcon(createColoredMarkerIcon(props.color));
        } else if (layer.setStyle) {
            layer.setStyle({ color: props.color, fillColor: props.color });
        } else if (layer instanceof L.LayerGroup) {
            layer.eachLayer(subLayer => {
                if (subLayer.setStyle) {
                    subLayer.setStyle({ color: props.color, fillColor: props.color });
                }
            });
        }
    }

    // Type specific updates
    if (type === 'marker') {
        const lat = parseFloat(div.querySelector('.lat-input').value);
        const lng = parseFloat(div.querySelector('.lng-input').value);
        if (!isNaN(lat) && !isNaN(lng)) {
            feature.geometry.coordinates = [lng, lat];
            layer.setLatLng([lat, lng]);
        }
    } else if (type === 'circle') {
        const lat = parseFloat(div.querySelector('.lat-input').value);
        const lng = parseFloat(div.querySelector('.lng-input').value);
        const radius = parseFloat(div.querySelector('.radius-input').value);
        if (!isNaN(lat) && !isNaN(lng)) {
            feature.geometry.coordinates = [lng, lat];
            layer.setLatLng([lat, lng]);
        }
        if (!isNaN(radius)) {
            props.radius = radius;
            layer.setRadius(radius);
        }
    } else if (type === 'line') {
        // Handle both old 2-point format and new multi-point format
        const pointsInput = div.querySelector('.points-input');
        if (pointsInput) {
            // Multi-point format
            const pointsText = pointsInput.value;
            const newPoints = parsePointsFromText(pointsText);
            if (newPoints.length >= 2) {
                feature.geometry.coordinates = newPoints.map(p => [p.lng, p.lat]);
                layer.setLatLngs(newPoints.map(p => [p.lat, p.lng]));
                // Recalculate distance
                const line = turf.lineString(feature.geometry.coordinates);
                props.distance = turf.length(line, { units: 'meters' });
            }
        } else {
            // Old 2-point format
            const startLat = parseFloat(div.querySelector('.start-lat-input').value);
            const startLng = parseFloat(div.querySelector('.start-lng-input').value);
            const endLat = parseFloat(div.querySelector('.end-lat-input').value);
            const endLng = parseFloat(div.querySelector('.end-lng-input').value);
            if (!isNaN(startLat) && !isNaN(startLng) && !isNaN(endLat) && !isNaN(endLng)) {
                feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
                layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
                props.distance = state.map.distance([startLat, startLng], [endLat, endLng]);
            }
        }
    } else if (type === 'bearing') {
        const startLat = parseFloat(div.querySelector('.start-lat-input').value);
        const startLng = parseFloat(div.querySelector('.start-lng-input').value);
        const endLat = parseFloat(div.querySelector('.end-lat-input').value);
        const endLng = parseFloat(div.querySelector('.end-lng-input').value);
        if (!isNaN(startLat) && !isNaN(startLng) && !isNaN(endLat) && !isNaN(endLng)) {
            feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
            layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
            props.distance = state.map.distance([startLat, startLng], [endLat, endLng]);
        }
    } else if (type === 'polygon') {
        const pointsText = div.querySelector('.points-input').value;
        const newPoints = parsePointsFromText(pointsText);
        if (newPoints.length >= 3) {
            feature.geometry.coordinates = [newPoints.map(p => [p.lng, p.lat])];
            layer.setLatLngs(newPoints.map(p => [p.lat, p.lng]));
        }
    } else if (type.startsWith('measurement-')) {
        // Handle measurement types
        if (type === 'measurement-distance' || type === 'measurement-bearing') {
            const startLat = parseFloat(div.querySelector('.start-lat-input').value);
            const startLng = parseFloat(div.querySelector('.start-lng-input').value);
            const endLat = parseFloat(div.querySelector('.end-lat-input').value);
            const endLng = parseFloat(div.querySelector('.end-lng-input').value);

            if (!isNaN(startLat) && !isNaN(startLng) && !isNaN(endLat) && !isNaN(endLng)) {
                // Update geometry
                if (feature.geometry.type === 'GeometryCollection') {
                    feature.geometry.geometries[0].coordinates = [[startLng, startLat], [endLng, endLat]];
                } else {
                    feature.geometry.coordinates = [[startLng, startLat], [endLng, endLat]];
                }

                // Update the layer - handle both single polyline and layerGroups
                if (layer.setLatLngs) {
                    layer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
                } else if (layer instanceof L.LayerGroup) {
                    layer.eachLayer(subLayer => {
                        if (subLayer.setLatLngs) {
                            subLayer.setLatLngs([[startLat, startLng], [endLat, endLng]]);
                        }
                    });
                }
            }

            // Recalculate distance
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
        } else if (type === 'measurement-area' || type === 'measurement-center' || type === 'measurement-centroid' || type === 'measurement-bbox') {
            // Polygon-based measurements
            const pointsText = div.querySelector('.points-input').value;
            const newPoints = parsePointsFromText(pointsText);
            if (newPoints.length >= 3) {
                const coords = newPoints.map(p => [p.lng, p.lat]);
                coords.push(coords[0]); // Close the ring

                // Update geometry
                if (feature.geometry.type === 'GeometryCollection') {
                    feature.geometry.geometries[0].coordinates = [coords];
                } else {
                    feature.geometry.coordinates = [coords];
                }

                // Update layer
                const latLngs = newPoints.map(p => [p.lat, p.lng]);
                if (layer.setLatLngs) {
                    layer.setLatLngs(latLngs);
                } else if (layer instanceof L.LayerGroup) {
                    layer.eachLayer(subLayer => {
                        if (subLayer instanceof L.Polygon || subLayer instanceof L.Rectangle) {
                            subLayer.setLatLngs(latLngs);
                        }
                    });
                }

                // Recalculate area and computed values
                const polygon = turf.polygon([coords]);
                const areaM2 = turf.area(polygon);
                props.areaM2 = areaM2;
                props.areaHa = areaM2 / 10000;
                props.areaKm2 = areaM2 / 1000000;

                if (type === 'measurement-center') {
                    const centerPoint = turf.center(polygon);
                    const centerLat = centerPoint.geometry.coordinates[1];
                    const centerLng = centerPoint.geometry.coordinates[0];
                    props.center = { lat: centerLat, lng: centerLng };
                    if (feature.geometry.type === 'GeometryCollection') {
                        feature.geometry.geometries[1].coordinates = [centerLng, centerLat];
                    }
                    // Update center marker
                    layer.eachLayer(subLayer => {
                        if (subLayer instanceof L.CircleMarker) {
                            subLayer.setLatLng([centerLat, centerLng]);
                        }
                    });
                } else if (type === 'measurement-centroid') {
                    const centroid = turf.centerOfMass(polygon);
                    const centroidLat = centroid.geometry.coordinates[1];
                    const centroidLng = centroid.geometry.coordinates[0];
                    props.centroid = { lat: centroidLat, lng: centroidLng };
                    if (feature.geometry.type === 'GeometryCollection') {
                        feature.geometry.geometries[1].coordinates = [centroidLng, centroidLat];
                    }
                    // Update centroid marker
                    layer.eachLayer(subLayer => {
                        if (subLayer instanceof L.CircleMarker) {
                            subLayer.setLatLng([centroidLat, centroidLng]);
                        }
                    });
                } else if (type === 'measurement-bbox') {
                    const bbox = turf.bbox(polygon);
                    props.bbox = {
                        minLat: bbox[1],
                        minLng: bbox[0],
                        maxLat: bbox[3],
                        maxLng: bbox[2]
                    };
                    const width = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: 'kilometers' }) * 1000;
                    const height = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: 'kilometers' }) * 1000;
                    props.width = width;
                    props.height = height;
                    // Update bbox rectangle
                    layer.eachLayer(subLayer => {
                        if (subLayer instanceof L.Rectangle) {
                            subLayer.setBounds([
                                [bbox[1], bbox[0]],
                                [bbox[3], bbox[2]]
                            ]);
                        }
                    });
                }
            }
        } else if (type === 'measurement-along') {
            const pointsText = div.querySelector('.points-input').value;
            const alongPercentInput = div.querySelector('.along-percent-input');
            const alongDistanceInput = div.querySelector('.along-distance-input');

            const newPoints = parsePointsFromText(pointsText);
            if (newPoints.length >= 2) {
                const coords = newPoints.map(p => [p.lng, p.lat]);
                const line = turf.lineString(coords);
                const lengthKm = turf.length(line, { units: 'kilometers' });
                const lengthM = lengthKm * 1000;

                // Determine which input was changed (use distance input value)
                let alongDistanceM = parseFloat(alongDistanceInput.value);
                const alongPercent = parseFloat(alongPercentInput.value);

                // Clamp values
                alongDistanceM = Math.max(0, Math.min(alongDistanceM, lengthM));
                const finalPercent = (alongDistanceM / lengthM) * 100;

                // Update geometry
                if (feature.geometry.type === 'GeometryCollection') {
                    feature.geometry.geometries[0].coordinates = coords;
                } else {
                    feature.geometry.coordinates = coords;
                }

                // Update layer line
                const latLngs = newPoints.map(p => [p.lat, p.lng]);
                if (layer.setLatLngs) {
                    layer.setLatLngs(latLngs);
                } else if (layer instanceof L.LayerGroup) {
                    layer.eachLayer(subLayer => {
                        if (subLayer instanceof L.Polyline) {
                            subLayer.setLatLngs(latLngs);
                        }
                    });
                }

                // Calculate along point at the specified distance
                const alongPoint = turf.along(line, alongDistanceM / 1000, { units: 'kilometers' });
                const alongLat = alongPoint.geometry.coordinates[1];
                const alongLng = alongPoint.geometry.coordinates[0];

                props.alongPoint = { lat: alongLat, lng: alongLng };
                props.lengthM = lengthM;
                props.lengthKm = lengthKm;
                props.alongDistance = alongDistanceM;
                props.alongPercent = finalPercent;

                if (feature.geometry.type === 'GeometryCollection') {
                    feature.geometry.geometries[1].coordinates = [alongLng, alongLat];
                }

                // Update along marker
                layer.eachLayer(subLayer => {
                    if (subLayer instanceof L.CircleMarker) {
                        subLayer.setLatLng([alongLat, alongLng]);
                    }
                });
            }
        }
    }

    updateElementList();
    saveState();
    layer.closePopup();
}

function updateElementList() {
    const list = document.getElementById('elements-list');
    list.innerHTML = '';

    // Gather all elements with their data
    const allElements = [];
    state.features.forEach(feature => {
        const layer = state.featureLayers.get(feature.id);
        const props = feature.properties;
        allElements.push({
            id: feature.id,
            type: props.type,
            data: extractDataFromFeature(feature),
            layer: layer,
            folderId: props.folderId || null,
            visible: state.featureVisibility.get(feature.id) !== false
        });
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

    // Root elements container (elements without folder)
    const rootElements = allElements.filter(el => !el.folderId);
    if (rootElements.length > 0 || allElements.length === 0) {
        const rootContainer = document.createElement('div');
        rootContainer.className = 'root-elements';
        rootContainer.dataset.folderId = '';

        // Make root container a drop target
        rootContainer.addEventListener('dragover', handleDragOver);
        rootContainer.addEventListener('dragleave', handleDragLeave);
        rootContainer.addEventListener('drop', handleDrop);

        rootElements.forEach(el => {
            const item = createElementItem(el);
            rootContainer.appendChild(item);
        });
        list.appendChild(rootContainer);
    }

    // Update element count
    document.getElementById('element-count').textContent = `(${allElements.length})`;
}

function createFolder() {
    const id = 'folder-' + Date.now().toString() + Math.random().toString(36).substr(2, 9);
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

function createFolderElement(folder, elements) {
    const folderEl = document.createElement('div');
    folderEl.className = 'folder-item' + (folder.collapsed ? ' collapsed' : '');
    folderEl.dataset.folderId = folder.id;

    const visibleCount = elements.filter(el => el.visible).length;

    folderEl.innerHTML = `
        <div class="folder-header">
            <span class="folder-toggle"><i class="fas fa-chevron-down"></i></span>
            <span class="folder-title">${folder.name}</span>
            <span class="folder-count">${elements.length}</span>
            <div class="folder-actions">
                <button class="folder-btn folder-visibility ${!folder.visible ? 'hidden-state' : ''}" title="Afficher/Masquer">
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
            // Move elements to root
            elements.forEach(el => {
                const feature = state.features.find(f => f.id === el.id);
                if (feature) feature.properties.folderId = null;
            });
            // Remove folder
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

function createElementItem(el) {
    const item = document.createElement('div');
    item.className = `element-item type-${el.type}${!el.visible ? ' element-hidden' : ''}`;
    item.draggable = true;
    item.dataset.elementId = el.id;

    // Set border color from element color
    const borderColor = el.data.color || CONFIG.colors.default;
    item.style.borderLeftColor = borderColor;

    let details = '';
    if (el.type === 'circle') details = `Rayon: ${el.data.radius}m`;
    else if (el.type === 'line') details = `Dist: ${(el.data.distance / 1000).toFixed(2)}km`;
    else if (el.type === 'bearing') details = `${(el.data.distance / 1000).toFixed(2)}km @ ${el.data.bearing}°`;
    else if (el.type === 'polygon') details = `${el.data.points ? el.data.points.length : 0} pts`;
    else if (el.type === 'measurement-distance') {
        details = el.data.distanceM < 1000 ? `${el.data.distanceM.toFixed(2)} m` : `${el.data.distanceKm.toFixed(3)} km`;
    }
    else if (el.type === 'measurement-area') {
        details = el.data.areaM2 < 10000 ? `${el.data.areaM2.toFixed(2)} m²` : `${el.data.areaHa.toFixed(4)} ha`;
    }
    else if (el.type === 'measurement-bearing') {
        details = `${el.data.bearing.toFixed(1)}° (${el.data.cardinal})`;
    }
    else if (el.type === 'measurement-center') {
        details = `${el.data.center.lat.toFixed(4)}, ${el.data.center.lng.toFixed(4)}`;
    }
    else if (el.type === 'measurement-centroid') {
        details = `${el.data.centroid.lat.toFixed(4)}, ${el.data.centroid.lng.toFixed(4)}`;
    }
    else if (el.type === 'measurement-bbox') {
        details = `${el.data.width.toFixed(1)}m × ${el.data.height.toFixed(1)}m`;
    }
    else if (el.type === 'measurement-along') {
        details = el.data.lengthM < 1000 ? `${el.data.lengthM.toFixed(2)} m` : `${el.data.lengthKm.toFixed(3)} km`;
    }
    else details = `${el.data.lat ? el.data.lat.toFixed(4) : ''}, ${el.data.lng ? el.data.lng.toFixed(4) : ''}`;

    item.innerHTML = `
        <button class="element-visibility ${!el.visible ? 'hidden-state' : ''}" title="Afficher/Masquer">
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

    // Edit button - open popup
    item.querySelector('.element-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        // Zoom to element and open popup
        if (el.layer.getBounds) {
            state.map.fitBounds(el.layer.getBounds(), { padding: [50, 50] });
        } else if (el.layer.getLatLng) {
            state.map.setView(el.layer.getLatLng(), Math.max(state.map.getZoom(), 14));
        }
        // Open popup after a small delay to let the map settle
        setTimeout(() => {
            el.layer.openPopup();
        }, 100);
    });

    // Delete button
    item.querySelector('.element-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteElement(el.id);
    });

    // Click to focus/zoom
    item.querySelector('.element-info').addEventListener('click', () => {
        if (el.layer.getBounds) {
            state.map.fitBounds(el.layer.getBounds(), { padding: [50, 50] });
        } else if (el.layer.getLatLng) {
            state.map.setView(el.layer.getLatLng(), 14);
            el.layer.openPopup();
        }
    });

    // Drag events
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);

    return item;
}

function toggleElementVisibility(id) {
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

function toggleFolderVisibility(folder) {
    // Toggle visibility of all elements in folder
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
let draggedElementId = null;

function handleDragStart(e) {
    draggedElementId = e.target.dataset.elementId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElementId = null;
    // Remove drag-over styling from all containers
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    if (!draggedElementId) return;

    const targetFolderId = e.currentTarget.dataset.folderId || null;
    const feature = state.features.find(f => f.id === draggedElementId);

    if (feature) {
        feature.properties.folderId = targetFolderId;

        // If moving to a hidden folder, hide the element
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

function extractDataFromFeature(feature) {
    const props = feature.properties;
    const geom = feature.geometry;
    const type = props.type;

    const data = {
        title: props.title || '',
        description: props.description || '',
        color: props.color || CONFIG.colors.default,
        folderId: props.folderId || null
    };

    if (type === 'marker') {
        data.lat = geom.coordinates[1];
        data.lng = geom.coordinates[0];
    } else if (type === 'circle') {
        data.radius = props.radius;
    } else if (type === 'line' || type === 'bearing') {
        data.distance = props.distance;
        if (props.bearing !== undefined) data.bearing = props.bearing;
    } else if (type === 'polygon') {
        data.points = geom.coordinates[0].slice(0, -1).map(c => ({ lat: c[1], lng: c[0] }));
    } else if (type.startsWith('measurement-')) {
        // Copy all measurement properties
        Object.assign(data, props);
    }

    return data;
}

function deleteElement(id) {
    // Remove from features and layers
    const featureIndex = state.features.findIndex(f => f.id === id);
    if (featureIndex !== -1) {
        const layer = state.featureLayers.get(id);
        if (layer) {
            if (layer.isPopupOpen && layer.isPopupOpen()) {
                layer.closePopup();
            }
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
window.deleteElement = deleteElement;
/**
 * GeoJSON conversion utilities
 */


/**
 * Create a Leaflet layer from a GeoJSON feature
 * Uses Leaflet's geoJSON with custom options
 */
function createLayerFromFeature(feature) {
    const props = feature.properties;
    const type = props.type;

    let layer;

    if (type === 'circle') {
        // Special handling for circles (not native GeoJSON)
        const coords = feature.geometry.coordinates;
        layer = L.circle([coords[1], coords[0]], {
            radius: props.radius,
            color: props.color,
            fillColor: props.color,
            fillOpacity: 0.3
        });
        layer.feature = feature; // Attach feature to layer
    } else if (type === 'marker') {
        // Create draggable marker with colored icon
        const coords = feature.geometry.coordinates;
        const markerColor = props.color || CONFIG.colors.default;
        layer = L.marker([coords[1], coords[0]], {
            draggable: true,
            icon: createColoredMarkerIcon(markerColor)
        });
        layer.feature = feature;

        // Update feature on drag
        layer.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            feature.geometry.coordinates = [pos.lng, pos.lat];
            layer.setPopupContent(createPopupContent(feature));
            updateElementList();
            saveState();
        });
    } else {
        // Use L.geoJSON for other geometries
        const geoJsonLayer = L.geoJSON(feature, {
            style: function (feature) {
                return {
                    color: feature.properties.color || CONFIG.colors.default,
                    fillColor: feature.properties.color || CONFIG.colors.default,
                    fillOpacity: 0.3,
                    weight: 2
                };
            }
        });

        // Extract the actual layer from the GeoJSON layer
        layer = geoJsonLayer.getLayers()[0];
        layer.feature = feature; // Attach feature to layer
    }

    return layer;
}

/**
 * Convert an element to a GeoJSON Feature using Turf.js helpers
 * @param {Object} element - The element to convert
 * @returns {Object} GeoJSON Feature
 */
function elementToGeoJSON(element) {
    const { id, type, data } = element;
    let feature = null;
    let properties = {
        id: id,
        type: type,
        title: data.title || '',
        description: data.description || '',
        color: data.color || CONFIG.colors.default,
        folderId: data.folderId || null
    };

    switch (type) {
        case 'marker':
            feature = turf.point([data.lng, data.lat], properties);
            break;

        case 'circle':
            // GeoJSON doesn't have native circle, use Point with radius property
            properties.radius = data.radius;
            feature = turf.point([data.center.lng, data.center.lat], properties);
            break;

        case 'line':
        case 'bearing':
            properties.distance = data.distance;
            if (data.bearing !== undefined) properties.bearing = data.bearing;
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;

        case 'polygon':
            const coords = data.points.map(p => [p.lng, p.lat]);
            feature = turf.polygon([coords], properties);
            break;

        case 'measurement-distance':
        case 'measurement-bearing':
            properties.distanceM = data.distanceM;
            properties.distanceKm = data.distanceKm;
            if (data.bearing !== undefined) {
                properties.bearing = data.bearing;
                properties.cardinal = data.cardinal;
            }
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;

        case 'measurement-area':
            properties.areaM2 = data.areaM2;
            properties.areaHa = data.areaHa;
            properties.areaKm2 = data.areaKm2;
            properties.perimeterM = data.perimeterM;
            properties.perimeterKm = data.perimeterKm;
            const areaCoords = data.points.map(p => [p.lng, p.lat]);
            areaCoords.push(areaCoords[0]); // Close the ring
            feature = turf.polygon([areaCoords], properties);
            break;

        case 'measurement-center':
        case 'measurement-centroid':
            const centerPoint = type === 'measurement-center' ? data.center : data.centroid;
            properties[type === 'measurement-center' ? 'center' : 'centroid'] = centerPoint;
            if (data.areaM2) properties.areaM2 = data.areaM2;
            if (data.areaHa) properties.areaHa = data.areaHa;
            const polyCoords = data.points.map(p => [p.lng, p.lat]);
            polyCoords.push(polyCoords[0]); // Close the ring
            const poly = turf.polygon([polyCoords]);
            const center = turf.point([centerPoint.lng, centerPoint.lat]);
            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [poly.geometry, center.geometry]
                },
                properties: properties
            };
            break;

        case 'measurement-bbox':
            properties.bbox = data.bbox;
            properties.width = data.width;
            properties.height = data.height;
            const bboxCoords = data.points.map(p => [p.lng, p.lat]);
            bboxCoords.push(bboxCoords[0]); // Close the ring
            const origPoly = turf.polygon([bboxCoords]);
            const bboxPoly = turf.bboxPolygon([
                data.bbox.minLng, data.bbox.minLat,
                data.bbox.maxLng, data.bbox.maxLat
            ]);
            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [origPoly.geometry, bboxPoly.geometry]
                },
                properties: properties
            };
            break;

        case 'measurement-along':
            properties.lengthM = data.lengthM;
            properties.lengthKm = data.lengthKm;
            properties.alongDistance = data.alongDistance;
            properties.alongPoint = data.alongPoint;
            const alongLine = turf.lineString(data.points.map(p => [p.lng, p.lat]));
            const alongPt = turf.point([data.alongPoint.lng, data.alongPoint.lat]);
            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [alongLine.geometry, alongPt.geometry]
                },
                properties: properties
            };
            break;
    }

    // Add id to the feature
    if (feature) {
        feature.id = id;
    }

    return feature;
}

/**
 * Convert a GeoJSON Feature to an element data structure
 * @param {Object} feature - The GeoJSON Feature
 * @returns {Object} Element with id, type, and data
 */
function geoJSONToElement(feature) {
    const props = feature.properties;
    const geom = feature.geometry;
    const type = props.type;
    const id = feature.id || props.id;

    let data = {
        title: props.title || '',
        description: props.description || '',
        color: props.color || CONFIG.colors.default
    };

    switch (type) {
        case 'marker':
            data.lat = geom.coordinates[1];
            data.lng = geom.coordinates[0];
            break;

        case 'circle':
            data.center = {
                lat: geom.coordinates[1],
                lng: geom.coordinates[0]
            };
            data.radius = props.radius;
            break;

        case 'line':
        case 'bearing':
            data.start = {
                lat: geom.coordinates[0][1],
                lng: geom.coordinates[0][0]
            };
            data.end = {
                lat: geom.coordinates[1][1],
                lng: geom.coordinates[1][0]
            };
            if (props.distance) data.distance = props.distance;
            if (props.bearing !== undefined) data.bearing = props.bearing;
            break;

        case 'polygon':
            data.points = geom.coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            break;

        case 'measurement-distance':
        case 'measurement-bearing':
            data.start = {
                lat: geom.coordinates[0][1],
                lng: geom.coordinates[0][0]
            };
            data.end = {
                lat: geom.coordinates[1][1],
                lng: geom.coordinates[1][0]
            };
            data.distanceM = props.distanceM;
            data.distanceKm = props.distanceKm;
            if (props.bearing !== undefined) {
                data.bearing = props.bearing;
                data.cardinal = props.cardinal;
            }
            break;

        case 'measurement-area':
            data.points = geom.coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            data.areaM2 = props.areaM2;
            data.areaHa = props.areaHa;
            data.areaKm2 = props.areaKm2;
            data.perimeterM = props.perimeterM;
            data.perimeterKm = props.perimeterKm;
            break;

        case 'measurement-center':
        case 'measurement-centroid':
            data.points = geom.geometries[0].coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            const centerProp = type === 'measurement-center' ? 'center' : 'centroid';
            data[centerProp] = props[centerProp] || {
                lat: geom.geometries[1].coordinates[1],
                lng: geom.geometries[1].coordinates[0]
            };
            if (props.areaM2) data.areaM2 = props.areaM2;
            if (props.areaHa) data.areaHa = props.areaHa;
            break;

        case 'measurement-bbox':
            data.points = geom.geometries[0].coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            data.bbox = props.bbox;
            data.width = props.width;
            data.height = props.height;
            break;

        case 'measurement-along':
            data.points = geom.geometries[0].coordinates.map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            data.alongPoint = props.alongPoint || {
                lat: geom.geometries[1].coordinates[1],
                lng: geom.geometries[1].coordinates[0]
            };
            data.lengthM = props.lengthM;
            data.lengthKm = props.lengthKm;
            data.alongDistance = props.alongDistance;
            break;
    }

    return { id, type, data };
}

/**
 * Restore a feature from GeoJSON
 */
function restoreFeature(feature, visible = true) {
    const layer = createLayerFromFeature(feature);

    // Only add to map if visible
    if (visible) {
        layer.addTo(state.map);
    }

    // Store feature and layer
    state.features.push(feature);
    state.featureLayers.set(feature.id, layer);
    state.featureVisibility.set(feature.id, visible);

    // Bind popup
    layer.bindPopup(() => createPopupContent(feature));

    updateElementList();
}

function restoreMeasurementFeature(feature, visible = true) {
    // Use the new GeoJSON-based system
    const layer = createLayerFromFeature(feature);

    // Only add to map if visible
    if (visible) {
        layer.addTo(state.map);
    }

    // Store feature and layer
    state.features.push(feature);
    state.featureLayers.set(feature.id, layer);
    state.featureVisibility.set(feature.id, visible);

    // Bind new-style popup with color support
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
}
/**
 * Measurement tools - distance, area, bearing, midpoint, center, centroid, bbox, along
 */


function initMeasurementTools() {
    // Tool buttons
    document.getElementById('measure-distance').addEventListener('click', () => startMeasurement('distance'));
    document.getElementById('measure-area').addEventListener('click', () => startMeasurement('area'));
    document.getElementById('measure-bearing').addEventListener('click', () => startMeasurement('bearing'));
    document.getElementById('measure-center').addEventListener('click', () => startMeasurement('center'));
    document.getElementById('measure-centroid').addEventListener('click', () => startMeasurement('centroid'));
    document.getElementById('measure-bbox').addEventListener('click', () => startMeasurement('bbox'));
    document.getElementById('measure-along').addEventListener('click', () => startMeasurement('along'));

    // Cancel button
    document.getElementById('cancel-measurement').addEventListener('click', cancelMeasurement);

    // Modal buttons
    document.getElementById('btn-discard-measurement').addEventListener('click', () => {
        closeModal('modal-measurement-result');
        cancelMeasurement();
    });
    document.getElementById('btn-save-measurement').addEventListener('click', saveMeasurementAsElement);
}

function startMeasurement(type) {
    // Clear any existing drawing tool
    setActiveTool(null);

    // Reset measurement state
    cancelMeasurement();

    state.measurement.active = type;

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`measure-${type}`);
    if (btn) btn.classList.add('active');

    const statusEl = document.getElementById('measurement-status');
    const instructionEl = document.getElementById('measurement-instruction');
    statusEl.classList.remove('hidden');

    const instructions = {
        'distance': 'Cliquez sur le premier point, puis sur le second',
        'area': 'Cliquez pour tracer le polygone. Double-cliquez pour terminer',
        'bearing': 'Cliquez sur le point de départ, puis le point d\'arrivée',
        'center': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'centroid': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'bbox': 'Cliquez pour tracer la zone. Double-cliquez pour terminer',
        'along': 'Cliquez pour tracer la ligne. Double-cliquez pour terminer'
    };
    instructionEl.textContent = instructions[type];

    document.querySelector('.leaflet-container').classList.add('drawing-cursor');

    // Disable double-click zoom for polygon-based measurements
    if (['area', 'center', 'centroid', 'bbox', 'along'].includes(type)) {
        state.map.doubleClickZoom.disable();
    }
}

function cancelMeasurement() {
    state.measurement.active = null;
    state.measurement.points = [];
    state.measurement.result = null;

    // Remove temp layers
    state.measurement.tempLayers.forEach(layer => state.map.removeLayer(layer));
    state.measurement.tempLayers = [];

    clearCursorLayer();

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('measurement-status').classList.add('hidden');
    document.querySelector('.leaflet-container').classList.remove('drawing-cursor');

    state.map.doubleClickZoom.enable();
}

function handleMeasurementClick(latlng) {
    const { lat, lng } = latlng;
    state.measurement.points.push({ lat, lng });

    // Add a temporary marker
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
                // Draw temporary line
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
                // Draw temporary line
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

function completeMeasurement() {
    const type = state.measurement.active;
    const points = state.measurement.points;

    if (!type || points.length < 2) return;
    if (['area', 'center', 'centroid', 'bbox'].includes(type) && points.length < 3) return;

    let result = {};

    switch (type) {
        case 'distance':
            result = calculateMeasurementDistance(points[0], points[1]);
            break;
        case 'bearing':
            result = calculateMeasurementBearing(points[0], points[1]);
            break;
        case 'area':
            result = calculateMeasurementArea(points);
            break;
        case 'center':
            result = calculateMeasurementCenter(points);
            break;
        case 'centroid':
            result = calculateMeasurementCentroid(points);
            break;
        case 'bbox':
            result = calculateMeasurementBbox(points);
            break;
        case 'along':
            result = calculateMeasurementAlong(points);
            break;
    }

    state.measurement.result = result;
    showMeasurementResult(result);
}

function calculateMeasurementDistance(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);

    const distanceKm = turf.distance(from, to, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;

    return {
        type: 'measurement-distance',
        title: 'Mesure de distance',
        data: {
            start: p1,
            end: p2,
            distanceKm: distanceKm,
            distanceM: distanceM
        },
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

function calculateMeasurementBearing(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);

    const bearing = turf.bearing(from, to);
    const normalizedBearing = bearing < 0 ? bearing + 360 : bearing;
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;

    // Cardinal direction
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const cardinalIndex = Math.round(normalizedBearing / 45) % 8;
    const cardinal = cardinals[cardinalIndex];

    return {
        type: 'measurement-bearing',
        title: 'Mesure d\'azimut',
        data: {
            start: p1,
            end: p2,
            bearing: normalizedBearing,
            cardinal: cardinal,
            distanceKm: distanceKm,
            distanceM: distanceM
        },
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

function calculateMeasurementArea(points) {
    // Create polygon coordinates (close the ring)
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]); // Close the polygon

    const polygon = turf.polygon([coords]);
    const areaM2 = turf.area(polygon);
    const areaKm2 = areaM2 / 1000000;
    const areaHa = areaM2 / 10000;

    // Calculate perimeter
    const line = turf.lineString(coords);
    const perimeterKm = turf.length(line, { units: 'kilometers' });
    const perimeterM = perimeterKm * 1000;

    return {
        type: 'measurement-area',
        title: 'Mesure de surface',
        data: {
            points: points,
            areaM2: areaM2,
            areaKm2: areaKm2,
            areaHa: areaHa,
            perimeterM: perimeterM,
            perimeterKm: perimeterKm
        },
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

function calculateMeasurementCenter(points) {
    // Create polygon coordinates (close the ring)
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
        data: {
            points: points,
            center: { lat: centerLat, lng: centerLng },
            areaM2: areaM2,
            areaHa: areaHa
        },
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

function calculateMeasurementCentroid(points) {
    // Create polygon coordinates (close the ring)
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
        data: {
            points: points,
            centroid: { lat: centroidLat, lng: centroidLng },
            areaM2: areaM2,
            areaHa: areaHa
        },
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

function calculateMeasurementBbox(points) {
    // Create polygon coordinates (close the ring)
    const coords = points.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);

    const polygon = turf.polygon([coords]);
    const bbox = turf.bbox(polygon);
    // bbox = [minX, minY, maxX, maxY] = [minLng, minLat, maxLng, maxLat]

    const bboxPolygon = turf.bboxPolygon(bbox);
    const bboxArea = turf.area(bboxPolygon);
    const bboxAreaHa = bboxArea / 10000;

    const width = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: 'kilometers' }) * 1000;
    const height = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: 'kilometers' }) * 1000;

    return {
        type: 'measurement-bbox',
        title: 'Boîte englobante',
        data: {
            points: points,
            bbox: {
                minLat: bbox[1],
                minLng: bbox[0],
                maxLat: bbox[3],
                maxLng: bbox[2]
            },
            width: width,
            height: height,
            areaM2: bboxArea,
            areaHa: bboxAreaHa
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

function calculateMeasurementAlong(points) {
    // Create line from points
    const coords = points.map(p => [p.lng, p.lat]);
    const line = turf.lineString(coords);
    const lengthKm = turf.length(line, { units: 'kilometers' });
    const lengthM = lengthKm * 1000;

    // Get point at 50% along the line
    const halfwayPoint = turf.along(line, lengthKm / 2, { units: 'kilometers' });
    const halfLat = halfwayPoint.geometry.coordinates[1];
    const halfLng = halfwayPoint.geometry.coordinates[0];

    return {
        type: 'measurement-along',
        title: 'Point sur ligne',
        data: {
            points: points,
            lengthM: lengthM,
            lengthKm: lengthKm,
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

    document.getElementById('measurement-result-title').textContent = titles[result.type] || 'Résultat';
    document.getElementById('measurement-result-content').innerHTML = result.displayHtml;
    document.getElementById('measurement-result-name').value = result.title;

    openModal('modal-measurement-result');
}

function saveMeasurementAsElement() {
    const result = state.measurement.result;
    if (!result) return;

    const title = document.getElementById('measurement-result-name').value || result.title;

    // Create element based on measurement type
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    let layer;
    let elementData = {
        ...result.data,
        title: title,
        measurementType: result.type,
        color: CONFIG.colors[result.type] || CONFIG.colors.default  // Use type-specific color
    };

    const color = CONFIG.colors[result.type] || CONFIG.colors.default;  // Use type-specific color

    switch (result.type) {
        case 'measurement-distance':
        case 'measurement-bearing':
            layer = L.polyline([
                [result.data.start.lat, result.data.start.lng],
                [result.data.end.lat, result.data.end.lng]
            ], {
                color: color,
                weight: 3
            });
            break;

        case 'measurement-area':
            layer = L.polygon(
                result.data.points.map(p => [p.lat, p.lng]),
                {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.3,
                    weight: 2
                }
            );
            break;

        case 'measurement-center':
            // Polygon with center marker
            const centerPolygon = L.polygon(
                result.data.points.map(p => [p.lat, p.lng]),
                {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: '5, 5'
                }
            );

            const centerMarker = L.circleMarker(
                [result.data.center.lat, result.data.center.lng],
                {
                    radius: 8,
                    color: color,
                    fillColor: color,
                    fillOpacity: 1
                }
            );

            layer = L.layerGroup([centerPolygon, centerMarker]);
            break;

        case 'measurement-centroid':
            // Polygon with centroid marker
            const centroidPolygon = L.polygon(
                result.data.points.map(p => [p.lat, p.lng]),
                {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: '5, 5'
                }
            );

            const centroidMarker = L.circleMarker(
                [result.data.centroid.lat, result.data.centroid.lng],
                {
                    radius: 8,
                    color: color,
                    fillColor: color,
                    fillOpacity: 1
                }
            );

            layer = L.layerGroup([centroidPolygon, centroidMarker]);
            break;

        case 'measurement-bbox':
            // Original polygon with bounding box
            const originalPolygon = L.polygon(
                result.data.points.map(p => [p.lat, p.lng]),
                {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: '5, 5'
                }
            );

            const bboxRect = L.rectangle([
                [result.data.bbox.minLat, result.data.bbox.minLng],
                [result.data.bbox.maxLat, result.data.bbox.maxLng]
            ], {
                color: color,
                fillColor: color,
                fillOpacity: 0.1,
                weight: 3
            });

            layer = L.layerGroup([originalPolygon, bboxRect]);
            break;

        case 'measurement-along':
            // Line with point marker
            const alongLine = L.polyline(
                result.data.points.map(p => [p.lat, p.lng]),
                {
                    color: color,
                    weight: 3
                }
            );

            const alongMarker = L.circleMarker(
                [result.data.alongPoint.lat, result.data.alongPoint.lng],
                {
                    radius: 8,
                    color: color,
                    fillColor: color,
                    fillOpacity: 1
                }
            );

            layer = L.layerGroup([alongLine, alongMarker]);
            break;
    }

    layer.addTo(state.map);

    // Create temporary element for conversion to GeoJSON
    const element = { id, type: result.type, data: elementData, layer };

    // Convert to GeoJSON and add to features array
    const feature = elementToGeoJSON(element);
    state.features.push(feature);
    state.featureLayers.set(id, layer);
    state.featureVisibility.set(id, true); // Visible by default

    // Bind popup using unified feature-based approach
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
/**
 * Data persistence - localStorage, import/export
 */


function saveState() {
    // Create GeoJSON FeatureCollection directly from features
    // Include visibility state in each feature's properties
    const featuresWithVisibility = state.features.map(f => {
        const featureCopy = JSON.parse(JSON.stringify(f));
        featureCopy.properties._visible = state.featureVisibility.get(f.id) !== false;
        return featureCopy;
    });

    // Collect layer settings
    const layerSettings = {
        orthoEnabled: document.getElementById('overlay-ortho')?.checked || false,
        orthoOpacity: parseInt(document.getElementById('ortho-opacity')?.value) || 50,
        hillshadeEnabled: document.getElementById('overlay-hillshade')?.checked || false,
        buildingsEnabled: document.getElementById('overlay-buildings')?.checked || false,
        buffersEnabled: document.getElementById('overlay-buffers')?.checked || false,
        bufferRadius: parseInt(document.getElementById('buffer-radius')?.value) || 50,
        parcChartreuseEnabled: document.getElementById('overlay-parc-chartreuse')?.checked || false,
        contourEnabled: document.getElementById('overlay-contour')?.checked || false,
        contourAltitude: parseInt(document.getElementById('contour-altitude')?.value) || 1000
    };

    const geoJSON = {
        type: 'FeatureCollection',
        features: featuresWithVisibility,
        properties: {
            center: state.map.getCenter(),
            zoom: state.map.getZoom(),
            savedAt: new Date().toISOString(),
            version: '4.1', // Version with folders, visibility and layer settings support
            folders: state.folders,
            layerSettings: layerSettings
        }
    };

    localStorage.setItem('ignMapData', JSON.stringify(geoJSON));
}

function restoreState() {
    const saved = localStorage.getItem('ignMapData');
    if (!saved) return;

    try {
        const data = JSON.parse(saved);

        // Restore map view
        const props = data.properties || {};
        if (props.center && props.zoom) {
            state.map.setView(props.center, props.zoom);
        }

        // Restore folders
        if (props.folders) {
            state.folders = props.folders;
        }

        // Restore layer settings
        if (props.layerSettings) {
            restoreLayerSettings(props.layerSettings);
        }

        // Restore features directly
        data.features.forEach(feature => {
            const type = feature.properties.type;
            const visible = feature.properties._visible !== false;
            if (type.startsWith('measurement-')) {
                restoreMeasurementFeature(feature, visible);
            } else {
                restoreFeature(feature, visible);
            }
        });
    } catch (error) {
        console.error('Error restoring state:', error);
    }
}

/**
 * Restore layer settings from saved state
 */
function restoreLayerSettings(settings) {
    // Restore ortho layer
    const orthoCheckbox = document.getElementById('overlay-ortho');
    if (orthoCheckbox && settings.orthoEnabled !== undefined) {
        orthoCheckbox.checked = settings.orthoEnabled;
        if (settings.orthoEnabled) {
            const opacityControl = document.getElementById('opacity-control');
            if (opacityControl) opacityControl.classList.remove('hidden');
        }
    }

    const orthoOpacity = document.getElementById('ortho-opacity');
    const opacityValue = document.getElementById('opacity-value');
    if (orthoOpacity && settings.orthoOpacity !== undefined) {
        orthoOpacity.value = settings.orthoOpacity;
        if (opacityValue) opacityValue.textContent = `${settings.orthoOpacity}%`;
    }

    // Restore hillshade layer
    const hillshadeCheckbox = document.getElementById('overlay-hillshade');
    if (hillshadeCheckbox && settings.hillshadeEnabled !== undefined) {
        hillshadeCheckbox.checked = settings.hillshadeEnabled;
    }

    // Restore buildings layer
    const buildingsCheckbox = document.getElementById('overlay-buildings');
    if (buildingsCheckbox && settings.buildingsEnabled !== undefined) {
        buildingsCheckbox.checked = settings.buildingsEnabled;
    }

    // Restore buffers layer
    const buffersCheckbox = document.getElementById('overlay-buffers');
    if (buffersCheckbox && settings.buffersEnabled !== undefined) {
        buffersCheckbox.checked = settings.buffersEnabled;
        if (settings.buffersEnabled) {
            const bufferControl = document.getElementById('buffer-radius-control');
            if (bufferControl) bufferControl.classList.remove('hidden');
        }
    }

    const bufferRadius = document.getElementById('buffer-radius');
    const bufferRadiusValue = document.getElementById('buffer-radius-value');
    if (bufferRadius && settings.bufferRadius !== undefined) {
        bufferRadius.value = settings.bufferRadius;
        if (bufferRadiusValue) bufferRadiusValue.textContent = `${settings.bufferRadius}m`;
    }

    // Restore parc chartreuse layer
    const parcChartreuseCheckbox = document.getElementById('overlay-parc-chartreuse');
    if (parcChartreuseCheckbox && settings.parcChartreuseEnabled !== undefined) {
        parcChartreuseCheckbox.checked = settings.parcChartreuseEnabled;
    }

    // Restore contour layer
    const contourCheckbox = document.getElementById('overlay-contour');
    if (contourCheckbox && settings.contourEnabled !== undefined) {
        contourCheckbox.checked = settings.contourEnabled;
    }

    const contourAltitude = document.getElementById('contour-altitude');
    if (contourAltitude && settings.contourAltitude !== undefined) {
        contourAltitude.value = settings.contourAltitude;
    }

    // Trigger the layer updates after a short delay to ensure map is ready
    setTimeout(() => {
        if (settings.orthoEnabled) {
            document.getElementById('overlay-ortho')?.dispatchEvent(new Event('change'));
        }
        if (settings.hillshadeEnabled) {
            document.getElementById('overlay-hillshade')?.dispatchEvent(new Event('change'));
        }
        if (settings.buildingsEnabled) {
            document.getElementById('overlay-buildings')?.dispatchEvent(new Event('change'));
        }
        if (settings.buffersEnabled) {
            document.getElementById('overlay-buffers')?.dispatchEvent(new Event('change'));
        }
        if (settings.parcChartreuseEnabled) {
            document.getElementById('overlay-parc-chartreuse')?.dispatchEvent(new Event('change'));
        }
        if (settings.contourEnabled) {
            document.getElementById('overlay-contour')?.dispatchEvent(new Event('change'));
        }
    }, 500);
}

function initDataManagement() {
    document.getElementById('btn-export').addEventListener('click', () => {
        const saved = localStorage.getItem('ignMapData');
        if (!saved) return;

        // The saved data is already in GeoJSON format
        const blob = new Blob([saved], { type: 'application/geo+json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ign-map-${new Date().toISOString().slice(0, 10)}.geojson`;
        a.click();
    });

    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                // Clear existing features
                state.featureLayers.forEach(layer => state.map.removeLayer(layer));
                state.features = [];
                state.featureLayers.clear();
                state.featureVisibility.clear();
                state.folders = [];

                // Restore map view
                const props = data.properties || {};
                if (props.center && props.zoom) {
                    state.map.setView(props.center, props.zoom);
                }

                // Restore folders
                if (props.folders) {
                    state.folders = props.folders;
                }

                // Import features directly
                data.features.forEach(feature => {
                    const type = feature.properties.type;
                    const visible = feature.properties._visible !== false;
                    if (type.startsWith('measurement-')) {
                        restoreMeasurementFeature(feature, visible);
                    } else {
                        restoreFeature(feature, visible);
                    }
                });

                saveState();
                alert('Import réussi !');
            } catch (error) {
                console.error('Import error:', error);
                alert('Erreur lors de l\'import: ' + error.message);
            }
        };
        reader.readAsText(file);
    });
}

/**
 * Settings management - API key
 */

function initSettings() {
    // Load and display current API key
    const apiKeyInput = document.getElementById('api-key-input');
    apiKeyInput.value = CONFIG.ignApiKey;

    // Save API key button
    document.getElementById('btn-save-api-key').addEventListener('click', () => {
        const newApiKey = apiKeyInput.value.trim();
        if (newApiKey) {
            CONFIG.ignApiKey = newApiKey;
            localStorage.setItem('ignApiKey', newApiKey);
            alert('Clé API enregistrée. Rechargez la page pour appliquer les modifications.');
        } else {
            alert('Veuillez entrer une clé API valide.');
        }
    });

    // Update on Enter key
    apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-save-api-key').click();
        }
    });
}

/**
 * UI initialization - search, context menu, collapsible sections
 */


function initSearch() {
    document.getElementById('search-btn').addEventListener('click', performSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const coordMatch = query.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
            state.map.setView([lat, lng], 14);
            return;
        }
    }

    try {
        const response = await fetch(`${CONFIG.endpoints.nominatim}?q=${encodeURIComponent(query)}&format=json&countrycodes=fr&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            state.map.setView([data[0].lat, data[0].lon], 14);
        } else {
            alert('Lieu non trouvé');
        }
    } catch (error) {
        console.error('Search error:', error);
        alert('Erreur lors de la recherche');
    }
}

function initContextMenu() {
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
            if (action === 'marker') {
                createElement('marker', { lat, lng, title: 'Nouveau marqueur' });
                setActiveTool(null);
            } else if (action === 'circle') {
                state.drawing.center = { lat, lng };
                openModal('modal-circle');
            } else if (action === 'line') {
                state.drawing.points = [{ lat, lng }];
                updateLineTempLayer();
            } else if (action === 'bearing') {
                state.drawing.startPoint = { lat, lng };
                openModal('modal-bearing');
            } else if (action === 'polygon') {
                state.drawing.points = [{ lat, lng }];
                updateTempLayer();
            }
        });
    });
}

function initCollapsibleSections() {
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.section');
            section.classList.toggle('collapsed');
            saveCollapsedState();
        });
    });

    // Restore collapsed state from localStorage
    restoreCollapsedState();
}

function saveCollapsedState() {
    const collapsedSections = [];
    document.querySelectorAll('.section.collapsed').forEach(section => {
        const contentId = section.querySelector('.section-content')?.id;
        if (contentId) collapsedSections.push(contentId);
    });
    localStorage.setItem('collapsedSections', JSON.stringify(collapsedSections));
}

function restoreCollapsedState() {
    const saved = localStorage.getItem('collapsedSections');
    if (saved) {
        const collapsedSections = JSON.parse(saved);
        collapsedSections.forEach(contentId => {
            const content = document.getElementById(contentId);
            if (content) {
                content.closest('.section')?.classList.add('collapsed');
            }
        });
    }
}

function initTools() {
    ['marker', 'circle', 'line', 'polygon', 'bearing'].forEach(tool => {
        document.getElementById(`tool-${tool}`).addEventListener('click', () => setActiveTool(tool));
    });

    document.getElementById('btn-cancel-circle').addEventListener('click', () => closeModal('modal-circle'));
    document.getElementById('btn-confirm-circle').addEventListener('click', createCircle);
    document.getElementById('btn-cancel-bearing').addEventListener('click', () => closeModal('modal-bearing'));
    document.getElementById('btn-confirm-bearing').addEventListener('click', createBearingLine);

    // Escape key to cancel drawing or measurement
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.measurement.active) {
                cancelMeasurement();
            } else if (state.activeTool === 'line' && state.drawing.points && state.drawing.points.length > 0) {
                // For line tool: cancel in-progress segment (finish line if 2+ points, else cancel drawing)
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
        }
    });

    // Initialize collapsible sections
    initCollapsibleSections();
}
/**
 * Main initialization - entry point for the application
 */


document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined') {
        alert('Erreur: La librairie Leaflet n\'a pas pu être chargée. Vérifiez votre connexion internet.');
        return;
    }
    initMap();
    initLayers();
    initTools();
    initContextMenu();
    initSearch();
    initDataManagement();
    initMeasurementTools();
    initSettings();
    restoreState();
});
