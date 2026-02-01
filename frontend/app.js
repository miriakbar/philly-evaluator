// ============================================
// Philly Nest - Neighborhood Intelligence
// ============================================

const API_BASE_URL = window.location.origin;

// Application State
const state = {
    map: null,
    markers: [],
    locations: [],
    selectedIndex: null,
    isLoading: false,
    timeFilterMonths: 12 // Default: 1 year
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    console.log('🏠 Philly Nest initialized');
});

function initMap() {
    state.map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView([39.9526, -75.1652], 12);

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    L.control.attribution({
        prefix: false,
        position: 'bottomright'
    }).addTo(state.map).addAttribution('© <a href="https://carto.com/">CARTO</a>');
}

function setupEventListeners() {
    const input = document.getElementById('addressInput');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchArea();
    });

    // *** VITAL FIX: Global Click Listener for Popups ***
    // Leaflet creates popups dynamically, so we listen to the document
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('js-view-analysis')) {
            const index = e.target.getAttribute('data-index');
            openDetailPanel(index);
        }
    });
}

// ============================================
// Time Filter
// ============================================

function setTimeFilter(months) {
    state.timeFilterMonths = months;
    
    // Update button states
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.months) === months) {
            btn.classList.add('active');
        }
    });
    
    showToast(`Time filter set to ${months} months`, 'success');
}

// ============================================
// Search & Data Fetching
// ============================================

async function searchArea() {
    const address = document.getElementById('addressInput').value.trim();
    
    if (!address) {
        showToast('Please enter an address', 'error');
        return;
    }

    if (state.isLoading) return;
    
    state.isLoading = true;
    showLoading(true, 'Finding location...');
    document.getElementById('searchBtn').disabled = true;

    try {
        // Step 1: Geocode
        const location = await geocodeAddress(address);
        showLoading(true, 'Gathering neighborhood data...');
        
        // Step 2: Calculate date range based on filter
        const radius = 0.008;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - state.timeFilterMonths);
        
        const dateParams = {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };

        showLoading(true, 'Analyzing safety data...');
        
        // Step 3: Fetch all data in parallel
        const [crimeData, data311, violations, parks] = await Promise.all([
            fetchCrimeData(location.lat, location.lon, radius, dateParams),
            fetch311Data(location.lat, location.lon, radius, dateParams),
            fetchViolationsData(location.lat, location.lon, radius),
            fetchParksData(location.lat, location.lon, radius)
        ]);

        showLoading(true, 'Calculating scores...');

        // Step 4: Analyze
        const analysis = analyzeNeighborhood(crimeData, data311, violations, parks);
        
        // Step 5: Store
        const locationData = {
            location,
            analysis,
            rawData: { crimeData, data311, violations, parks },
            timeFilter: state.timeFilterMonths,
            timestamp: new Date().toISOString()
        };
        
        state.locations.push(locationData);
        
        // Step 6: Update UI
        addMarkerToMap(locationData, state.locations.length - 1);
        renderLocationsList();
        selectLocation(state.locations.length - 1);
        
        showToast(`Added: ${getShortAddress(location.display_name)}`, 'success');
        document.getElementById('addressInput').value = '';

    } catch (error) {
        console.error('Search error:', error);
        showToast(error.message || 'Failed to analyze location', 'error');
    } finally {
        state.isLoading = false;
        showLoading(false);
        document.getElementById('searchBtn').disabled = false;
    }
}

async function geocodeAddress(address) {
    const response = await fetch(`${API_BASE_URL}/api/geocode?address=${encodeURIComponent(address)}`);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Could not find address');
    }
    return response.json();
}

async function fetchCrimeData(lat, lon, radius, { startDate, endDate }) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/crime-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon, radius, startDate, endDate })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.rows || [];
    } catch (e) {
        console.warn('Crime data fetch failed:', e);
        return [];
    }
}

async function fetch311Data(lat, lon, radius, { startDate, endDate }) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/311-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon, radius, startDate, endDate })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.rows || [];
    } catch (e) {
        console.warn('311 data fetch failed:', e);
        return [];
    }
}

async function fetchViolationsData(lat, lon, radius) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/violations-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon, radius })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.rows || [];
    } catch (e) {
        console.warn('Violations data fetch failed:', e);
        return [];
    }
}

async function fetchParksData(lat, lon, radius) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/parks-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon, radius: radius * 2 })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.rows || [];
    } catch (e) {
        console.warn('Parks data fetch failed:', e);
        return [];
    }
}

// ============================================
// Analysis Engine
// ============================================

