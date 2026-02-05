/**
 * UI initialization - search, settings, coordinate converter, collapsible sections
 * @module ui
 */

import { CONFIG, DEBOUNCE_DELAY, setApiKey } from './config.js';
import { createElement } from './elements.js';
import { state } from './state.js';

/** @constant {number} Default zoom level for search results */
const SEARCH_RESULT_ZOOM = 14;

/** @constant {number} Copy feedback duration in ms */
const COPY_FEEDBACK_DURATION = 1500;

/**
 * Initialize search functionality
 */
export function initSearch() {
    document.getElementById('search-btn')?.addEventListener('click', performSearch);
    document.getElementById('search-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

/**
 * Perform search (coordinates or place name)
 */
async function performSearch() {
    const query = document.getElementById('search-input')?.value.trim();
    if (!query) return;

    // Check if it's coordinates
    const coordMatch = query.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coordMatch) {
        const lat = Number.parseFloat(coordMatch[1]);
        const lng = Number.parseFloat(coordMatch[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            state.map.setView([lat, lng], SEARCH_RESULT_ZOOM);
            return;
        }
    }

    // Search using Nominatim
    try {
        const response = await fetch(
            `${CONFIG.endpoints.nominatim}?q=${encodeURIComponent(query)}&format=json&countrycodes=fr&limit=1`
        );
        const data = await response.json();
        if (data?.length > 0) {
            state.map.setView([data[0].lat, data[0].lon], SEARCH_RESULT_ZOOM);
        } else {
            alert('Lieu non trouvé');
        }
    } catch (error) {
        console.error('Search error:', error);
        alert('Erreur lors de la recherche');
    }
}

/**
 * Initialize settings (API key management)
 */
export function initSettings() {
    const apiKeyInput = document.getElementById('api-key-input');
    if (apiKeyInput) {
        apiKeyInput.value = CONFIG.ignApiKey;
    }

    document.getElementById('btn-save-api-key')?.addEventListener('click', () => {
        const newApiKey = apiKeyInput?.value.trim();
        if (newApiKey) {
            setApiKey(newApiKey);
            alert('Clé API enregistrée. Rechargez la page pour appliquer les modifications.');
        } else {
            alert('Veuillez entrer une clé API valide.');
        }
    });

    apiKeyInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-save-api-key')?.click();
        }
    });
}

/**
 * Initialize coordinate converter (DMS to Decimal)
 */
export function initCoordinateConverter() {
    const dmsInput = document.getElementById('dms-input');
    const btnCopy = document.getElementById('btn-copy-coords');
    const btnGoto = document.getElementById('btn-goto-coords');
    const btnMarker = document.getElementById('btn-marker-coords');
    const resultDiv = document.getElementById('converter-result');
    const decimalCoordsSpan = document.getElementById('decimal-coords');

    let lastConvertedLat = null;
    let lastConvertedLng = null;
    let debounceTimer = null;

    function doConvert() {
        const input = dmsInput?.value.trim();
        if (!input) {
            resultDiv?.classList.add('hidden');
            lastConvertedLat = null;
            lastConvertedLng = null;
            return;
        }

        const result = parseDMSString(input);

        if (!result) {
            resultDiv?.classList.add('hidden');
            lastConvertedLat = null;
            lastConvertedLng = null;
            return;
        }

        lastConvertedLat = result.lat;
        lastConvertedLng = result.lng;

        if (decimalCoordsSpan) {
            decimalCoordsSpan.textContent = `${lastConvertedLat.toFixed(5)}, ${lastConvertedLng.toFixed(5)}`;
        }
        resultDiv?.classList.remove('hidden');
    }

    // Auto-convert on input with debounce
    dmsInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doConvert, DEBOUNCE_DELAY);
    });

    dmsInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(debounceTimer);
            doConvert();
        }
    });

    btnCopy?.addEventListener('click', () => {
        const coords = decimalCoordsSpan?.textContent;
        if (coords) {
            navigator.clipboard.writeText(coords).then(() => {
                const originalIcon = btnCopy.innerHTML;
                btnCopy.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    btnCopy.innerHTML = originalIcon;
                }, COPY_FEEDBACK_DURATION);
            });
        }
    });

    btnGoto?.addEventListener('click', () => {
        if (lastConvertedLat !== null && lastConvertedLng !== null) {
            state.map.setView([lastConvertedLat, lastConvertedLng], SEARCH_RESULT_ZOOM);
        }
    });

    btnMarker?.addEventListener('click', () => {
        if (lastConvertedLat !== null && lastConvertedLng !== null) {
            createElement('marker', {
                lat: lastConvertedLat,
                lng: lastConvertedLng,
                title: 'Marqueur'
            });
        }
    });
}

