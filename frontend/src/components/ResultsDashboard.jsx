import { useState } from 'react';
import PlatformTab from './PlatformTab';

const ResultsDashboard = ({ results }) => {
  const platforms = Object.keys(results);
  const [activeTab, setActiveTab] = useState(platforms[0] || '');

  if (!platforms.length) {
    return <div className="empty-state">No results found for any platform.</div>;
  }

  return (
    <div>
      <div className="tabs-container">
        {platforms.map(platform => (
          <button
            key={platform}
            className={`tab-btn ${activeTab === platform ? `active ${platform.toLowerCase()}` : ''}`}
            onClick={() => setActiveTab(platform)}
          >
            {platform.charAt(0).toUpperCase() + platform.slice(1)} 
            <span style={{opacity: 0.7, fontSize: '0.75rem', marginLeft: '4px'}}>
              ({results[platform]?.length || 0})
            </span>
          </button>
        ))}
      </div>

      <div className="tab-content">
        <PlatformTab platform={activeTab} data={results[activeTab]} />
      </div>
    </div>
  );
};

export default ResultsDashboard;