function analyzeNeighborhood(crimeData, data311, violations, parks) {
    const crimeAnalysis = analyzeCrime(crimeData);
    const communityAnalysis = analyzeCommunity(data311);
    const propertyAnalysis = analyzeProperty(violations);
    const parksAnalysis = analyzeParks(parks);
    
    // Weighted score
    const weights = { safety: 0.35, community: 0.25, property: 0.20, parks: 0.20 };
    
    const overallScore = Math.round(
        crimeAnalysis.score * weights.safety +
        communityAnalysis.score * weights.community +
        propertyAnalysis.score * weights.property +
        parksAnalysis.score * weights.parks
    );
    
    return {
        overallScore,
        scoreLabel: getScoreLabel(overallScore),
        scoreDescription: getScoreDescription(overallScore),
        categories: {
            safety: crimeAnalysis,
            community: communityAnalysis,
            property: propertyAnalysis,
            parks: parksAnalysis
        }
    };
}

function analyzeCrime(data) {
    const total = data.length;
    const violentTypes = ['Aggravated Assault', 'Robbery', 'Rape', 'Homicide', 'Assault'];
    const propertyTypes = ['Burglary', 'Theft', 'Motor Vehicle Theft', 'Arson', 'Vandalism'];
    
    let violent = 0, property = 0, other = 0;
    
    data.forEach(crime => {
        const type = crime.text_general_code || '';
        if (violentTypes.some(t => type.includes(t))) violent++;
        else if (propertyTypes.some(t => type.includes(t))) property++;
        else other++;
    });
    
    let score = 100;
    score -= Math.min(30, total * 0.15);
    score -= Math.min(40, violent * 2);
    score -= Math.min(20, property * 0.3);
    score = Math.max(0, Math.min(100, score));
    
    const recentIncidents = data.slice(0, 10).map(c => ({
        type: c.text_general_code || 'Unknown',
        date: c.dispatch_date_time ? new Date(c.dispatch_date_time).toLocaleDateString() : 'Unknown'
    }));
    
    return { score: Math.round(score), total, violent, property, other, recentIncidents };
}

function analyzeCommunity(data) {
    const total = data.length;
    let noise = 0, dumping = 0, maintenance = 0, other = 0;
    
    data.forEach(req => {
        const type = (req.service_name || '').toLowerCase();
        if (type.includes('noise')) noise++;
        else if (type.includes('dump') || type.includes('litter') || type.includes('trash')) dumping++;
        else if (type.includes('street') || type.includes('light') || type.includes('pothole')) maintenance++;
        else other++;
    });
    
    let score = 100;
    score -= Math.min(20, total * 0.08);
    score -= Math.min(25, noise * 1.2);
    score -= Math.min(20, dumping * 0.8);
    score -= Math.min(10, maintenance * 0.2);
    score = Math.max(0, Math.min(100, score));
    
    return { score: Math.round(score), total, noise, dumping, maintenance, other };
}

function analyzeProperty(data) {
    const total = data.length;
    let open = 0, closed = 0;
    
    data.forEach(v => {
        const status = (v.casestatus || '').toLowerCase();
        if (status.includes('open') || status.includes('active')) open++;
        else closed++;
    });
    
    let score = 100;
    score -= Math.min(25, total * 0.25);
    score -= Math.min(35, open * 1.2);
    score = Math.max(0, Math.min(100, score));
    
    return { score: Math.round(score), total, open, closed };
}

function analyzeParks(data) {
    const count = data.length;
    let score = 50 + Math.min(50, count * 10);
    score = Math.max(0, Math.min(100, score));
    
    return { score: Math.round(score), count };
}

// ============================================
// Scoring Helpers
// ============================================

function getScoreLabel(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Work';
}

function getScoreClass(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
}

function getScoreColor(score) {
    if (score >= 85) return '#22c55e';
    if (score >= 70) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
}

function getScoreDescription(score) {
    if (score >= 85) return 'This area shows strong indicators across safety, community, and livability.';
    if (score >= 70) return 'A solid neighborhood with good fundamentals and minor areas for improvement.';
    if (score >= 50) return 'This area has both strengths and challenges typical of urban neighborhoods.';
    return 'This area shows some concerns that potential residents should carefully consider.';
}

// ============================================
// Map Functions
// ============================================

function addMarkerToMap(locationData, index) {
    const { location, analysis } = locationData;
    const color = getScoreColor(analysis.overallScore);
    
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${color};
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 3px solid rgba(255,255,255,0.9);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 13px;
            font-family: 'DM Sans', sans-serif;
        ">${analysis.overallScore}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker([location.lat, location.lon], { icon: markerIcon }).addTo(state.map);
    
    const popupContent = createPopupContent(locationData, index);
    marker.bindPopup(popupContent, { maxWidth: 260, className: 'custom-popup' });
    
    // When marker is clicked, highlight in sidebar
    marker.on('click', () => selectLocation(index));
    
    state.markers.push(marker);
    state.map.setView([location.lat, location.lon], 14);
}

