# 🏠 Philly Nest

**Neighborhood Intelligence for Philadelphia**

A modern web application that helps you evaluate any Philadelphia neighborhood using real-time public data. Perfect for apartment hunters, home buyers, or anyone exploring where to live in Philly.

![Version](https://img.shields.io/badge/version-2.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-≥18-brightgreen.svg)

## ✨ Features

### 🎯 Comprehensive Scoring
- **Overall Livability Score** (0-100) combining multiple factors
- **Safety Score** - Crime incident analysis
- **Community Score** - 311 service request patterns  
- **Property Score** - Building violations and maintenance
- **Green Space Score** - Parks and recreation access

### 🗺️ Interactive Map
- Dark-themed CartoDB basemap
- Color-coded markers by score
- Click markers for quick stats
- Slide-out detail panel

### 📊 Deep Analysis
- Category breakdowns with visual bars
- Recent incident timeline
- Community issue breakdown (noise, dumping, maintenance)
- Data source transparency

### 💾 Smart Caching
- 1-hour cache for faster repeat queries
- Efficient API usage

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/philly-nest.git
cd philly-nest

# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## 📁 Project Structure

```
philly-nest/
├── server.js              # Express API server
├── package.json           # Dependencies
├── render.yaml            # Render deployment config
└── frontend/
    ├── index.html         # Main UI
    └── app.js             # Frontend logic
```

## 🔧 How It Works

### Data Pipeline

```
User enters address
        ↓
Geocode via OpenStreetMap
        ↓
Parallel API calls to Philadelphia Open Data:
  ├── Crime incidents (past 12 months)
  ├── 311 service requests (past 12 months)
  ├── Property violations (recent)
  └── Parks & recreation facilities
        ↓
Analysis engine scores each category
        ↓
Weighted average → Overall score
        ↓
Display on map + detail panel
```

### Scoring Algorithm

| Category | Weight | What It Measures |
|----------|--------|------------------|
| Safety | 35% | Crime volume, violent vs property crimes |
| Community | 25% | 311 complaints, noise issues, cleanliness |
| Property | 20% | Building violations, open vs closed cases |
| Green Space | 20% | Nearby parks, recreation facilities |

### Score Ranges

| Score | Label | Color | Meaning |
|-------|-------|-------|---------|
| 85-100 | Excellent | 🟢 Green | Strong across all metrics |
| 70-84 | Good | 🔵 Blue | Solid with minor concerns |
| 50-69 | Fair | 🟡 Amber | Typical urban challenges |
| 0-49 | Needs Work | 🔴 Red | Notable concerns |

## 🌐 API Endpoints

### `GET /api/health`
Health check and cache stats

### `GET /api/geocode?address=ADDRESS`
Convert address to coordinates

### `POST /api/crime-data`
```json
{
  "lat": 39.9526,
  "lon": -75.1652,
  "radius": 0.008,
  "startDate": "2024-02-01",
  "endDate": "2025-02-01"
}
```

### `POST /api/311-data`
Same parameters as crime data

### `POST /api/violations-data`
```json
{
  "lat": 39.9526,
  "lon": -75.1652,
  "radius": 0.008
}
```

### `POST /api/parks-data`
Same parameters as violations

## 🚀 Deployment

### Deploy to Render (Recommended - Free)

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. New → Web Service → Connect GitHub repo
4. It auto-detects `render.yaml` config
5. Deploy!

### Deploy to Railway

```bash
railway login
railway init
railway up
```

### Deploy to Heroku

```bash
heroku create philly-nest-yourname
git push heroku main
```

## 📊 Data Sources

All data from [OpenDataPhilly](https://opendataphilly.org/):

| Dataset | Table | Update Frequency |
|---------|-------|------------------|
| Crime Incidents | `incidents_part1_part2` | Daily |
| 311 Requests | `public_cases_fc` | Real-time |
| Violations | `violations` | Weekly |
| Parks | `ppr_facilities` | As needed |

## 🎨 Design Principles

- **Dark theme** - Easy on eyes, modern feel
- **Minimal UI** - Focus on data, not chrome
- **Typography** - Instrument Serif + DM Sans
- **Subtle textures** - Noise overlay for depth
- **Intentional color** - Scores drive the palette

## 🛠️ Development

```bash
# Run with auto-reload
npm run dev

# Test API
curl http://localhost:3000/api/health

# Test geocoding
curl "http://localhost:3000/api/geocode?address=City%20Hall"
```

## 🐛 Troubleshooting

### "Address not found"
- Make sure it's a Philadelphia address
- Try adding "Philadelphia, PA" to the search

### Empty data
- Philadelphia APIs may rate limit
- Wait a minute and retry
- Check browser console for errors

### Map not loading
- Check internet connection
- Ensure port 3000 is available

## 🗺️ Future Ideas

- [ ] School district ratings
- [ ] Transit score (SEPTA integration)
- [ ] Walk score calculation
- [ ] Save/compare locations
- [ ] Historical trend charts
- [ ] Neighborhood boundaries overlay
- [ ] Export PDF reports
- [ ] Mobile app

## 📝 License

MIT License - feel free to use and modify!

## 🙏 Credits

- **City of Philadelphia** - Open data
- **OpenStreetMap** - Geocoding
- **CARTO** - Map tiles & data hosting
- **Leaflet.js** - Map library

---

**Made with ❤️ for Philadelphia apartment hunters**

*Have questions? Open an issue!*
