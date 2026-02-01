const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} | ${req.method} ${req.path}`);
    next();
});

// ============================================
// Philadelphia Carto API Helper
// ============================================

async function fetchPhillyData(query, description = 'data') {
    const apiUrl = `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(query)}&format=json`;
    
    console.log(`📊 Fetching ${description}...`);
    
    try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error (${response.status}):`, errorText.substring(0, 200));
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            console.error('❌ Carto Error:', data.error);
            throw new Error(`Carto error: ${Array.isArray(data.error) ? data.error[0] : data.error}`);
        }
        
        console.log(`✅ Retrieved ${data.rows?.length || 0} ${description} records`);
        return data.rows || [];
        
    } catch (error) {
        console.error(`❌ Fetch error for ${description}:`, error.message);
        throw error;
    }
}

// ============================================
// API Endpoints
// ============================================

// Geocoding (OpenStreetMap Nominatim)
app.get('/api/geocode', async (req, res) => {
    try {
        const { address } = req.query;
        
        if (!address) {
            return res.status(400).json({ error: 'Address parameter required' });
        }
        
        const cacheKey = `geocode_${address.toLowerCase().trim()}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('📍 Returning cached geocode');
            return res.json(cached);
        }
        
        const searchAddress = address.toLowerCase().includes('philadelphia') 
            ? address 
            : `${address}, Philadelphia, PA`;
            
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PhillyNest/2.0 (Neighborhood Analysis Tool)' }
        });
        
        if (!response.ok) {
            throw new Error('Geocoding service unavailable');
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Address not found. Try a Philadelphia address.' });
        }
        
        const result = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            display_name: data[0].display_name
        };
        
        // Verify it's in Philadelphia area (rough bounds)
        if (result.lat < 39.85 || result.lat > 40.15 || result.lon < -75.35 || result.lon > -74.9) {
            return res.status(400).json({ error: 'Address must be within Philadelphia area' });
        }
        
        cache.set(cacheKey, result);
        console.log(`📍 Geocoded: ${result.display_name.substring(0, 50)}...`);
        res.json(result);
        
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Crime Data (incidents_part1_part2)
app.post('/api/crime-data', async (req, res) => {
    try {
        const { lat, lon, radius, startDate, endDate } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const cacheKey = `crime_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}_${startDate}_${endDate}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ rows: cached, cached: true });
        }
        
        // Use ST_Y/ST_X to extract coordinates from geometry
        const query = `
            SELECT 
                text_general_code, 
                dispatch_date_time,
                ST_Y(the_geom) AS lat, 
                ST_X(the_geom) AS lng
            FROM incidents_part1_part2 
            WHERE dispatch_date_time >= '${startDate}' 
                AND dispatch_date_time <= '${endDate}'
                AND the_geom IS NOT NULL
                AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
                AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY dispatch_date_time DESC
            LIMIT 200
        `;
        
        const rows = await fetchPhillyData(query, 'crime incidents');
        cache.set(cacheKey, rows);
        res.json({ rows, cached: false });
        
    } catch (error) {
        console.error('Crime data error:', error);
        res.status(500).json({ error: error.message, rows: [] });
    }
});

// 311 Service Requests (public_cases_fc)
app.post('/api/311-data', async (req, res) => {
    try {
        const { lat, lon, radius, startDate, endDate } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const cacheKey = `311_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}_${startDate}_${endDate}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ rows: cached, cached: true });
        }
        
        const query = `
            SELECT 
                service_name, 
                requested_datetime, 
                status,
                ST_Y(the_geom) AS lat, 
                ST_X(the_geom) AS lon
            FROM public_cases_fc 
            WHERE requested_datetime >= '${startDate}' 
                AND requested_datetime <= '${endDate}'
                AND the_geom IS NOT NULL
                AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
                AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY requested_datetime DESC
            LIMIT 200
        `;
        
        const rows = await fetchPhillyData(query, '311 requests');
        cache.set(cacheKey, rows);
        res.json({ rows, cached: false });
        
    } catch (error) {
        console.error('311 data error:', error);
        res.status(500).json({ error: error.message, rows: [] });
    }
});

// Property Violations (violations)
app.post('/api/violations-data', async (req, res) => {
    try {
        const { lat, lon, radius } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const cacheKey = `violations_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ rows: cached, cached: true });
        }
        
        // Table: violations
        // Columns: violationcodetitle, violationdate, violationstatus
        const query = `
            SELECT 
                violationcodetitle AS violationdescription,
                violationdate AS casedate,
                violationstatus AS casestatus,
                ST_Y(the_geom) AS lat, 
                ST_X(the_geom) AS lng
            FROM violations
            WHERE the_geom IS NOT NULL
                AND violationdate >= '2024-01-01'
                AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
                AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY violationdate DESC
            LIMIT 100
        `;
        
        const rows = await fetchPhillyData(query, 'violations');
        cache.set(cacheKey, rows);
        res.json({ rows, cached: false });
        
    } catch (error) {
        console.error('Violations data error:', error);
        res.status(500).json({ error: error.message, rows: [] });
    }
});

// Parks & Recreation Sites (ppr_facilities)
app.post('/api/parks-data', async (req, res) => {
    try {
        const { lat, lon, radius } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const cacheKey = `parks_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ rows: cached, cached: true });
        }
        
        // Try ppr_facilities table for parks/rec centers
        const query = `
            SELECT 
                asset_name,
                site_type,
                ST_Y(the_geom) AS lat, 
                ST_X(the_geom) AS lng
            FROM ppr_facilities
            WHERE the_geom IS NOT NULL
                AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
                AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            LIMIT 50
        `;
        
        try {
            const rows = await fetchPhillyData(query, 'parks/recreation');
            cache.set(cacheKey, rows);
            res.json({ rows, cached: false });
        } catch (e) {
            // If ppr_facilities doesn't work, return empty
            console.log('Parks API unavailable, returning empty');
            res.json({ rows: [], cached: false });
        }
        
    } catch (error) {
        console.error('Parks data error:', error);
        res.status(500).json({ error: error.message, rows: [] });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'Philly Nest API',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        cache: {
            keys: cache.keys().length,
            stats: cache.getStats()
        }
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('🏠 ═══════════════════════════════════════');
    console.log('   PHILLY NEST - Neighborhood Intelligence');
    console.log('═══════════════════════════════════════════');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`💾 Cache TTL: 1 hour`);
    console.log('📊 Data: Philadelphia Open Data (Carto)');
    console.log('═══════════════════════════════════════════');
    console.log('');
});