function createPopupContent(locationData, index) {
    const { location, analysis } = locationData;
    const { categories } = analysis;
    const color = getScoreColor(analysis.overallScore);
    
    // REDESIGNED POPUP: Uses 'data-index' instead of 'onclick' for better reliability
    return `
        <div class="popup-inner">
            <div class="popup-header" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 8px;">
                <div class="popup-title" style="font-size: 14px;">${getShortAddress(location.display_name)}</div>
            </div>
            
            <div class="popup-score" style="justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="popup-score-circle" style="background: ${color}22; color: ${color}; border: 1px solid ${color}; width:32px; height:32px; font-size:12px;">
                        ${analysis.overallScore}
                    </div>
                    <span style="font-size:12px; color:#a1a1aa;">${analysis.scoreLabel}</span>
                </div>
            </div>

            <div class="popup-stats">
                <div class="popup-stat">
                    <div class="popup-stat-value" style="color:#fff;">${categories.safety.total}</div>
                    <div class="popup-stat-label">Crimes</div>
                </div>
                <div class="popup-stat">
                    <div class="popup-stat-value" style="color:#fff;">${categories.community.total}</div>
                    <div class="popup-stat-label">311 Calls</div>
                </div>
                <div class="popup-stat">
                    <div class="popup-stat-value" style="color:#fff;">${categories.parks.count}</div>
                    <div class="popup-stat-label">Parks</div>
                </div>
            </div>
            
            <button class="popup-btn js-view-analysis" data-index="${index}" style="
                margin-top: 12px;
                background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
                box-shadow: 0 4px 12px ${color}40;
                border: none;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-size: 10px;
                padding: 12px;
                width: 100%;
                border-radius: 6px;
                color: #000;
                font-weight: 700;
                cursor: pointer;
            ">
                View Full Analysis
            </button>
        </div>
    `;
}

// ============================================
// UI Rendering
// ============================================

