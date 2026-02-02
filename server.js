const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
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
// Geocoding using Philadelphia's address data in Carto
// Uses the 'opa_properties_public' table which has addresses and coordinates
// ============================================

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
        
        // Clean up the address for searching
        // Remove "Philadelphia", "PA", zip codes, etc.
        let searchAddr = address
            .replace(/,?\s*(philadelphia|phila|philly|pa|pennsylvania|\d{5}(-\d{4})?)/gi, '')
            .replace(/[,]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
        
        console.log(`🔍 Searching for: "${searchAddr}"`);
        
        // Search in opa_properties_public table (has lat/lng for all Philadelphia properties)
        // This table contains all properties in Philadelphia with their coordinates
        const query = `
            SELECT 
                location as address,
                lat,
                lng,
                ST_Y(the_geom) as geom_lat,
                ST_X(the_geom) as geom_lng
            FROM opa_properties_public 
            WHERE UPPER(location) LIKE '%${searchAddr.replace(/'/g, "''")}%'
            AND the_geom IS NOT NULL
            LIMIT 1
        `;
        
        let rows = [];
        try {
            rows = await fetchPhillyData(query, 'geocode');
        } catch (e) {
            console.log('Primary geocode failed, trying street_centerline...');
        }
        
        // If no results, try a more flexible search
        if (rows.length === 0) {
            // Extract street number and name
            const parts = searchAddr.split(' ');
            const streetNum = parts[0];
            const streetName = parts.slice(1).join(' ');
            
            if (streetNum && streetName) {
                const flexQuery = `
                    SELECT 
                        location as address,
                        lat,
                        lng,
                        ST_Y(the_geom) as geom_lat,
                        ST_X(the_geom) as geom_lng
                    FROM opa_properties_public 
                    WHERE UPPER(location) LIKE '${streetNum} %${streetName.split(' ')[0]}%'
                    AND the_geom IS NOT NULL
                    LIMIT 1
                `;
                
                try {
                    rows = await fetchPhillyData(flexQuery, 'geocode (flexible)');
                } catch (e) {
                    console.log('Flexible geocode also failed');
                }
            }
        }
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                error: 'Address not found. Try format like "1234 MARKET ST"' 
            });
        }
        
        const row = rows[0];
        const lat = row.lat || row.geom_lat;
        const lng = row.lng || row.geom_lng;
        
        if (!lat || !lng) {
            return res.status(404).json({ error: 'Could not get coordinates for this address' });
        }
        
        const result = {
            lat: parseFloat(lat),
            lon: parseFloat(lng),
            display_name: `${row.address}, Philadelphia, PA`
        };
        
        cache.set(cacheKey, result);
        console.log(`📍 Found: ${result.display_name} (${result.lat}, ${result.lon})`);
        res.json(result);
        
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Crime Data
// ============================================

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

// ============================================
// 311 Service Requests
// ============================================

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

// ============================================
// Property Violations
// ============================================

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

// ============================================
// Parks & Recreation
// ============================================

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
            res.json({ rows: [], cached: false });
        }
        
    } catch (error) {
        console.error('Parks data error:', error);
        res.status(500).json({ error: error.message, rows: [] });
    }
});

// ============================================
// Health Check
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'Philly Nest API',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        note: 'Using Carto-based geocoding (no external APIs needed)'
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('💥 Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('🏠 ═══════════════════════════════════════');
    console.log('   PHILLY NEST - Neighborhood Intelligence');
    console.log('═══════════════════════════════════════════');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`💾 Cache TTL: 1 hour`);
    console.log('📊 Geocoding: Philadelphia OPA (via Carto)');
    console.log('═══════════════════════════════════════════');
    console.log('');
});
