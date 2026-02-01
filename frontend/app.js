// Configuration
const API_BASE_URL = window.location.origin; // Use same origin as frontend

// Global state
let map;
let markers = [];
let searchedLocations = [];
let currentLocation = null;

// Initialize map
function initMap() {
    map = L.map('map').setView([39.9526, -75.1652], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    console.log('Map initialized');
}

window.addEventListener('load', () => {
    initMap();
});

function switchView(view) {
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (view === 'map') {
        document.getElementById('map').classList.add('active');
        document.getElementById('resultsContainer').classList.remove('active');
        setTimeout(() => map.invalidateSize(), 100);
    } else {
        document.getElementById('map').classList.remove('active');
        document.getElementById('resultsContainer').classList.add('active');
    }
}

function getScoreColor(score) {
    if (score >= 85) return '#28a745';
    if (score >= 70) return '#17a2b8';
    if (score >= 50) return '#ffc107';
    return '#dc3545';
}

function getScoreLabel(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
}

async function geocodeAddress(address) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/geocode?address=${encodeURIComponent(address)}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Geocoding failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

async function searchArea() {
    const address = document.getElementById('addressInput').value.trim();
    
    if (!address) {
        showMessage('Please enter an address', 'error');
        return;
    }

    showLoading(true, 'Geocoding address...');
    document.getElementById('searchBtn').disabled = true;

    try {
        // Step 1: Geocode the address
        const location = await geocodeAddress(address);
        currentLocation = location;
        console.log('Location found:', location);
        
        showLoading(true, 'Fetching crime data...');
        const radius = 0.008; // ~0.5 mile
        
        // Calculate date range (last 12 months)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Step 2: Fetch all data in parallel
        const [crimeResponse, service311Response, violationsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/crime-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: location.lat, lon: location.lon, radius, startDate: startDateStr, endDate: endDateStr })
            }),
            fetch(`${API_BASE_URL}/api/311-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: location.lat, lon: location.lon, radius, startDate: startDateStr, endDate: endDateStr })
            }),
            fetch(`${API_BASE_URL}/api/violations-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: location.lat, lon: location.lon, radius })
            })
        ]);
        
        if (!crimeResponse.ok || !service311Response.ok || !violationsResponse.ok) {
            throw new Error('Failed to fetch area data');
        }
        
        const crimeData = (await crimeResponse.json()).rows || [];
        const data311 = (await service311Response.json()).rows || [];
        const violationData = (await violationsResponse.json()).rows || [];
        
        console.log('Data received:', { crime: crimeData.length, service311: data311.length, violations: violationData.length });
        
        // Calculate score
        const score = calculateScore(crimeData, data311, violationData);
        console.log('Calculated score:', score);
        
        const noiseCount = data311.filter(req => 
            req.service_name?.toLowerCase().includes('noise')
        ).length;
        
        // Store location data
        searchedLocations.push({
            location,
            score,
            data: {
                crime: crimeData,
                service311: data311,
                violations: violationData,
                noiseCount
            }
        });
        
        // Add marker to map
        addMarkerToMap(location, score, {
            crime: crimeData,
            service311: data311,
            violations: violationData,
            noiseCount
        });
        
        // Update search history
        updateSearchHistory();
        
        showMessage(`✅ Location added! Score: ${Math.round(score)}/100 - ${getScoreLabel(score)}`, 'success');
        
    } catch (error) {
        console.error('Search error:', error);
        showMessage('❌ Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
        document.getElementById('searchBtn').disabled = false;
    }
}

function addMarkerToMap(location, score, data) {
    const color = getScoreColor(score);
    const label = getScoreLabel(score);
    
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
        ">${Math.round(score)}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker([location.lat, location.lon], {
        icon: markerIcon
    }).addTo(map);

    const popupContent = `
        <div class="popup-content">
            <div class="popup-header">
                <h3>${Math.round(score)}/100 - ${label}</h3>
                <p>${location.display_name.split(',').slice(0, 2).join(',')}</p>
            </div>
            <div class="popup-stats">
                <div class="popup-stat">
                    <div class="popup-stat-number">${data.crime.length}</div>
                    <div class="popup-stat-label">Crimes</div>
                </div>
                <div class="popup-stat">
                    <div class="popup-stat-number">${data.service311.length}</div>
                    <div class="popup-stat-label">311 Requests</div>
                </div>
                <div class="popup-stat">
                    <div class="popup-stat-number">${data.violations.length}</div>
                    <div class="popup-stat-label">Violations</div>
                </div>
                <div class="popup-stat">
                    <div class="popup-stat-number">${data.noiseCount}</div>
                    <div class="popup-stat-label">Noise Issues</div>
                </div>
            </div>
            <button class="popup-button" onclick="showLocationDetails(${searchedLocations.length - 1})">
                View Full Details
            </button>
        </div>
    `;

    marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
    });

    markers.push(marker);
    map.setView([location.lat, location.lon], 14);
}

