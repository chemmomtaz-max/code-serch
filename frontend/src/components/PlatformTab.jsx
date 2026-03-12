const PlatformTab = ({ platform, data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <p>No actionable OSINT data found for <strong>{platform}</strong> matching the search criteria.</p>
      </div>
    );
  }

  return (
    <div className="results-grid">
      {data.map((item, index) => (
        <div className="result-card" key={index}>
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="result-title">
            {item.title || 'Untitled Result'}
          </a>
          <p className="result-snippet">
            {item.snippet ? (item.snippet.length > 150 ? item.snippet.substring(0, 150) + '...' : item.snippet) : 'No description available.'}
          </p>
          
          {(item.emails?.length > 0 || item.phones?.length > 0) && (
            <div className="contacts-box">
              {item.emails?.map((email, i) => (
                <div className="contact-item" key={`e-${i}`}>
                  <span className="contact-icon">📧</span>
                  <span>{email}</span>
                </div>
              ))}
              {item.phones?.map((phone, i) => (
                <div className="contact-item" key={`p-${i}`}>
                  <span className="contact-icon">📞</span>
                  <span>{phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PlatformTab;
