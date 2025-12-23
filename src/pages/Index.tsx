import { useState } from 'react';
import ApiKeyInput from '../components/ApiKeyInput';
import TestMatrix from '../components/TestMatrix';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export const API_ENDPOINTS = {
  production: 'https://api.berget.ai/v1',
  staging: 'https://api.stage.berget.ai/v1'
} as const;

export type ApiEndpoint = keyof typeof API_ENDPOINTS;

const Index = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useStaging, setUseStaging] = useState(false);

  const baseUrl = useStaging ? API_ENDPOINTS.staging : API_ENDPOINTS.production;

  const handleApiKeySubmit = async (key: string) => {
    setIsLoading(true);
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
        useStaging={useStaging}
        onStagingChange={setUseStaging}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2">
        <Label htmlFor="staging-switch" className="text-sm font-medium">
          {useStaging ? 'Staging' : 'Production'}
        </Label>
        <Switch
          id="staging-switch"
          checked={useStaging}
          onCheckedChange={setUseStaging}
        />
      </div>
      <TestMatrix 
        apiKey={apiKey} 
        onLogout={handleLogout}
        baseUrl={baseUrl}
      />
    </div>
  );
};

export default Index;
