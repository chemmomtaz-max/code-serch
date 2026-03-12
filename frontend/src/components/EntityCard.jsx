const PLATFORM_COLORS = {
  facebook:  { bg: '#1877f2', label: 'Facebook' },
  instagram: { bg: '#e4405f', label: 'Instagram' },
  tiktok:    { bg: '#000000', label: 'TikTok' },
  linkedin:  { bg: '#0a66c2', label: 'LinkedIn' },
  telegram:  { bg: '#0088cc', label: 'Telegram' },
  whatsapp:  { bg: '#25d366', label: 'WhatsApp' },
  twitter:   { bg: '#1da1f2', label: 'Twitter' },
  x:         { bg: '#000000', label: 'X' }
};

const PLATFORM_ICONS = {
  facebook:  '📘',
  instagram: '📸',
  tiktok:    '🎵',
  linkedin:  '💼',
  telegram:  '✈️',
  whatsapp:  '💬',
  twitter:   '🐦',
};

const EntityCard = ({ entity }) => {
  const { name, website, emails = [], phones = [], social_profiles = [], snippet } = entity;

  return (
    <div className="result-card premium-card animated-fade-in">
      <div className="card-header">
        <span className="platform-icon">🏢</span>
        <div className="entity-name">
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" className="result-title">
              {name || 'Unknown Entity'}
            </a>
          ) : (
            <span className="result-title">{name || 'Unknown Entity'}</span>
          )}
        </div>
      </div>

      <p className="result-snippet">
        {snippet ? (snippet.length > 160 ? snippet.substring(0, 160) + '...' : snippet) : 'Comprehensive OSINT profile discovered.'}
      </p>

      {/* Contacts Section */}
      {(emails.length > 0 || phones.length > 0) && (
        <div className="contacts-container">
          {emails.slice(0, 3).map((email, i) => (
            <div className="contact-pill email" key={`e-${i}`}>
              <span className="icon">📧</span> {email}
            </div>
          ))}
          {phones.slice(0, 3).map((phone, i) => (
            <div className="contact-pill phone" key={`p-${i}`}>
              <span className="icon">📞</span> {phone}
            </div>
          ))}
        </div>
      )}

      {/* Social Profiles Grid */}
      {social_profiles.length > 0 && (
        <div className="social-row-premium">
          {social_profiles.map((profile, i) => {
            const cfg = PLATFORM_COLORS[profile.platform.toLowerCase()] || { bg: '#64748b', label: profile.platform };
            const icon = PLATFORM_ICONS[profile.platform.toLowerCase()] || '🔗';
            return (
              <a
                key={i}
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-badge-premium"
                style={{ backgroundColor: cfg.bg }}
                title={cfg.label}
              >
                {icon}
              </a>
            );
          })}
        </div>
      )}

      <div className="card-footer">
        {website && website.startsWith('http') && (
          <span className="link-text">
            {(() => { try { return new URL(website).hostname; } catch { return 'website'; } })()}
          </span>
        )}
        {!website && social_profiles[0] && (
          <span className="link-text">
            {(() => { try { return new URL(social_profiles[0].url).hostname; } catch { return 'social'; } })()}
          </span>
        )}
        <a href={website || (social_profiles[0]?.url)} target="_blank" rel="noopener noreferrer" className="visit-btn">Details ↗</a>
      </div>
    </div>
  );
};

export default EntityCard;
