const PLATFORM_THEMES = {
  Facebook: { icon: '📘', color: '#1877f2' },
  Instagram: { icon: '📸', color: '#e4405f' },
  TikTok: { icon: '🎵', color: '#00f2ea' },
  LinkedIn: { icon: '💼', color: '#0a66c2' },
  Twitter: { icon: '🐦', color: '#1da1f2' },
  Telegram: { icon: '✈️', color: '#0088cc' },
  WhatsApp: { icon: '💬', color: '#25d366' },
  Web: { icon: '🌐', color: '#64748b' }
};

const PlatformTab = ({ platform, data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <p>No verified results found for <strong>{platform}</strong>.</p>
      </div>
    );
  }

  const theme = PLATFORM_THEMES[platform] || PLATFORM_THEMES.Web;

  return (
    <div className="results-grid animated-fade-in">
      {data.map((item, index) => (
        <div className="result-card premium-card" key={index} style={{ borderTop: `4px solid ${theme.color}` }}>
          <div className="card-header">
            <span className="platform-icon">{theme.icon}</span>
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="result-title">
              {item.title || 'Official Profile'}
            </a>
          </div>
          
          <p className="result-snippet">
            {item.snippet ? (item.snippet.length > 180 ? item.snippet.substring(0, 180) + '...' : item.snippet) : 'View full profile for details.'}
          </p>
          
          {(item.emails?.length > 0 || item.phones?.length > 0) && (
            <div className="contacts-container">
              {item.emails?.map((email, i) => (
                <div className="contact-pill email" key={`e-${i}`}>
                  <span className="icon">📧</span> {email}
                </div>
              ))}
              {item.phones?.map((phone, i) => (
                <div className="contact-pill phone" key={`p-${i}`}>
                  <span className="icon">📞</span> {phone}
                </div>
              ))}
            </div>
          )}
          
          <div className="card-footer">
             <span className="link-text">{new URL(item.link).hostname}</span>
             <a href={item.link} target="_blank" rel="noopener noreferrer" className="visit-btn">Visit Link ↗</a>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlatformTab;