function showLocationDetails(index) {
    const locationData = searchedLocations[index];
    currentLocation = locationData.location;
    
    displayResults(
        locationData.data.crime,
        locationData.data.service311,
        locationData.data.violations
    );
    
    switchView('details');
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-btn')[1].classList.add('active');
}

function updateSearchHistory() {
    if (searchedLocations.length === 0) {
        document.getElementById('searchHistory').classList.remove('active');
        return;
    }

    document.getElementById('searchHistory').classList.add('active');
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    searchedLocations.forEach((loc, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.onclick = () => showLocationDetails(index);

        const scoreClass = loc.score >= 85 ? 'score-excellent' :
                         loc.score >= 70 ? 'score-good' :
                         loc.score >= 50 ? 'score-fair' : 'score-poor';

        item.innerHTML = `
            <div class="history-location">${loc.location.display_name.split(',').slice(0, 2).join(',')}</div>
            <div class="history-score ${scoreClass}">${Math.round(loc.score)}</div>
        `;

        historyList.appendChild(item);
    });
}

function calculateScore(crimeData, data311, violationData) {
    const violentCrimeTypes = ['Aggravated Assault', 'Robbery', 'Rape', 'Homicide'];
    const violentCount = crimeData.filter(crime => 
        violentCrimeTypes.some(type => crime.text_general_code?.includes(type))
    ).length;
    
    const noiseCount = data311.filter(req => 
        req.service_name?.toLowerCase().includes('noise')
    ).length;
    
    const openViolations = violationData.filter(v => 
        v.casestatus?.toLowerCase().includes('open') || v.casestatus?.toLowerCase().includes('active')
    ).length;
    
    let score = 100;
    score -= (crimeData.length * 0.15);
    score -= (violentCount * 0.5);
    score -= (data311.length * 0.1);
    score -= (noiseCount * 0.3);
    score -= (violationData.length * 0.15);
    score -= (openViolations * 0.3);
    
    return Math.max(0, Math.min(100, score));
}

function displayResults(crimeData, data311, violationData) {
    document.getElementById('searchLocation').textContent = currentLocation.display_name;
    document.getElementById('coordinates').innerHTML = `<small>Lat: ${currentLocation.lat.toFixed(4)}, Lon: ${currentLocation.lon.toFixed(4)}</small>`;

    const violentCrimeTypes = ['Aggravated Assault', 'Robbery', 'Rape', 'Homicide'];
    const propertyCrimeTypes = ['Burglary', 'Theft', 'Motor Vehicle Theft', 'Arson'];
    
    const violentCount = crimeData.filter(crime => 
        violentCrimeTypes.some(type => crime.text_general_code?.includes(type))
    ).length;
    
    const propertyCount = crimeData.filter(crime => 
        propertyCrimeTypes.some(type => crime.text_general_code?.includes(type))
    ).length;

    document.getElementById('totalCrimes').textContent = crimeData.length;
    document.getElementById('violentCrimes').textContent = violentCount;
    document.getElementById('propertyCrimes').textContent = propertyCount;

    const crimeList = document.getElementById('crimeList');
    crimeList.innerHTML = '';
    
    if (crimeData.length === 0) {
        crimeList.innerHTML = '<p style="color: #666; padding: 15px;">✅ No recent crime data available for this area - this is good!</p>';
    } else {
        crimeData.slice(0, 10).forEach(crime => {
            const item = document.createElement('div');
            item.className = 'incident-item';
            item.innerHTML = `
                <strong>${crime.text_general_code || 'Unknown'}</strong>
                <small>${new Date(crime.dispatch_date_time).toLocaleDateString()}</small>
            `;
            crimeList.appendChild(item);
        });
    }

    const noiseCount = data311.filter(req => 
        req.service_name?.toLowerCase().includes('noise')
    ).length;
    
    const dumpingCount = data311.filter(req => 
        req.service_name?.toLowerCase().includes('dump')
    ).length;

    document.getElementById('total311').textContent = data311.length;
    document.getElementById('noiseComplaints').textContent = noiseCount;
    document.getElementById('illegalDumping').textContent = dumpingCount;

    const requestList = document.getElementById('requestList');
    requestList.innerHTML = '';
    
    if (data311.length === 0) {
        requestList.innerHTML = '<p style="color: #666; padding: 15px;">✅ No recent 311 requests for this area.</p>';
    } else {
        data311.slice(0, 10).forEach(request => {
            const item = document.createElement('div');
            item.className = 'incident-item';
            item.innerHTML = `
                <strong>${request.service_name || 'Unknown'}</strong>
                <small>${new Date(request.requested_datetime).toLocaleDateString()} - ${request.status || 'Unknown'}</small>
            `;
            requestList.appendChild(item);
        });
    }

    const openViolations = violationData.filter(v => 
        v.casestatus?.toLowerCase().includes('open') || v.casestatus?.toLowerCase().includes('active')
    ).length;

    document.getElementById('totalViolations').textContent = violationData.length;
    document.getElementById('openViolations').textContent = openViolations;

    const violationList = document.getElementById('violationList');
    violationList.innerHTML = '';
    
    if (violationData.length === 0) {
        violationList.innerHTML = '<p style="color: #666; padding: 15px;">✅ No recent violations for this area.</p>';
    } else {
        violationData.slice(0, 10).forEach(violation => {
            const item = document.createElement('div');
            item.className = 'incident-item';
            item.innerHTML = `
                <strong>${violation.violationdescription || 'Unknown'}</strong>
                <small>${violation.casedate ? new Date(violation.casedate).toLocaleDateString() : 'Unknown date'} - ${violation.casestatus || 'Unknown'}</small>
            `;
            violationList.appendChild(item);
        });
    }

    calculateOverallScore(crimeData.length, violentCount, data311.length, noiseCount, violationData.length, openViolations);
}

