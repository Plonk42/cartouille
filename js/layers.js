/**
 * Layer management - IGN layers, buildings, buffers, WFS
 * @module layers
 */

import {
    CONFIG,
    LAYER_RESTORE_DELAY,
    MIN_ZOOM_BUILDINGS,
    MIN_ZOOM_CONTOUR
} from './config.js';
import { state } from './state.js';

/**
 * Initialize all map layers
 */
export function initLayers() {
    initBaseLayers();
    initOverlayLayers();
    setupLayerControls();
}

/**
 * Initialize base tile layers
 */
function initBaseLayers() {
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

    state.layers.base = {
        'scan25': ignScan25,
        'plan': ignPlan,
        'ortho': ignOrthoBase,
        'osm': osm
    };

    // Add default layer
    state.layers.base['scan25'].addTo(state.map);
}

/**
 * Initialize overlay layers
 */
function initOverlayLayers() {
    state.layers.overlayOrtho = L.tileLayer(
        `${CONFIG.endpoints.wmtsPublic}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg`,
        { attribution: '&copy; IGN', maxZoom: 19, opacity: 0.5 }
    );

    state.layers.parcChartreuse = null;
    state.layers.contourLine = null;
}

/**
 * Setup layer control event listeners
 */
function setupLayerControls() {
    // Base layer selector
    document.getElementById('base-layer-select')?.addEventListener('change', (e) => {
        Object.values(state.layers.base).forEach(layer => state.map.removeLayer(layer));
        state.layers.base[e.target.value].addTo(state.map);
    });

    // Ortho overlay
    document.getElementById('overlay-ortho')?.addEventListener('change', (e) => {
        const control = document.getElementById('opacity-control');
        if (e.target.checked) {
            state.layers.overlayOrtho.addTo(state.map);
            control?.classList.remove('hidden');
        } else {
            state.map.removeLayer(state.layers.overlayOrtho);
            control?.classList.add('hidden');
        }
    });

    // Ortho opacity
    document.getElementById('ortho-opacity')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const valueDisplay = document.getElementById('opacity-value');
        if (valueDisplay) valueDisplay.textContent = `${val}%`;

        const checkbox = document.getElementById('overlay-ortho');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            state.layers.overlayOrtho.addTo(state.map);
            document.getElementById('opacity-control')?.classList.remove('hidden');
        }
        state.layers.overlayOrtho.setOpacity(val / 100);
    });

    // Buildings overlay
    document.getElementById('overlay-buildings')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            updateBuildings();
        } else {
            if (state.buildingsLayer) state.map.removeLayer(state.buildingsLayer);
            if (state.buffersLayer) state.map.removeLayer(state.buffersLayer);
        }
    });

    // Buffers overlay
    document.getElementById('overlay-buffers')?.addEventListener('change', (e) => {
        document.getElementById('buffer-radius-control')?.classList.toggle('hidden', !e.target.checked);
        if (document.getElementById('overlay-buildings')?.checked) {
            updateBuildings();
        }
    });

    // Buffer radius
    document.getElementById('buffer-radius')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const valueDisplay = document.getElementById('buffer-radius-value');
        if (valueDisplay) valueDisplay.textContent = `${val}m`;

        const buffersCheckbox = document.getElementById('overlay-buffers');
        const buildingsCheckbox = document.getElementById('overlay-buildings');

        if (buffersCheckbox && !buffersCheckbox.checked) {
            buffersCheckbox.checked = true;
            document.getElementById('buffer-radius-control')?.classList.remove('hidden');
        }
        if (buildingsCheckbox && !buildingsCheckbox.checked) {
            buildingsCheckbox.checked = true;
        }
        updateBuildings();
    });

    // Parc de Chartreuse
    document.getElementById('overlay-parc-chartreuse')?.addEventListener('change', async (e) => {
        if (e.target.checked) {
            await loadParcChartreuse();
        } else if (state.layers.parcChartreuse) {
            state.map.removeLayer(state.layers.parcChartreuse);
        }
    });

    // Contour lines
    document.getElementById('overlay-contour')?.addEventListener('change', async (e) => {
        const controls = document.getElementById('contour-controls');
        if (e.target.checked) {
            controls?.classList.remove('hidden');
            await loadContourLine();
        } else {
            controls?.classList.add('hidden');
            if (state.layers.contourLine) {
                state.map.removeLayer(state.layers.contourLine);
            }
        }
    });

    // Contour altitude
    document.getElementById('contour-altitude')?.addEventListener('change', async (e) => {
        let val = Number.parseInt(e.target.value, 10);
        if (Number.isNaN(val)) return;

        // Round to nearest multiple of 5
        val = Math.round(val / 5) * 5;
        val = Math.max(0, Math.min(5000, val));
        e.target.value = val;

        const checkbox = document.getElementById('overlay-contour');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            document.getElementById('contour-controls')?.classList.remove('hidden');
        }
        await loadContourLine();
    });
}

