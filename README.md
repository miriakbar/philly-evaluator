# 🏘️ Philadelphia Area Evaluator

**Live Demo:** [Coming soon after you deploy!]

A web application that helps you evaluate residential areas in Philadelphia using real-time public data. Perfect for apartment hunting, neighborhood research, or just exploring the city!

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## ✨ Features

- 🗺️ **Interactive Map** - Visualize multiple locations with color-coded safety scores
- 🚨 **Crime Data** - Real-time crime statistics from Philadelphia Police Department
- 📞 **311 Complaints** - Service requests including noise complaints and maintenance issues
- 🏗️ **Property Violations** - Building code violations and inspection data
- 📊 **Smart Scoring** - AI-powered 0-100 safety score for each location
- 🔍 **Location Search** - Search by address or landmark
- 📱 **Mobile Friendly** - Works on desktop, tablet, and mobile
- ⚡ **Fast** - Cached data for instant results

## 🎯 Quick Start

### Prerequisites
- Node.js 18+ ([Download here](https://nodejs.org/))
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/YOUR_USERNAME/philly-evaluator.git
cd philly-evaluator
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Start the server**
```bash
npm start
```

4. **Open your browser**
```
http://localhost:3000
```

That's it! 🎉

## 📁 Project Structure

```
philly-evaluator-app/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json       # Backend dependencies
├── frontend/
│   ├── index.html         # Main HTML file
│   └── app.js             # Frontend JavaScript
├── docs/
│   └── DEPLOYMENT.md      # Deployment guide
└── README.md              # This file
```

## 🔧 How It Works

### Data Flow

```
User enters address
     ↓
Backend geocodes address (OpenStreetMap)
     ↓
Backend fetches data from Philadelphia APIs:
  ├── Crime incidents (phl.carto.com)
  ├── 311 service requests (phl.carto.com)
  └── Property violations (phl.carto.com)
     ↓
Backend calculates safety score (0-100)
     ↓
Frontend displays on map + detailed view
```

### Scoring Algorithm

```javascript
Base Score: 100 points

Deductions:
- Each crime: -0.15 points
- Each violent crime: -0.5 points (additional)
- Each 311 request: -0.1 points
- Each noise complaint: -0.3 points (additional)
- Each violation: -0.15 points
- Each open violation: -0.3 points (additional)

Final Score: 0-100 (capped)
```

### Score Interpretation
- **85-100** 🟢 Excellent - Very safe area
- **70-84** 🔵 Good - Above average safety
- **50-69** 🟡 Fair - Average for urban areas
- **0-49** 🔴 Poor - Exercise caution

## 📊 Data Sources

All data is public and updated regularly:

| Data Type | Source | Update Frequency |
|-----------|--------|------------------|
| Crime Incidents | Philadelphia Police Dept | Daily |
| 311 Requests | Philly311 | Real-time |
| Property Violations | L&I Department | Weekly |
| Geocoding | OpenStreetMap | Real-time |

**Data Coverage:**
- Crime: 2006 - Present
- 311: 2014 - Present
- Violations: 2010 - Present

## 🌐 API Endpoints

### `GET /api/health`
Health check endpoint
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T18:00:00.000Z",
  "cache_stats": {...}
}
```

### `GET /api/geocode?address=ADDRESS`
Convert address to coordinates
```json
{
  "lat": 39.9526,
  "lon": -75.1652,
  "display_name": "1500 Market St, Philadelphia..."
}
```

### `POST /api/crime-data`
Fetch crime data for location
```json
{
  "lat": 39.9526,
  "lon": -75.1652,
  "radius": 0.008,
  "startDate": "2025-01-01",
  "endDate": "2026-01-01"
}
```

## 🚀 Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions.

**Quick Deploy Options:**
- [Render](https://render.com) (Recommended - Free)
- [Railway](https://railway.app) (Free)
- [Vercel](https://vercel.com) (Free)
- [Heroku](https://heroku.com) ($7/month)

**Deploy in 2 minutes:**
```bash
# Using Render CLI
npm install -g render
render deploy
```

## 🧪 Testing

```bash
# Test backend API
curl http://localhost:3000/api/health

# Test geocoding
curl "http://localhost:3000/api/geocode?address=1500+Market+St"

# Test crime data (requires POST)
curl -X POST http://localhost:3000/api/crime-data \
  -H "Content-Type: application/json" \
  -d '{"lat":39.9526,"lon":-75.1652,"radius":0.008,"startDate":"2025-01-01","endDate":"2026-01-01"}'
```

## 🛠️ Configuration

### Environment Variables

Create `.env` file in backend directory:

```env
PORT=3000
NODE_ENV=production
CACHE_TTL=3600
```

### Cache Settings

Data is cached for 1 hour by default. To change:

```javascript
// In server.js
const cache = new NodeCache({ stdTTL: 7200 }); // 2 hours
```

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Roadmap

- [ ] User authentication
- [ ] Save favorite locations
- [ ] Email alerts for new incidents
- [ ] Historical trend charts
- [ ] School ratings integration
- [ ] Transit score (SEPTA data)
- [ ] Air quality data
- [ ] Mobile app (React Native)
- [ ] Export PDF reports
- [ ] Neighborhood comparison tool
- [ ] Community reviews

## 🐛 Known Issues

- **CORS Errors:** If you see CORS errors, make sure you're accessing the app through the backend (not opening index.html directly)
- **Empty Data:** Philadelphia APIs may rate limit. Try again in a few minutes.
- **Slow Initial Load:** First request may be slow due to cold start (free hosting)

## 📚 Resources

- [OpenDataPhilly](https://opendataphilly.org/) - Data source
- [Leaflet.js Docs](https://leafletjs.com/) - Mapping library
- [Express.js Docs](https://expressjs.com/) - Backend framework
- [Node.js Docs](https://nodejs.org/) - Runtime

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **City of Philadelphia** for providing open data
- **OpenStreetMap** for geocoding service
- **Leaflet.js** for mapping library
- **Carto** for hosting Philadelphia's data

## 📧 Contact

Have questions? Found a bug? Want to contribute?

- Create an [Issue](https://github.com/YOUR_USERNAME/philly-evaluator/issues)
- Email: your-email@example.com
- Twitter: [@yourhandle](https://twitter.com/yourhandle)

## 🌟 Star History

If you find this project useful, please consider giving it a star! ⭐

---

**Built with ❤️ for Philadelphia residents**

Made by [Your Name] | [GitHub](https://github.com/YOUR_USERNAME) | [Website](https://your-website.com)
