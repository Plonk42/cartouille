/**
 * UI initialization - search, settings, coordinate converter, collapsible sections
 * @module ui
 */

import { CONFIG, setApiKey } from './config.js';
import { createElement } from './elements.js';
import { state } from './state.js';

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
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
            state.map.setView([lat, lng], 14);
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
            state.map.setView([data[0].lat, data[0].lon], 14);
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
        debounceTimer = setTimeout(doConvert, 300);
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
                }, 1500);
            });
        }
    });

    btnGoto?.addEventListener('click', () => {
        if (lastConvertedLat !== null && lastConvertedLng !== null) {
            state.map.setView([lastConvertedLat, lastConvertedLng], 14);
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
 * Parse DMS string to decimal coordinates
 * @param {string} input - DMS string like "39° 50′ 27″ nord, 0° 30′ 26″ ouest"
 * @returns {Object|null} {lat, lng} or null if parsing fails
 */
function parseDMSString(input) {
    let normalized = input
        .toLowerCase()
        .replace(/[,;]/g, ' ')
        .replace(/['\u2019]/g, '\u2032')
        .replace(/["\u201d]/g, '\u2033')
        .replace(/\s+/g, ' ')
        .trim();

    const dmsPattern = /(\d+(?:[.,]\d+)?)[\s°d]*(\d+(?:[.,]\d+)?)?[\s′'m]*(\d+(?:[.,]\d+)?)?[\s″"s]*\s*(nord?|sud?|est?|west|ouest?|[nseoNSEOW])/gi;
    const matches = [...normalized.matchAll(dmsPattern)];

    if (matches.length < 2) return null;

    function parseCoord(match) {
        const deg = parseFloat(match[1].replace(',', '.')) || 0;
        const min = parseFloat((match[2] || '0').replace(',', '.')) || 0;
        const sec = parseFloat((match[3] || '0').replace(',', '.')) || 0;
        const dir = match[4].toLowerCase();

        let decimal = deg + (min / 60) + (sec / 3600);
        if (dir.startsWith('s') || dir.startsWith('o') || dir.startsWith('w')) {
            decimal = -decimal;
        }

        return { decimal, isLatitude: dir.startsWith('n') || dir.startsWith('s') };
    }

    const coord1 = parseCoord(matches[0]);
    const coord2 = parseCoord(matches[1]);

    let lat, lng;
    if (coord1.isLatitude && !coord2.isLatitude) {
        lat = coord1.decimal;
        lng = coord2.decimal;
    } else if (!coord1.isLatitude && coord2.isLatitude) {
        lat = coord2.decimal;
        lng = coord1.decimal;
    } else {
        lat = coord1.decimal;
        lng = coord2.decimal;
    }

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
