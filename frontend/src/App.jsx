import { useState } from 'react';
import './index.css';
import EntityCard from './components/EntityCard';

const COUNTRIES = [
  "Worldwide", "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea (North)", "Korea (South)", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

function App() {
  const [keyword, setKeyword] = useState('');
  const [country, setCountry] = useState('Worldwide');
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword) return;
    setLoading(true);
    setError(null);
    const searchCountry = country === 'Worldwide' ? '' : country;

    try {
      // Use relative path for Vercel production, absolute for local dev
      const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:8000/api/search' 
        : '/api/search';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, country: searchCountry }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setEntities(data);
      } else {
        setError(`Search request failed: ${data.detail || JSON.stringify(data)}`);
      }
    } catch (err) {
      setError(`Could not connect to backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>OmniSearch OSINT</h1>
        <p>Comprehensive keyword & country search — organized by entity</p>
      </header>

      <div className="search-card">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="input-group">
            <label>Keyword / Company Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Momtazchem, Acme Corp, John Doe"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
            />
          </div>
          <div className="input-group" style={{ maxWidth: '260px' }}>
            <label>Country</label>
            <select
              className="input-field"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              {COUNTRIES.map(c => (
                <option key={c} value={c} style={{ background: '#0f172a', color: 'white' }}>{c}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? <span className="loader"></span> : '🔍 Deep Search'}
          </button>
        </form>
      </div>

      {error && (
        <div className="empty-state" style={{ borderColor: '#dc2626', color: '#fca5a5' }}>
          ⚠️ {error}
        </div>
      )}

      {entities && !loading && (
        <div>
          <p className="results-count">{entities.length} entities found</p>
          <div className="entities-grid">
            {entities.length === 0 ? (
              <div className="empty-state">No results found for this keyword and country.</div>
            ) : (
              entities.map((entity, idx) => <EntityCard key={idx} entity={entity} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
