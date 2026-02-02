// Philly Nest - Neighborhood Intelligence

const API_BASE_URL = window.location.origin;

const state = {
    map: null,
    markers: [],
    locations: [],
    selectedIndex: null,
    isLoading: false,
    timeFilterMonths: 12
};

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    console.log('🏠 Philly Nest ready');
});

function initMap() {
    state.map = L.map('map').setView([39.9526, -75.1652], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);
}

function setupEventListeners() {
    // Search
    document.getElementById('addressInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchArea();
    });
    document.getElementById('searchBtn').addEventListener('click', searchArea);

    // Time filter buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.timeFilterMonths = parseInt(btn.dataset.months);
            showToast(`Time filter: ${state.timeFilterMonths} months`, 'success');
        });
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
}

// ============================================
// SEARCH
// ============================================

async function searchArea() {
    const address = document.getElementById('addressInput').value.trim();
    if (!address) {
        showToast('Enter an address', 'error');
        return;
    }
    if (state.isLoading) return;

    state.isLoading = true;
    showLoading(true, 'Finding location...');
    document.getElementById('searchBtn').disabled = true;

    try {
        const location = await geocodeAddress(address);
        showLoading(true, 'Fetching data...');

        const radius = 0.008;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - state.timeFilterMonths);

        const dateParams = {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };

        const [crimeData, data311, violations, parks] = await Promise.all([
            fetchData('/api/crime-data', { lat: location.lat, lon: location.lon, radius, ...dateParams }),
            fetchData('/api/311-data', { lat: location.lat, lon: location.lon, radius, ...dateParams }),
            fetchData('/api/violations-data', { lat: location.lat, lon: location.lon, radius }),
            fetchData('/api/parks-data', { lat: location.lat, lon: location.lon, radius: radius * 2 })
        ]);

        showLoading(true, 'Analyzing...');
        const analysis = analyzeNeighborhood(crimeData, data311, violations, parks);

        const locationData = {
            location,
            analysis,
            rawData: { crimeData, data311, violations, parks },
            timeFilter: state.timeFilterMonths
        };

        state.locations.push(locationData);
        const idx = state.locations.length - 1;

        addMarker(locationData, idx);
        renderList();
        selectLocation(idx);

        showToast(`Added: ${shortAddr(location.display_name)}`, 'success');
        document.getElementById('addressInput').value = '';

    } catch (err) {
        console.error(err);
        showToast(err.message || 'Error', 'error');
    } finally {
        state.isLoading = false;
        showLoading(false);
        document.getElementById('searchBtn').disabled = false;
    }
}

async function geocodeAddress(address) {
    const res = await fetch(`${API_BASE_URL}/api/geocode?address=${encodeURIComponent(address)}`);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Address not found');
    }
    return res.json();
}

async function fetchData(endpoint, params) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.rows || [];
    } catch (e) {
        console.warn(`${endpoint} failed:`, e);
        return [];
    }
}

// ============================================
// ANALYSIS
// ============================================

function analyzeNeighborhood(crime, calls311, violations, parks) {
    const safety = analyzeCrime(crime);
    const community = analyzeCommunity(calls311);
    const property = analyzeProperty(violations);
    const green = analyzeParks(parks);

    const score = Math.round(
        safety.score * 0.35 +
        community.score * 0.25 +
        property.score * 0.20 +
        green.score * 0.20
    );

    return {
        overallScore: score,
        scoreLabel: getLabel(score),
        scoreDesc: getDesc(score),
        categories: { safety, community, property, parks: green }
    };
}

function analyzeCrime(data) {
    const total = data.length;
    const violentTypes = ['Aggravated Assault', 'Robbery', 'Rape', 'Homicide', 'Assault'];
    const propertyTypes = ['Burglary', 'Theft', 'Motor Vehicle Theft', 'Arson'];

    let violent = 0, property = 0;
    data.forEach(c => {
        const t = c.text_general_code || '';
        if (violentTypes.some(v => t.includes(v))) violent++;
        else if (propertyTypes.some(p => t.includes(p))) property++;
    });

    let score = 100 - Math.min(30, total * 0.15) - Math.min(40, violent * 2) - Math.min(20, property * 0.3);
    score = Math.max(0, Math.min(100, score));

    const recent = data.slice(0, 8).map(c => ({
        type: c.text_general_code || 'Unknown',
        date: c.dispatch_date_time ? new Date(c.dispatch_date_time).toLocaleDateString() : ''
    }));

    return { score: Math.round(score), total, violent, property, other: total - violent - property, recent };
}