function calculateOverallScore(totalCrimes, violentCrimes, total311, noiseComplaints, totalViolations, openViolations) {
    let score = 100;
    
    score -= (totalCrimes * 0.15);
    score -= (violentCrimes * 0.5);
    score -= (total311 * 0.1);
    score -= (noiseComplaints * 0.3);
    score -= (totalViolations * 0.15);
    score -= (openViolations * 0.3);
    
    score = Math.max(0, Math.min(100, score));
    
    let scoreClass = 'score-poor';
    let scoreLabel = 'Poor';
    
    if (score >= 85) {
        scoreClass = 'score-excellent';
        scoreLabel = 'Excellent';
    } else if (score >= 70) {
        scoreClass = 'score-good';
        scoreLabel = 'Good';
    } else if (score >= 50) {
        scoreClass = 'score-fair';
        scoreLabel = 'Fair';
    }
    
    document.getElementById('overallScore').innerHTML = `
        <div class="score-badge ${scoreClass}">${score.toFixed(0)}/100 - ${scoreLabel}</div>
    `;
    
    let assessmentText = '<h3>Detailed Assessment</h3>';
    
    if (totalCrimes < 20) {
        assessmentText += '<p>✅ <strong>Low crime activity</strong> - This area shows minimal crime incidents.</p>';
    } else if (totalCrimes < 50) {
        assessmentText += '<p>⚠️ <strong>Moderate crime activity</strong> - Crime levels are typical for urban areas.</p>';
    } else {
        assessmentText += '<p>🚨 <strong>Higher crime activity</strong> - Exercise caution in this area.</p>';
    }

    if (violentCrimes === 0) {
        assessmentText += '<p>✅ <strong>No violent crimes</strong> in the past year.</p>';
    } else if (violentCrimes < 5) {
        assessmentText += '<p>⚠️ <strong>Few violent crimes</strong> reported in the past year.</p>';
    } else {
        assessmentText += '<p>🚨 <strong>Multiple violent crimes</strong> reported - consider this carefully.</p>';
    }

    if (noiseComplaints < 5) {
        assessmentText += '<p>✅ <strong>Quiet neighborhood</strong> - Few noise complaints filed.</p>';
    } else if (noiseComplaints < 15) {
        assessmentText += '<p>⚠️ <strong>Some noise issues</strong> - Typical for most urban areas.</p>';
    } else {
        assessmentText += '<p>🔊 <strong>Frequent noise complaints</strong> - May be noisier than average.</p>';
    }

    if (openViolations === 0) {
        assessmentText += '<p>✅ <strong>No open violations</strong> - Properties are well-maintained.</p>';
    } else if (openViolations < 5) {
        assessmentText += '<p>⚠️ <strong>Few open violations</strong> - Some maintenance issues.</p>';
    } else {
        assessmentText += '<p>🚨 <strong>Multiple open violations</strong> - Property maintenance concerns.</p>';
    }

    assessmentText += '<p style="margin-top: 15px; color: #666; font-size: 0.9em;"><em>Note: Assessment based on data within 0.5-mile radius from past 12 months.</em></p>';
    
    document.getElementById('assessment').innerHTML = assessmentText;
}

// Utility functions
function showLoading(show, text = 'Loading...') {
    const loading = document.getElementById('loadingSection');
    if (show) {
        loading.classList.add('active');
        document.getElementById('loadingText').textContent = text;
    } else {
        loading.classList.remove('active');
    }
}

function showMessage(message, type = 'info') {
    const section = document.getElementById('messageSection');
    const className = type === 'error' ? 'error-message' : 'success-message';
    
    section.innerHTML = `<div class="data-card"><div class="${className}">${message}</div></div>`;
    section.style.display = 'block';
    
    setTimeout(() => {
        section.style.display = 'none';
    }, 5000);
}

// Enter key support
document.getElementById('addressInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        searchArea();
    }
});

console.log('Philly Area Evaluator loaded successfully!');
console.log('API Base URL:', API_BASE_URL);