/**
 * Parse a single DMS coordinate match
 * @param {Array} match - Regex match array
 * @returns {Object} Parsed coordinate with decimal and isLatitude
 */
function parseDMSCoord(match) {
    const deg = Number.parseFloat(match[1].replace(',', '.')) || 0;
    const min = Number.parseFloat((match[2] || '0').replace(',', '.')) || 0;
    const sec = Number.parseFloat((match[3] || '0').replace(',', '.')) || 0;
    const dir = match[4].toLowerCase();

    let decimal = deg + (min / 60) + (sec / 3600);
    if (dir.startsWith('s') || dir.startsWith('o') || dir.startsWith('w')) {
        decimal = -decimal;
    }

    return { decimal, isLatitude: dir.startsWith('n') || dir.startsWith('s') };
}

/**
 * Parse DMS string to decimal coordinates
 * @param {string} input - DMS string like "39° 50′ 27″ nord, 0° 30′ 26″ ouest"
 * @returns {Object|null} {lat, lng} or null if parsing fails
 */
function parseDMSString(input) {
    const normalized = input
        .toLowerCase()
        .replaceAll(/[,;]/g, ' ')
        .replaceAll(/['\u2019]/g, '\u2032')
        .replaceAll(/["\u201d]/g, '\u2033')
        .replaceAll(/\s+/g, ' ')
        .trim();

    // Simplified DMS pattern
    const dmsPattern = /(\d+(?:[.,]\d+)?)[\s°]*?(\d+(?:[.,]\d+)?)?[\s′']*?(\d+(?:[.,]\d+)?)?[\s″"]*?\s*(nord?|sud?|est?|west|ouest?|[nsew])/gi;
    const matches = [...normalized.matchAll(dmsPattern)];

    if (matches.length < 2) return null;

    const coord1 = parseDMSCoord(matches[0]);
    const coord2 = parseDMSCoord(matches[1]);

    // Determine lat/lng based on direction
    const lat = coord1.isLatitude ? coord1.decimal : coord2.decimal;
    const lng = coord1.isLatitude ? coord2.decimal : coord1.decimal;

    return { lat, lng };
}

/**
 * Initialize collapsible sections
 */
export function initCollapsibleSections() {
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.section');
            section?.classList.toggle('collapsed');
            saveCollapsedState();
        });
    });

    restoreCollapsedState();
}

/**
 * Save collapsed state to localStorage
 */
function saveCollapsedState() {
    const collapsedSections = [];
    document.querySelectorAll('.section.collapsed').forEach(section => {
        const contentId = section.querySelector('.section-content')?.id;
        if (contentId) collapsedSections.push(contentId);
    });
    localStorage.setItem('collapsedSections', JSON.stringify(collapsedSections));
}

/**
 * Restore collapsed state from localStorage
 */
function restoreCollapsedState() {
    const saved = localStorage.getItem('collapsedSections');
    if (saved) {
        const collapsedSections = JSON.parse(saved);
        collapsedSections.forEach(contentId => {
            const content = document.getElementById(contentId);
            content?.closest('.section')?.classList.add('collapsed');
        });
    }
}