function analyzeCommunity(data) {
    const total = data.length;
    let noise = 0, dumping = 0, maintenance = 0;

    data.forEach(r => {
        const t = (r.service_name || '').toLowerCase();
        if (t.includes('noise')) noise++;
        else if (t.includes('dump') || t.includes('litter') || t.includes('trash')) dumping++;
        else if (t.includes('street') || t.includes('light') || t.includes('pothole')) maintenance++;
    });

    let score = 100 - Math.min(20, total * 0.08) - Math.min(25, noise * 1.2) - Math.min(20, dumping * 0.8);
    return { score: Math.max(0, Math.min(100, Math.round(score))), total, noise, dumping, maintenance };
}

function analyzeProperty(data) {
    const total = data.length;
    let open = 0;
    data.forEach(v => {
        const s = (v.casestatus || '').toLowerCase();
        if (s.includes('open') || s.includes('active')) open++;
    });

    let score = 100 - Math.min(25, total * 0.25) - Math.min(35, open * 1.2);
    return { score: Math.max(0, Math.min(100, Math.round(score))), total, open };
}

function analyzeParks(data) {
    const count = data.length;
    const score = Math.min(100, 50 + count * 10);
    return { score, count };
}

function getLabel(s) {
    if (s >= 85) return 'Excellent';
    if (s >= 70) return 'Good';
    if (s >= 50) return 'Fair';
    return 'Needs Work';
}

function getClass(s) {
    if (s >= 85) return 'excellent';
    if (s >= 70) return 'good';
    if (s >= 50) return 'fair';
    return 'poor';
}

function getColor(s) {
    if (s >= 85) return '#22c55e';
    if (s >= 70) return '#3b82f6';
    if (s >= 50) return '#f59e0b';
    return '#ef4444';
}

function getDesc(s) {
    if (s >= 85) return 'Excellent area with strong safety and livability indicators.';
    if (s >= 70) return 'Good neighborhood with solid fundamentals.';
    if (s >= 50) return 'Average area with typical urban challenges.';
    return 'Area has concerns worth considering carefully.';
}

// ============================================
// MAP
// ============================================

function addMarker(locData, idx) {
    const { location, analysis } = locData;
    const color = getColor(analysis.overallScore);

    const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background:${color};
            width:32px;height:32px;
            border-radius:50%;
            border:3px solid rgba(255,255,255,0.9);
            box-shadow:0 3px 10px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;
            color:#fff;font-weight:700;font-size:12px;
        ">${analysis.overallScore}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const marker = L.marker([location.lat, location.lon], { icon }).addTo(state.map);

    const popup = `
        <div class="popup-inner">
            <div class="popup-header">
                <div class="popup-score" style="background:${color}22;color:${color};">${analysis.overallScore}</div>
                <div class="popup-title">${shortAddr(location.display_name)}</div>
            </div>
            <div class="popup-stats">
                <div class="popup-stat"><div class="popup-stat-value">${analysis.categories.safety.total}</div><div class="popup-stat-label">Crimes</div></div>
                <div class="popup-stat"><div class="popup-stat-value">${analysis.categories.community.total}</div><div class="popup-stat-label">311</div></div>
                <div class="popup-stat"><div class="popup-stat-value">${analysis.categories.parks.count}</div><div class="popup-stat-label">Parks</div></div>
            </div>
            <button class="popup-btn" onclick="openModal(${idx})">View Full Analysis</button>
        </div>
    `;

    marker.bindPopup(popup, { maxWidth: 240 });
    marker.on('click', () => selectLocation(idx));
    state.markers.push(marker);
    state.map.setView([location.lat, location.lon], 14);
}

// ============================================
// UI
// ============================================

function renderList() {
    const container = document.getElementById('locationsList');
    const empty = document.getElementById('emptyState');

    if (state.locations.length === 0) {
        empty.style.display = 'block';
        container.innerHTML = '';
        return;
    }

    empty.style.display = 'none';
    container.innerHTML = state.locations.map((loc, i) => {
        const { location, analysis } = loc;
        const { categories } = analysis;
        const cls = getClass(analysis.overallScore);
        const active = state.selectedIndex === i ? 'active' : '';

        return `
            <div class="location-card ${active}" onclick="selectLocation(${i})">
                <div class="location-header">
                    <div class="location-name">${shortAddr(location.display_name)}</div>
                    <div class="score-circle score-${cls}">${analysis.overallScore}</div>
                </div>
                <div class="location-metrics">
                    <div class="metric-mini"><div class="metric-mini-value">${categories.safety.score}</div><div class="metric-mini-label">Safety</div></div>
                    <div class="metric-mini"><div class="metric-mini-value">${categories.community.score}</div><div class="metric-mini-label">Community</div></div>
                    <div class="metric-mini"><div class="metric-mini-value">${categories.property.score}</div><div class="metric-mini-label">Property</div></div>
                    <div class="metric-mini"><div class="metric-mini-value">${categories.parks.count}</div><div class="metric-mini-label">Parks</div></div>
                </div>
            </div>
        `;
    }).join('');
}