/**
 * Update buildings layer from WFS
 */
export async function updateBuildings() {
    const buildingsCheckbox = document.getElementById('overlay-buildings');
    if (!buildingsCheckbox?.checked) {
        document.getElementById('info-buildings').textContent = '0';
        return;
    }

    if (state.map.getZoom() < MIN_ZOOM_BUILDINGS) {
        document.getElementById('info-buildings').textContent = `0 (Zoom < ${MIN_ZOOM_BUILDINGS})`;
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
            style: {
                color: CONFIG.colors.highlight,
                weight: 1,
                fillColor: CONFIG.colors.highlight,
                fillOpacity: 0.4
            },
            interactive: false
        }).addTo(state.map);

        if (document.getElementById('overlay-buffers')?.checked) {
            renderBuffers(data);
        }
    } catch (error) {
        console.error('WFS error:', error);
    }
}

/**
 * Render buffer zones around buildings
 * @param {Object} data - GeoJSON data
 */
function renderBuffers(data) {
    if (typeof turf === 'undefined') {
        console.warn('Turf.js not loaded');
        return;
    }

    try {
        const bufferRadius = Number.parseInt(document.getElementById('buffer-radius')?.value || '50', 10) / 1000;
        const bufferedCollection = turf.buffer(data, bufferRadius, { units: 'kilometers' });

        const finalGeoJSON = data.features.length <= CONFIG.maxBuildingsForDissolve
            ? turf.dissolve(bufferedCollection)
            : bufferedCollection;

        state.buffersLayer = L.geoJSON(finalGeoJSON, {
            style: {
                color: CONFIG.colors.buffer,
                weight: 1,
                fillColor: CONFIG.colors.buffer,
                fillOpacity: 0.2,
                dashArray: '5, 5'
            },
            interactive: false
        }).addTo(state.map);
    } catch (e) {
        console.error('Turf error:', e);
    }
}

/**
 * Load Parc de Chartreuse layer
 */
async function loadParcChartreuse() {
    try {
        if (typeof PARC_CHARTREUSE_DATA === 'undefined') {
            throw new TypeError('Parc Chartreuse data not loaded');
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
                if (feature.properties?.name) {
                    layer.bindPopup(`<b>${feature.properties.name}</b><br>Source: ${feature.properties.source || 'Unknown'}`);
                }
            }
        }).addTo(state.map);
    } catch (error) {
        console.error('Error loading Parc de Chartreuse:', error);
        alert('Erreur lors du chargement du périmètre du Parc de Chartreuse');
    }
}

/**
 * Load contour line at specified altitude
 */
