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

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Helper function to make requests to Philadelphia APIs
async function fetchPhillyData(query) {
    const apiUrl = `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(query)}&format=json`;
    
    console.log('Fetching from Philly API:', query.substring(0, 100) + '...');
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
        console.error('Carto API Error:', data.error);
        throw new Error(`API error: ${Array.isArray(data.error) ? data.error[0] : data.error}`);
    }
    
    return data.rows || [];
}

// Geocoding endpoint
app.get('/api/geocode', async (req, res) => {
    try {
        const { address } = req.query;
        
        if (!address) {
            return res.status(400).json({ error: 'Address parameter required' });
        }
        
        // Check cache
        const cacheKey = `geocode_${address}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning cached geocoding result');
            return res.json(cached);
        }
        
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Philadelphia, PA')}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'PhillyAreaEvaluator/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error('Geocoding failed');
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }
        
        const result = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            display_name: data[0].display_name
        };
        
        // Cache result
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Crime data endpoint
// Table: incidents_part1_part2
// Lat/Lng must be extracted using ST_Y(the_geom) and ST_X(the_geom)
app.post('/api/crime-data', async (req, res) => {
    try {
        const { lat, lon, radius, startDate, endDate } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Check cache
        const cacheKey = `crime_${lat}_${lon}_${radius}_${startDate}_${endDate}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning cached crime data');
            return res.json({ rows: cached, cached: true });
        }
        
        // FIXED: Use ST_Y(the_geom) and ST_X(the_geom) to extract coordinates
        // and filter using those computed values
        const query = `
            SELECT text_general_code, dispatch_date_time, 
                   ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng 
            FROM incidents_part1_part2 
            WHERE dispatch_date_time >= '${startDate}' 
            AND dispatch_date_time <= '${endDate}'
            AND the_geom IS NOT NULL
            AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
            AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY dispatch_date_time DESC
            LIMIT 200
        `;
        
        const rows = await fetchPhillyData(query);
        
        // Cache result
        cache.set(cacheKey, rows);
        
        res.json({ rows, cached: false });
    } catch (error) {
        console.error('Crime data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 311 service requests endpoint
// Table: public_cases_fc
// Lat/Lng must be extracted using ST_Y(the_geom) and ST_X(the_geom)
app.post('/api/311-data', async (req, res) => {
    try {
        const { lat, lon, radius, startDate, endDate } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Check cache
        const cacheKey = `311_${lat}_${lon}_${radius}_${startDate}_${endDate}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning cached 311 data');
            return res.json({ rows: cached, cached: true });
        }
        
        // FIXED: Use ST_Y(the_geom) and ST_X(the_geom) to extract coordinates
        const query = `
            SELECT service_name, requested_datetime, status, 
                   ST_Y(the_geom) AS lat, ST_X(the_geom) AS lon 
            FROM public_cases_fc 
            WHERE requested_datetime >= '${startDate}' 
            AND requested_datetime <= '${endDate}'
            AND the_geom IS NOT NULL
            AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
            AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY requested_datetime DESC
            LIMIT 200
        `;
        
        const rows = await fetchPhillyData(query);
        
        // Cache result
        cache.set(cacheKey, rows);
        
        res.json({ rows, cached: false });
    } catch (error) {
        console.error('311 data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Violations endpoint
// FIXED: Table name is 'violations' (not 'li_violations')
// FIXED: Date column is 'violationdate' (not 'casedate')
// FIXED: Status column is 'violationstatus' 
// FIXED: Use ST_Y(the_geom) and ST_X(the_geom) to extract coordinates
app.post('/api/violations-data', async (req, res) => {
    try {
        const { lat, lon, radius } = req.body;
        
        if (!lat || !lon || !radius) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Check cache
        const cacheKey = `violations_${lat}_${lon}_${radius}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('Returning cached violations data');
            return res.json({ rows: cached, cached: true });
        }
        
        // FIXED: Correct table name and column names
        // Table: violations
        // Date: violationdate
        // Description: violationcodetitle or violationdescription
        // Status: violationstatus
        const query = `
            SELECT violationcodetitle AS violationdescription, 
                   violationdate AS casedate, 
                   violationstatus AS casestatus,
                   ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng
            FROM violations
            WHERE the_geom IS NOT NULL
            AND violationdate >= '2024-01-01'
            AND ST_Y(the_geom) BETWEEN ${lat - radius} AND ${lat + radius}
            AND ST_X(the_geom) BETWEEN ${lon - radius} AND ${lon + radius}
            ORDER BY violationdate DESC
            LIMIT 100
        `;
        
        const rows = await fetchPhillyData(query);
        
        // Cache result
        cache.set(cacheKey, rows);
        
        res.json({ rows, cached: false });
    } catch (error) {
        console.error('Violations data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cache_stats: cache.getStats()
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Philly Area Evaluator server running on port ${PORT}`);
    console.log(`📍 Open http://localhost:${PORT} in your browser`);
    console.log(`💾 Cache TTL: 1 hour`);
});
