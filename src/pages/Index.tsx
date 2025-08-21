import { useState } from 'react';
import ApiKeyInput from '../components/ApiKeyInput';
import TestMatrix from '../components/TestMatrix';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';

const Index = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState('overview');

  const handleApiKeySubmit = async (key: string) => {
    setIsLoading(true);
    // Validate API key by trying to fetch models
    try {
      setApiKey(key);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setApiKey(null);
  };

  const handleSidebarItemClick = (item: string) => {
    setActiveView(item);
  };

  if (!apiKey) {
    return (
      <ApiKeyInput 
        onApiKeySubmit={handleApiKeySubmit} 
        isLoading={isLoading}
      />
    );
  }

  const renderMainContent = () => {
    switch (activeView) {
      case 'models':
        return (
          <TestMatrix 
            apiKey={apiKey} 
            onLogout={handleLogout}
          />
        );
      case 'overview':
      default:
        return (
          <Dashboard 
            username="Christian Stage 14"
            onLogout={handleLogout}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar 
        activeItem={activeView}
        onItemClick={handleSidebarItemClick}
      />
      {renderMainContent()}
    </div>
  );
};

export default Index;
