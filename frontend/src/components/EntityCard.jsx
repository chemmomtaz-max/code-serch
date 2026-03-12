const PLATFORM_COLORS = {
  facebook:  { bg: '#1877f2', label: 'Facebook' },
  instagram: { bg: '#e1306c', label: 'Instagram' },
  tiktok:    { bg: '#000000', label: 'TikTok' },
  linkedin:  { bg: '#0a66c2', label: 'LinkedIn' },
  telegram:  { bg: '#0088cc', label: 'Telegram' },
  whatsapp:  { bg: '#25d366', label: 'WhatsApp' },
};

const PLATFORM_ICONS = {
  facebook:  '📘',
  instagram: '📸',
  tiktok:    '🎵',
  linkedin:  '💼',
  telegram:  '✈️',
  whatsapp:  '💬',
};

const EntityCard = ({ entity }) => {
  const { name, website, emails = [], phones = [], social_profiles = [], snippet } = entity;

  return (
    <div className="entity-card">
      {/* Name */}
      <div className="entity-name">
        {website ? (
          <a href={website} target="_blank" rel="noopener noreferrer" className="entity-name-link">
            {name}
          </a>
        ) : (
          <span>{name}</span>
        )}
      </div>

      {/* Website */}
      {website && (
        <div className="entity-row">
          <span className="entity-icon">🌐</span>
          <a href={website} target="_blank" rel="noopener noreferrer" className="entity-link">
            {website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
          </a>
        </div>
      )}

      {/* Emails */}
      {emails.map((email, i) => (
        <div className="entity-row" key={`e-${i}`}>
          <span className="entity-icon">📧</span>
          <a href={`mailto:${email}`} className="entity-link">{email}</a>
        </div>
      ))}

      {/* Phones */}
      {phones.map((phone, i) => (
        <div className="entity-row" key={`p-${i}`}>
          <span className="entity-icon">📞</span>
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="entity-link">{phone}</a>
        </div>
      ))}

      {/* Social profiles */}
      {social_profiles.length > 0 && (
        <div className="social-row">
          {social_profiles.map((profile, i) => {
            const cfg = PLATFORM_COLORS[profile.platform] || { bg: '#6366f1', label: profile.platform };
            const icon = PLATFORM_ICONS[profile.platform] || '🔗';
            return (
              <a
                key={i}
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-badge"
                style={{ background: cfg.bg }}
                title={`${cfg.label}: ${profile.url}`}
              >
                {icon} {cfg.label}
              </a>
            );
          })}
        </div>
      )}

      {/* Snippet */}
      {snippet && (
        <p className="entity-snippet">
          {snippet.length > 120 ? snippet.substring(0, 120) + '...' : snippet}
        </p>
      )}
    </div>
  );
};

export default EntityCard;