function selectLocation(idx) {
    state.selectedIndex = idx;
    renderList();
    const loc = state.locations[idx];
    state.map.setView([loc.location.lat, loc.location.lon], 15);
    state.markers[idx].openPopup();
}

// ============================================
// MODAL
// ============================================

function openModal(idx) {
    const loc = state.locations[idx];
    const { location, analysis, timeFilter } = loc;
    const { categories } = analysis;
    const color = getColor(analysis.overallScore);
    const cls = getClass(analysis.overallScore);

    document.getElementById('modalTitle').textContent = shortAddr(location.display_name);
    document.getElementById('modalAddress').textContent = location.display_name;
    document.getElementById('modalScoreNumber').textContent = analysis.overallScore;
    document.getElementById('modalScoreTitle').textContent = analysis.scoreLabel + ' Neighborhood';
    document.getElementById('modalScoreDesc').textContent = analysis.scoreDesc;

    const circle = document.getElementById('modalScoreCircle');
    circle.className = `modal-score-circle score-${cls}`;
    circle.style.background = `${color}22`;
    circle.style.color = color;

    document.getElementById('modalBody').innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-icon">🚨</div>
                <div class="metric-value">${categories.safety.score}</div>
                <div class="metric-label">Safety Score</div>
                <div class="metric-detail">${categories.safety.total} incidents (${categories.safety.violent} violent)</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">📞</div>
                <div class="metric-value">${categories.community.score}</div>
                <div class="metric-label">Community Score</div>
                <div class="metric-detail">${categories.community.total} service requests</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">🏠</div>
                <div class="metric-value">${categories.property.score}</div>
                <div class="metric-label">Property Score</div>
                <div class="metric-detail">${categories.property.open} open violations</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">🌳</div>
                <div class="metric-value">${categories.parks.count}</div>
                <div class="metric-label">Parks Nearby</div>
                <div class="metric-detail">${categories.parks.count > 0 ? 'Green space access' : 'Limited parks'}</div>
            </div>
        </div>

        <div class="breakdown-section">
            <div class="breakdown-title">Score Weights</div>
            ${bar('Safety (35%)', categories.safety.score, '#ef4444')}
            ${bar('Community (25%)', categories.community.score, '#a855f7')}
            ${bar('Property (20%)', categories.property.score, '#f59e0b')}
            ${bar('Green Space (20%)', categories.parks.score, '#22c55e')}
        </div>

        <div class="breakdown-section">
            <div class="breakdown-title">311 Breakdown</div>
            <div class="breakdown-item"><span>🔊 Noise</span><span>${categories.community.noise}</span></div>
            <div class="breakdown-item"><span>🗑️ Dumping</span><span>${categories.community.dumping}</span></div>
            <div class="breakdown-item"><span>🔧 Maintenance</span><span>${categories.community.maintenance}</span></div>
        </div>

        <div class="breakdown-section">
            <div class="breakdown-title">Crime Breakdown</div>
            <div class="breakdown-item"><span>⚠️ Violent</span><span>${categories.safety.violent}</span></div>
            <div class="breakdown-item"><span>🏠 Property</span><span>${categories.safety.property}</span></div>
            <div class="breakdown-item"><span>📋 Other</span><span>${categories.safety.other}</span></div>
        </div>

        ${categories.safety.recent.length > 0 ? `
        <div class="breakdown-section">
            <div class="breakdown-title">Recent Incidents</div>
            <div class="incidents-list">
                ${categories.safety.recent.map(r => `
                    <div class="incident-item">
                        <div class="incident-type">${r.type}</div>
                        <div class="incident-date">${r.date}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="breakdown-section">
            <div class="breakdown-title">Data Info</div>
            <div style="font-size:10px;color:var(--text-muted);">
                Time range: ${timeFilter} months • Radius: ~0.5 mi<br>
                Source: Philadelphia Open Data
            </div>
        </div>
    `;

    document.getElementById('modalOverlay').classList.add('open');
}

function bar(label, score, color) {
    return `
        <div class="breakdown-item">
            <span>${label}</span>
            <div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:${score}%;background:${color};"></div></div>
            <span>${score}</span>
        </div>
    `;
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

// ============================================
// UTILS
// ============================================

function shortAddr(full) {
    if (!full) return 'Unknown';
    return full.split(',').slice(0, 2).join(',').trim();
}

function showLoading(show, text) {
    const el = document.getElementById('loadingOverlay');
    document.getElementById('loadingText').textContent = text || 'Loading...';
    if (show) el.classList.add('active');
    else el.classList.remove('active');
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    document.getElementById('toastIcon').textContent = type === 'success' ? '✓' : '✕';
    document.getElementById('toastMessage').textContent = msg;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Globals
window.searchArea = searchArea;
window.selectLocation = selectLocation;
window.openModal = openModal;
window.closeModal = closeModal;
