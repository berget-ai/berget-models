import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  User, 
  Key, 
  TrendingUp, 
  CreditCard, 
  Calendar,
  Cpu,
  Copy,
  ExternalLink
} from 'lucide-react';

interface DashboardProps {
  username: string;
  onLogout: () => void;
}

const metricCards = [
  {
    title: 'Active API Keys',
    value: '0',
    subtitle: 'Current billing period',
    icon: Key,
    color: 'text-primary'
  },
  {
    title: 'Invoiced Total',
    value: '0.00 €',
    subtitle: 'Previous billing periods',
    icon: TrendingUp,
    color: 'text-accent'
  },
  {
    title: 'Monthly Cost',
    value: '0.00 €',
    subtitle: 'Current billing period',
    icon: CreditCard,
    color: 'text-secondary'
  },
  {
    title: 'Projected Cost',
    value: '0.00 €',
    subtitle: '0.00 € per day avg.',
    icon: Calendar,
    color: 'text-warning'
  }
];

const latestModels = [
  {
    name: 'openai/gpt-oss-120b',
    provider: 'OpenAI',
    releaseDate: '2025-08-05',
    features: ['Streaming support']
  },
  {
    name: 'mistralai/Devstral-Small-2505',
    provider: 'Mistral',
    releaseDate: '2025-05-22',
    features: ['Streaming support']
  },
  {
    name: 'Qwen/Qwen3-32B',
    provider: 'Qwen',
    releaseDate: '2025-04-29',
    features: ['Streaming support']
  }
];

export default function Dashboard({ username, onLogout }: DashboardProps) {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Top header */}
      <header className="h-16 border-b border-border/30 flex items-center justify-between px-6 bg-background">
        <div className="flex items-center space-x-4 flex-1">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models, deployments... ⌘ K"
              className="pl-10 bg-muted/30 border-border/50 focus:border-primary/50"
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Badge variant="outline" className="text-sm">
            {username}
          </Badge>
          <span className="text-sm text-muted-foreground">Administrator</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="h-8 w-8 p-0 rounded-full bg-muted/30 hover:bg-muted/50"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Welcome section */}
          <div>
            <h1 className="text-3xl font-medium tracking-tight">
              Welcome back, {username}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening with your AI infrastructure
            </p>
          </div>

          {/* Metrics cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.title} className="content-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        {metric.title}
                      </span>
                      <Icon className={`h-4 w-4 ${metric.color}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-semibold">
                        {metric.value}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {metric.subtitle}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Content sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Billing Period */}
            <Card className="content-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Current Billing Period
                  <Button variant="ghost" size="sm" className="text-primary">
                    View all
                  </Button>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Usage for active subscriptions
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No subscription data available
                </div>
              </CardContent>
            </Card>

            {/* Latest Models */}
            <Card className="content-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Latest Models
                  <Button variant="ghost" size="sm" className="text-primary">
                    View all
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {latestModels.map((model, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 rounded-lg border border-border/30 hover:bg-muted/20 transition-colors">
                      <div className="p-2 rounded-md bg-muted/30">
                        <Cpu className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {model.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {model.provider} • Released {model.releaseDate}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {model.features.join(', ')}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}