function renderLocationsList() {
    const container = document.getElementById('locationsList');
    const emptyState = document.getElementById('emptyState');
    
    if (state.locations.length === 0) {
        emptyState.style.display = 'block';
        container.innerHTML = '';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = state.locations.map((loc, index) => {
        const { location, analysis } = loc;
        const { categories } = analysis;
        const scoreClass = getScoreClass(analysis.overallScore);
        const isActive = state.selectedIndex === index;
        
        return `
            <div class="location-card ${isActive ? 'active' : ''}" onclick="selectLocation(${index})">
                <div class="location-header">
                    <div class="location-name">${getShortAddress(location.display_name)}</div>
                    <div class="location-score">
                        <div class="score-circle score-${scoreClass}">${analysis.overallScore}</div>
                        <span class="score-label">${analysis.scoreLabel}</span>
                    </div>
                </div>
                <div class="location-metrics">
                    <div class="metric-mini">
                        <div class="metric-mini-value">${categories.safety.score}</div>
                        <div class="metric-mini-label">Safety</div>
                    </div>
                    <div class="metric-mini">
                        <div class="metric-mini-value">${categories.community.score}</div>
                        <div class="metric-mini-label">Community</div>
                    </div>
                    <div class="metric-mini">
                        <div class="metric-mini-value">${categories.property.score}</div>
                        <div class="metric-mini-label">Property</div>
                    </div>
                    <div class="metric-mini">
                        <div class="metric-mini-value">${categories.parks.count}</div>
                        <div class="metric-mini-label">Parks</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function selectLocation(index) {
    state.selectedIndex = index;
    renderLocationsList();
    
    const loc = state.locations[index];
    state.map.setView([loc.location.lat, loc.location.lon], 15);
    state.markers[index].openPopup();
}

function openDetailPanel(index) {
    const loc = state.locations[index];
    const { location, analysis, timeFilter } = loc;
    const { categories } = analysis;
    const scoreClass = getScoreClass(analysis.overallScore);
    const color = getScoreColor(analysis.overallScore);
    
    // Update header
    document.getElementById('detailTitle').textContent = getShortAddress(location.display_name);
    document.getElementById('detailAddress').textContent = location.display_name;
    document.getElementById('detailScoreNumber').textContent = analysis.overallScore;
    document.getElementById('detailScoreTitle').textContent = analysis.scoreLabel + ' Neighborhood';
    document.getElementById('detailScoreDesc').textContent = analysis.scoreDescription;
    
    const scoreCircle = document.getElementById('detailScoreCircle');
    scoreCircle.className = `detail-score-circle score-${scoreClass}`;
    scoreCircle.style.background = `${color}22`;
    scoreCircle.style.color = color;
    
    // Update content
    document.getElementById('detailContent').innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-icon safety">🚨</div>
                <div class="metric-value">${categories.safety.score}</div>
                <div class="metric-label">Safety Score</div>
                <div class="metric-detail">${categories.safety.total} incidents (${categories.safety.violent} violent)</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon community">📞</div>
                <div class="metric-value">${categories.community.score}</div>
                <div class="metric-label">Community Score</div>
                <div class="metric-detail">${categories.community.total} service requests</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon property">🏠</div>
                <div class="metric-value">${categories.property.score}</div>
                <div class="metric-label">Property Score</div>
                <div class="metric-detail">${categories.property.open} open violations</div>
            </div>
            <div class="metric-card">
                <div class="metric-icon parks">🌳</div>
                <div class="metric-value">${categories.parks.count}</div>
                <div class="metric-label">Parks Nearby</div>
                <div class="metric-detail">${categories.parks.count > 0 ? 'Recreation access' : 'Limited green space'}</div>
            </div>
        </div>
        
        <div class="breakdown-section">
            <div class="breakdown-title">Score Breakdown</div>
            ${renderBreakdownBar('Safety (35%)', categories.safety.score, '#ef4444')}
            ${renderBreakdownBar('Community (25%)', categories.community.score, '#a855f7')}
            ${renderBreakdownBar('Property (20%)', categories.property.score, '#f59e0b')}
            ${renderBreakdownBar('Green Space (20%)', categories.parks.score, '#22c55e')}
        </div>
        
        <div class="breakdown-section">
            <div class="breakdown-title">Community Issues (311)</div>
            <div class="breakdown-item">
                <span class="breakdown-name">🔊 Noise Complaints</span>
                <span class="breakdown-value">${categories.community.noise}</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-name">🗑️ Dumping/Litter</span>
                <span class="breakdown-value">${categories.community.dumping}</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-name">🔧 Street Maintenance</span>
                <span class="breakdown-value">${categories.community.maintenance}</span>
            </div>
        </div>
        
        <div class="breakdown-section">
            <div class="breakdown-title">Crime Breakdown</div>
            <div class="breakdown-item">
                <span class="breakdown-name">⚠️ Violent Crimes</span>
                <span class="breakdown-value">${categories.safety.violent}</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-name">🏠 Property Crimes</span>
                <span class="breakdown-value">${categories.safety.property}</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-name">📋 Other Incidents</span>
                <span class="breakdown-value">${categories.safety.other}</span>
            </div>
        </div>
        
        ${categories.safety.recentIncidents.length > 0 ? `
        <div class="breakdown-section">
            <div class="breakdown-title">Recent Incidents</div>
            <div class="incidents-list">
                ${categories.safety.recentIncidents.slice(0, 5).map(inc => `
                    <div class="incident-item">
                        <div class="incident-type">${inc.type}</div>
                        <div class="incident-date">${inc.date}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        <div class="breakdown-section">
            <div class="breakdown-title">Data Info</div>
            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.7;">
                📅 Time range: ${timeFilter || 12} months<br>
                📍 Radius: ~0.5 miles<br>
                🔄 Data from Philadelphia Open Data<br>
            </div>
        </div>
    `;
    
    // Open panel
    document.getElementById('detailPanel').classList.add('open');
    document.getElementById('detailOverlay').classList.add('open');
}

function renderBreakdownBar(label, score, color) {
    return `
        <div class="breakdown-item">
            <span class="breakdown-name">${label}</span>
            <div class="breakdown-bar">
                <div class="breakdown-bar-fill" style="width: ${score}%; background: ${color};"></div>
            </div>
            <span class="breakdown-value">${score}</span>
        </div>
    `;
}

function closeDetailPanel() {
    document.getElementById('detailPanel').classList.remove('open');
    document.getElementById('detailOverlay').classList.remove('open');
}

// ============================================
// Utility Functions
// ============================================

function getShortAddress(fullAddress) {
    if (!fullAddress) return 'Unknown Location';
    const parts = fullAddress.split(',');
    return parts.slice(0, 2).join(',').trim();
}

function showLoading(show, text = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    document.getElementById('loadingText').textContent = text;
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastIcon').textContent = type === 'success' ? '✓' : '✕';
    document.getElementById('toastMessage').textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Global functions
window.searchArea = searchArea;
window.selectLocation = selectLocation;
window.openDetailPanel = openDetailPanel;
window.closeDetailPanel = closeDetailPanel;
window.setTimeFilter = setTimeFilter;

console.log('🏠 Philly Nest ready!');
