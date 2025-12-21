import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Key, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface ApiKeyInputProps {
  onApiKeySubmit: (apiKey: string) => void;
  isLoading?: boolean;
  useStaging: boolean;
  onStagingChange: (value: boolean) => void;
}

export default function ApiKeyInput({ onApiKeySubmit, isLoading, useStaging, onStagingChange }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Load API key from localStorage on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('berget-ai-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      // Save API key to localStorage
      localStorage.setItem('berget-ai-api-key', apiKey.trim());
      onApiKeySubmit(apiKey.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted">
      <Card className="w-full max-w-md border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
              <Key className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Berget AI Testmatris
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Ange din API-nyckel för att börja testa modeller
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-center gap-2">
                <Label htmlFor="staging-switch" className="text-sm font-medium">
                  Miljö:
                </Label>
                <Badge variant={useStaging ? "secondary" : "default"}>
                  {useStaging ? 'Staging' : 'Production'}
                </Badge>
              </div>
              <Switch
                id="staging-switch"
                checked={useStaging}
                onCheckedChange={onStagingChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-sm font-medium">
                API Nyckel
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="Ange din Berget AI API nyckel..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 bg-background/50 border-border/50 transition-all duration-200 focus:border-primary/50 focus:ring-primary/20"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                  disabled={isLoading}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 shadow-md hover:shadow-lg"
              disabled={!apiKey.trim() || isLoading}
            >
              {isLoading ? 'Laddar modeller...' : 'Starta tester'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}