import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Check, 
  X, 
  Loader2, 
  Play, 
  RotateCcw,
  Settings,
  Zap,
  Minus,
  Circle,
  Info,
  Copy
} from 'lucide-react';
import { Model, TestResult, TestFeature, TestDetail } from '../types/model';
import { 
  fetchModels, 
  testToolUse, 
  testJsonSupport, 
  testBasicCompletion,
  testStreamingSupport,
  testMultimodal,
  testEmbedding,
  testReranking,
  testSpeechToText
} from '../services/bergetApi';
import { useToast } from '@/hooks/use-toast';

interface TestMatrixProps {
  apiKey: string;
  onLogout: () => void;
}

const TEST_FEATURES: TestFeature[] = [
  {
    id: 'basic',
    name: 'Basic Chat',
    description: 'Grundläggande chat completion',
    testFunction: testBasicCompletion,
    supportedTypes: ['chat']
  },
  {
    id: 'tools',
    name: 'Tool Use',
    description: 'Function calling/tools support',
    testFunction: testToolUse,
    supportedTypes: ['chat']
  },
  {
    id: 'json',
    name: 'JSON Mode',
    description: 'Strukturerad JSON output',
    testFunction: testJsonSupport,
    supportedTypes: ['chat']
  },
  {
    id: 'streaming',
    name: 'Streaming',
    description: 'Real-time streaming responses',
    testFunction: testStreamingSupport,
    supportedTypes: ['chat']
  },
  {
    id: 'multimodal',
    name: 'Multimodal',
    description: 'Bildanalys och vision',
    testFunction: testMultimodal,
    supportedTypes: ['chat']
  },
  {
    id: 'embedding',
    name: 'Embeddings',
    description: 'Text embeddings',
    testFunction: testEmbedding,
    supportedTypes: ['embedding']
  },
  {
    id: 'reranking',
    name: 'Reranking',
    description: 'Document reranking',
    testFunction: testReranking,
    supportedTypes: ['rerank']
  },
  {
    id: 'speech',
    name: 'Speech-to-Text',
    description: 'Audio transkription',
    testFunction: testSpeechToText,
    supportedTypes: ['speech-to-text']
  }
];

