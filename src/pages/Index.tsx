import { useState } from 'react';
import ApiKeyInput from '../components/ApiKeyInput';
import TestMatrix from '../components/TestMatrix';

const Index = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  if (!apiKey) {
    return (
      <ApiKeyInput 
        onApiKeySubmit={handleApiKeySubmit} 
        isLoading={isLoading}
      />
    );
  }

  return (
    <TestMatrix 
      apiKey={apiKey} 
      onLogout={handleLogout}
    />
  );
};

export default Index;