async function loadContourLine() {
    const altitude = Number.parseInt(document.getElementById('contour-altitude')?.value, 10);

    if (Number.isNaN(altitude) || altitude < 0 || altitude > 5000) {
        alert('Veuillez entrer une altitude valide entre 0 et 5000 mètres');
        return;
    }

    if (state.layers.contourLine) {
        state.map.removeLayer(state.layers.contourLine);
    }

    if (state.map.getZoom() < MIN_ZOOM_CONTOUR) {
        alert(`Les courbes de niveau ne sont disponibles qu'à partir du niveau de zoom ${MIN_ZOOM_CONTOUR}.\nVeuillez zoomer davantage.`);
        return;
    }

    const vectorTileUrl = 'https://data.geopf.fr/tms/1.0.0/ISOHYPSE/{z}/{x}/{y}.pbf';

    try {
        state.layers.contourLine = L.vectorGrid.protobuf(vectorTileUrl, {
            vectorTileLayerStyles: {
                courbe: (properties) => {
                    if (properties.altitude === altitude) {
                        return {
                            color: '#e74c3c',
                            weight: properties.importance === 'Principale' ? 5 : 3,
                            opacity: 0.9
                        };
                    }
                    return { opacity: 0, weight: 0 };
                }
            },
            interactive: true,
            maxZoom: 19,
            minZoom: MIN_ZOOM_CONTOUR,
            getFeatureId: (feature) => feature.properties.altitude
        });

        state.layers.contourLine.on('click', (e) => {
            if (e.layer.properties?.altitude === altitude) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<b>Courbe de niveau</b><br>Altitude: ${e.layer.properties.altitude}m`)
                    .openOn(state.map);
            }
        });

        state.layers.contourLine.addTo(state.map);
        console.log(`Loaded contour line layer for altitude ${altitude}m`);
    } catch (error) {
        console.error('Error loading contour line:', error);
        alert(`Erreur lors du chargement de la courbe de niveau: ${error.message}`);
    }
}

/**
 * Restore layer settings from saved state
 * @param {Object} settings - Layer settings object
 */
export function restoreLayerSettings(settings) {
    // Ortho layer
    const orthoCheckbox = document.getElementById('overlay-ortho');
    if (orthoCheckbox && settings.orthoEnabled !== undefined) {
        orthoCheckbox.checked = settings.orthoEnabled;
        if (settings.orthoEnabled) {
            document.getElementById('opacity-control')?.classList.remove('hidden');
        }
    }

    const orthoOpacity = document.getElementById('ortho-opacity');
    const opacityValue = document.getElementById('opacity-value');
    if (orthoOpacity && settings.orthoOpacity !== undefined) {
        orthoOpacity.value = settings.orthoOpacity;
        if (opacityValue) opacityValue.textContent = `${settings.orthoOpacity}%`;
    }

    // Buildings and buffers
    const buildingsCheckbox = document.getElementById('overlay-buildings');
    if (buildingsCheckbox && settings.buildingsEnabled !== undefined) {
        buildingsCheckbox.checked = settings.buildingsEnabled;
    }

    const buffersCheckbox = document.getElementById('overlay-buffers');
    if (buffersCheckbox && settings.buffersEnabled !== undefined) {
        buffersCheckbox.checked = settings.buffersEnabled;
        if (settings.buffersEnabled) {
            document.getElementById('buffer-radius-control')?.classList.remove('hidden');
        }
    }

    const bufferRadius = document.getElementById('buffer-radius');
    const bufferRadiusValue = document.getElementById('buffer-radius-value');
    if (bufferRadius && settings.bufferRadius !== undefined) {
        bufferRadius.value = settings.bufferRadius;
        if (bufferRadiusValue) bufferRadiusValue.textContent = `${settings.bufferRadius}m`;
    }

    // Parc Chartreuse
    const parcChartreuseCheckbox = document.getElementById('overlay-parc-chartreuse');
    if (parcChartreuseCheckbox && settings.parcChartreuseEnabled !== undefined) {
        parcChartreuseCheckbox.checked = settings.parcChartreuseEnabled;
    }

    // Contour line
    const contourCheckbox = document.getElementById('overlay-contour');
    if (contourCheckbox && settings.contourEnabled !== undefined) {
        contourCheckbox.checked = settings.contourEnabled;
    }

    const contourAltitude = document.getElementById('contour-altitude');
    if (contourAltitude && settings.contourAltitude !== undefined) {
        contourAltitude.value = settings.contourAltitude;
    }

    // Trigger layer updates after map is ready
    setTimeout(() => {
        if (settings.orthoEnabled) {
            document.getElementById('overlay-ortho')?.dispatchEvent(new Event('change'));
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
    }, LAYER_RESTORE_DELAY);
}