export default function TestMatrix({ apiKey, onLogout }: TestMatrixProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [popoverCloseCount, setPopoverCloseCount] = useState<Map<string, number>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    loadModels();
  }, [apiKey]);

  const loadModels = async () => {
    try {
      setIsLoadingModels(true);
      const modelData = await fetchModels(apiKey);
      setModels(modelData);
      toast({
        title: "Modeller laddade",
        description: `${modelData.length} modeller hämtade från Berget AI`,
      });
    } catch (error) {
      toast({
        title: "Fel vid laddning av modeller",
        description: error instanceof Error ? error.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setIsLoadingModels(false);
    }
  };

  const getTestKey = (modelId: string, featureId: string) => `${modelId}-${featureId}`;

  const runTest = async (model: Model, feature: TestFeature) => {
    const testKey = getTestKey(model.id, feature.id);
    
    setTestResults(prev => new Map(prev.set(testKey, {
      modelId: model.id,
      feature: feature.id,
      status: 'testing'
    })));

    const startTime = Date.now();
    
    try {
      const testDetail = await feature.testFunction(model, apiKey);
      const duration = Date.now() - startTime;
      
      setTestResults(prev => new Map(prev.set(testKey, {
        modelId: model.id,
        feature: feature.id,
        status: testDetail.success ? 'success' : 'error',
        message: testDetail.message,
        duration,
        curlCommand: testDetail.curlCommand,
        response: testDetail.response,
        errorCode: testDetail.errorCode
      })));
    } catch (error) {
      const duration = Date.now() - startTime;
      
      setTestResults(prev => new Map(prev.set(testKey, {
        modelId: model.id,
        feature: feature.id,
        status: 'error',
        message: error instanceof Error ? error.message : 'Okänt fel',
        duration
      })));
    }
  };

  const runSingleTest = async (model: Model, feature: TestFeature) => {
    await runTest(model, feature);
    toast({
      title: "Test slutfört",
      description: `${feature.name} test för ${model.id}`,
    });
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    
    for (const model of models) {
      const relevantFeatures = TEST_FEATURES.filter(feature => 
        feature.supportedTypes.includes(model.type || 'chat')
      );
      
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        // Kort paus mellan tester för att undvika rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsRunningTests(false);
    toast({
      title: "Alla tester slutförda",
      description: `Testade ${models.length} modeller med relevanta funktioner`,
    });
  };

  const clearResults = () => {
    setTestResults(new Map());
    setPopoverCloseCount(new Map());
    toast({
      title: "Resultat rensade",
      description: "Alla testresultat har rensats",
    });
  };

  const handlePopoverClose = async (model: Model, feature: TestFeature) => {
    const testKey = getTestKey(model.id, feature.id);
    const currentCount = popoverCloseCount.get(testKey) || 0;
    const newCount = currentCount + 1;
    
    setPopoverCloseCount(prev => new Map(prev.set(testKey, newCount)));
    
    if (newCount === 2) {
      // Reset counter and set status to testing immediately
      setPopoverCloseCount(prev => new Map(prev.set(testKey, 0)));
      
      // Update status to testing to show loader icon
      setTestResults(prev => new Map(prev.set(testKey, {
        modelId: model.id,
        feature: feature.id,
        status: 'testing'
      })));
      
      toast({
        title: "Försöker igen",
        description: `Kör om test för ${feature.name} på ${model.id}`,
      });
      
      await runTest(model, feature);
    }
  };

  const getStatusIcon = (testKey: string) => {
    const result = testResults.get(testKey);
    
    switch (result?.status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin text-warning" />;
      case 'success':
        return <Check className="h-4 w-4 text-success" />;
      case 'error':
        return <X className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Kopierat!",
        description: "Kommandot har kopierats till urklipp",
      });
    });
  };

  const getSuccessRate = () => {
    const total = testResults.size;
    const successful = Array.from(testResults.values()).filter(r => r.status === 'success').length;
    return total > 0 ? Math.round((successful / total) * 100) : 0;
  };

  if (isLoadingModels) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <Card className="p-8 text-center border-border/50 bg-card/50 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Laddar modeller från Berget AI...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Berget AI Testmatris
                </CardTitle>
                <p className="text-muted-foreground mt-2">
                  Testa {models.length} modeller med {TEST_FEATURES.length} olika funktioner
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-sm">
                  Framgångsgrad: {getSuccessRate()}%
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLogout}
                  className="border-border/50"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Ändra API-nyckel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                onClick={runAllTests}
                disabled={isRunningTests}
                className="bg-primary hover:bg-primary/90"
              >
                {isRunningTests ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isRunningTests ? 'Kör tester...' : 'Kör alla tester'}
              </Button>
              <Button
                variant="outline"
                onClick={clearResults}
                disabled={isRunningTests || testResults.size === 0}
                className="border-border/50"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Rensa resultat
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Matrix */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-card border-b border-border/50 shadow-sm">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-semibold text-foreground min-w-[200px] bg-card sticky left-0 z-30 border-r border-border/30">
                      Modell
                    </TableHead>
                    {TEST_FEATURES.map((feature) => (
                      <TableHead key={feature.id} className="text-center min-w-[120px] bg-card">
                        <div className="flex flex-col items-center space-y-1">
                          <span className="font-semibold text-foreground">{feature.name}</span>
                          <span className="text-xs text-muted-foreground">{feature.description}</span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => (
                    <TableRow 
                      key={model.id} 
                      className="border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium sticky left-0 z-20 bg-card border-r border-border/30">
                        <div className="flex items-center space-x-2">
                          <Zap className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-semibold text-foreground">{model.id}</div>
                            <div className="text-xs text-muted-foreground">
                              {model.owned_by} • {model.type}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {TEST_FEATURES.map((feature) => {
                        const isSupported = feature.supportedTypes.includes(model.type || 'chat');
                        const testKey = getTestKey(model.id, feature.id);
                        const result = testResults.get(testKey);
                        
                        return (
                          <TableCell key={feature.id} className="text-center">
                            {isSupported ? (
                              result && (result.status === 'success' || result.status === 'error') ? (
                                <Sheet onOpenChange={(open) => {
                                  if (!open) {
                                    handlePopoverClose(model, feature);
                                  }
                                }}>
                                  <SheetTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-muted/50"
                                    >
                                      {getStatusIcon(testKey)}
                                    </Button>
                                  </SheetTrigger>
                                  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                                    <SheetHeader>
                                      <div className="flex items-center justify-between">
                                        <SheetTitle>{feature.name} Test</SheetTitle>
                                         <div className="flex items-center gap-2">
                                           <Button
                                             variant="outline"
                                             size="sm"
                                             onClick={() => runSingleTest(model, feature)}
                                             disabled={testResults.get(testKey)?.status === 'testing'}
                                           >
                                            Försök igen
                                          </Button>
                                          <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                                            {result.status === 'success' ? 'Lyckades' : 'Misslyckades'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </SheetHeader>
                                    
                                    <div className="mt-6 space-y-4 overflow-y-auto">
                                      <div className="text-sm text-muted-foreground">
                                        <strong>Modell:</strong> {model.id}
                                      </div>
                                      
                                      {result.message && (
                                        <div className="text-sm">
                                          <strong>Meddelande:</strong> {result.message}
                                        </div>
                                      )}
                                      
                                      {result.duration && (
                                        <div className="text-sm text-muted-foreground">
                                          <strong>Tid:</strong> {result.duration}ms
                                        </div>
                                      )}
                                      
                                      {result.errorCode && (
                                        <div className="text-sm text-destructive">
                                          <strong>Felkod:</strong> {result.errorCode}
                                        </div>
                                      )}
                                      
                                      {result.curlCommand && (
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <strong className="text-sm">cURL kommando:</strong>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => copyToClipboard(result.curlCommand!)}
                                              className="h-6 px-2"
                                            >
                                              <Copy className="h-3 w-3" />
                                            </Button>
                                          </div>
                                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                            {result.curlCommand}
                                          </pre>
                                        </div>
                                      )}
                                      
                                      {result.response && (
                                        <div className="space-y-2">
                                          <strong className="text-sm">Svar:</strong>
                                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                                            {typeof result.response === 'string' 
                                              ? result.response 
                                              : JSON.stringify(result.response, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </SheetContent>
                                </Sheet>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => runTest(model, feature)}
                                  disabled={isRunningTests}
                                  className="h-8 w-8 p-0 hover:bg-muted/50"
                                >
                                  {getStatusIcon(testKey)}
                                </Button>
                              )
                            ) : (
                              <div className="h-8 w-8 flex items-center justify-center">
                                <Minus className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-center space-x-8 text-sm">
              <div className="flex items-center space-x-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Inte testad</span>
              </div>
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin text-warning" />
                <span className="text-muted-foreground">Testar...</span>
              </div>
              <div className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-success" />
                <span className="text-muted-foreground">Lyckades</span>
              </div>
              <div className="flex items-center space-x-2">
                <X className="h-4 w-4 text-destructive" />
                <span className="text-muted-foreground">Misslyckades</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}