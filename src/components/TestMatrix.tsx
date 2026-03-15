import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  Minus,
  Circle,
  Info,
  Copy
} from 'lucide-react';
import { Model, TestResult, TestFeature, TestDetail, SubResult } from '../types/model';
import { 
  fetchModels, 
  testToolUse,
  testToolUseMultiParam,
  testToolUseMultiTool,
  testToolUseComplexSchema,
  testToolUseParallel,
  testJsonSupport,
  testJsonSchema, 
  testBasicCompletion,
  testStreamingSupport,
  testMultimodal,
  testOCR,
  testEmbedding,
  testReranking,
  testSpeechToText,
  testTPS,
  testLongContextJson
} from '../services/bergetApi';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TestMatrixProps {
  apiKey: string;
  onLogout: () => void;
  baseUrl: string;
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
    description: 'Grundläggande function calling (1 tool, 1 param)',
    testFunction: testToolUse,
    supportedTypes: ['chat']
  },
  {
    id: 'tools_multi_param',
    name: 'Tools: Multi-Param',
    description: 'Tool med flera params, enums och optional fields',
    testFunction: testToolUseMultiParam,
    supportedTypes: ['chat']
  },
  {
    id: 'tools_multi_tool',
    name: 'Tools: Rätt val',
    description: 'Välja rätt tool bland 3 alternativ',
    testFunction: testToolUseMultiTool,
    supportedTypes: ['chat']
  },
  {
    id: 'tools_complex',
    name: 'Tools: Komplex',
    description: 'Nested objects, arrays och komplex schema',
    testFunction: testToolUseComplexSchema,
    supportedTypes: ['chat']
  },
  {
    id: 'tools_parallel',
    name: 'Tools: Parallel',
    description: 'Anropa 3 tools samtidigt i ett svar',
    testFunction: testToolUseParallel,
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
    id: 'json_schema',
    name: 'JSON Schema',
    description: 'Strict schema validation',
    testFunction: testJsonSchema,
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
    id: 'tps',
    name: 'TPS Test',
    description: 'Tokens per sekund (längre svar)',
    testFunction: testTPS,
    supportedTypes: ['chat']
  },
  {
    id: 'long_context_json',
    name: 'Long Context + JSON',
    description: 'Lång transkribering (~8k tokens) med JSON output',
    testFunction: testLongContextJson,
    supportedTypes: ['chat']
  },
  {
    id: 'ocr',
    name: 'OCR',
    description: 'Text/tabell-extraktion (vision eller docling)',
    testFunction: testOCR,
    supportedTypes: ['ocr']
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

export default function TestMatrix({ apiKey, onLogout, baseUrl }: TestMatrixProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [popoverCloseCount, setPopoverCloseCount] = useState<Map<string, number>>(new Map());
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadModels();
  }, [apiKey, baseUrl]);

  const loadModels = async () => {
    try {
      setIsLoadingModels(true);
      const modelData = await fetchModels(apiKey, baseUrl);
      setModels(modelData);
      toast({
        title: "Modeller laddade",
        description: `${modelData.length} modeller hämtade från ${baseUrl.includes('stage') ? 'Staging' : 'Production'}`,
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
      const testDetail = await feature.testFunction(model, apiKey, baseUrl);
      const duration = Date.now() - startTime;
      
      setTestResults(prev => new Map(prev.set(testKey, {
        modelId: model.id,
        feature: feature.id,
        status: testDetail.success ? 'success' : 'error',
        message: testDetail.message,
        duration,
        curlCommand: testDetail.curlCommand,
        response: testDetail.response,
        errorCode: testDetail.errorCode,
        tokensPerSecond: testDetail.tokensPerSecond,
        subResults: testDetail.subResults
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
    const { chatModels, speechModels, ocrModels, utilityModels } = getModelsByType();
    const sortedChatModels = [...chatModels].sort((a, b) => a.id.localeCompare(b.id));
    const sortedSpeechModels = [...speechModels].sort((a, b) => a.id.localeCompare(b.id));
    const sortedOcrModels = [...ocrModels].sort((a, b) => a.id.localeCompare(b.id));
    const sortedUtilityModels = [...utilityModels].sort((a, b) => a.id.localeCompare(b.id));
    
    // Kör i samma ordning som på skärmen
    for (const model of sortedChatModels.filter(m => m.isUp !== false)) {
      const relevantFeatures = getFeaturesForGroupType('chat');
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    for (const model of sortedSpeechModels.filter(m => m.isUp !== false)) {
      const relevantFeatures = getFeaturesForGroupType('speech-to-text');
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    for (const model of sortedOcrModels.filter(m => m.isUp !== false)) {
      const relevantFeatures = getFeaturesForGroupType('ocr');
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    for (const model of sortedUtilityModels.filter(m => m.isUp !== false)) {
      const relevantFeatures = getFeaturesForGroupType('utility');
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsRunningTests(false);
    toast({
      title: "Alla tester slutförda",
      description: `Testade ${models.length} modeller med relevanta funktioner`,
    });
  };

  const runGroupTests = async (groupType: 'chat' | 'speech-to-text' | 'utility' | 'ocr') => {
    setIsRunningTests(true);
    
    const groupModels = models.filter(model => {
      const modelType = model.type || 'chat';
      if (groupType === 'chat') return modelType === 'chat' || modelType === 'text';
      if (groupType === 'speech-to-text') return modelType === 'speech-to-text';
      if (groupType === 'utility') return modelType === 'rerank' || modelType === 'embedding';
      if (groupType === 'ocr') return modelType === 'ocr';
      return false;
    });

    // Sortera i samma ordning som på skärmen
    const sortedModels = [...groupModels].sort((a, b) => a.id.localeCompare(b.id));
    const relevantFeatures = getFeaturesForGroupType(groupType);

    for (const model of sortedModels.filter(m => m.isUp !== false)) {
      for (const feature of relevantFeatures) {
        await runTest(model, feature);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsRunningTests(false);
    toast({
      title: `${groupType === 'chat' ? 'Chat' : groupType === 'speech-to-text' ? 'Speech' : groupType === 'ocr' ? 'OCR' : 'Utility'} tester slutförda`,
      description: `Testade ${sortedModels.length} modeller`,
    });
  };

  // Kör alla tester för en specifik modell (rad)
  const runModelTests = async (model: Model, groupType: 'chat' | 'speech-to-text' | 'utility' | 'ocr') => {
    setIsRunningTests(true);
    const relevantFeatures = getFeaturesForGroupType(groupType);
    
    for (const feature of relevantFeatures) {
      await runTest(model, feature);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunningTests(false);
    toast({
      title: "Modelltest slutfört",
      description: `Alla tester för ${model.id} klara`,
    });
  };

  // Kör ett specifikt test för alla modeller i gruppen (kolumn)
  const runFeatureTests = async (feature: TestFeature, groupType: 'chat' | 'speech-to-text' | 'utility' | 'ocr') => {
    setIsRunningTests(true);
    
    const groupModels = models.filter(model => {
      const modelType = model.type || 'chat';
      if (groupType === 'chat') return modelType === 'chat' || modelType === 'text';
      if (groupType === 'speech-to-text') return modelType === 'speech-to-text';
      if (groupType === 'utility') return modelType === 'rerank' || modelType === 'embedding';
      if (groupType === 'ocr') return modelType === 'ocr';
      return false;
    });

    const sortedModels = [...groupModels].sort((a, b) => a.id.localeCompare(b.id));
    
    for (const model of sortedModels) {
      await runTest(model, feature);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunningTests(false);
    toast({
      title: `${feature.name} test slutfört`,
      description: `Testat ${sortedModels.length} modeller`,
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

  const getStatusIcon = (testKey: string, featureId?: string) => {
    const result = testResults.get(testKey);
    
    switch (result?.status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin text-warning" />;
      case 'success':
        // Show TPS value for TPS tests instead of checkmark
        if (featureId === 'tps' && result.tokensPerSecond !== undefined) {
          return (
            <span className="text-xs font-medium text-success whitespace-nowrap">
              {result.tokensPerSecond} t/s
            </span>
          );
        }
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

  const getModelsByType = () => {
    const chatModels = models.filter(m => {
      const type = m.type || 'chat';
      return type === 'chat' || type === 'text';
    });
    const speechModels = models.filter(m => m.type === 'speech-to-text');
    const ocrModels = models.filter(m => m.type === 'ocr');
    const utilityModels = models.filter(m => {
      const type = m.type;
      return type === 'rerank' || type === 'embedding';
    });
    
    return { chatModels, speechModels, ocrModels, utilityModels };
  };

  const getFeaturesForGroupType = (groupType: 'chat' | 'speech-to-text' | 'utility' | 'ocr') => {
    const typeMapping: Record<string, string[]> = {
      'chat': ['chat'],
      'speech-to-text': ['speech-to-text'],
      'ocr': ['ocr'],
      'utility': ['embedding', 'rerank']
    };
    const supportedTypes = typeMapping[groupType] || [];
    return TEST_FEATURES.filter(feature => 
      feature.supportedTypes.some(type => supportedTypes.includes(type))
    );
  };

  const renderModelGroup = (groupModels: Model[], groupName: string, groupType: 'chat' | 'speech-to-text' | 'utility' | 'ocr') => {
    if (groupModels.length === 0) return null;
    const relevantFeatures = getFeaturesForGroupType(groupType);

    return (
      <TableBody>
        {groupModels
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((model) => (
            <TableRow 
              key={model.id} 
              className={`border-border/30 transition-colors ${model.isUp === false ? 'opacity-40' : 'hover:bg-muted/30'}`}
            >
              <TableCell className="font-medium">
                <div className="flex items-center space-x-2">
                  {model.isUp !== false ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runModelTests(model, groupType)}
                      className="h-6 w-6 p-0 hover:bg-primary/20"
                      title={`Kör alla tester för ${model.id}`}
                    >
                      <Play className="h-3 w-3 text-primary" />
                    </Button>
                  ) : (
                    <div className="h-6 w-6 flex items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{model.id}</span>
                      {model.isUp === false && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30 text-muted-foreground">
                          offline
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {model.owned_by} • {model.type}
                    </div>
                  </div>
                </div>
              </TableCell>
              {relevantFeatures.map((feature) => {
                const testKey = getTestKey(model.id, feature.id);
                const result = testResults.get(testKey);
                
                return (
                  <TableCell key={feature.id} className="text-center">
                    {model.isUp === false ? (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    ) : result && (result.status === 'success' || result.status === 'error') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`${feature.id === 'tps' && result.status === 'success' ? 'h-8 px-2 min-w-[60px]' : 'h-8 w-8 p-0'} hover:bg-muted/50 cursor-pointer`}
                        onClick={() => {
                          setSelectedResult(result);
                          setIsDetailOpen(true);
                        }}
                      >
                        {getStatusIcon(testKey, feature.id)}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runTest(model, feature)}
                        className="h-8 w-8 p-0 hover:bg-muted/50"
                      >
                        {getStatusIcon(testKey, feature.id)}
                      </Button>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
      </TableBody>
    );
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
                className="bg-[hsl(40,30%,92%)] text-black hover:bg-[hsl(40,30%,85%)]"
              >
                <Play className="h-4 w-4 mr-2" />
                Kör alla tester
              </Button>
              <Button
                variant="outline"
                onClick={clearResults}
                disabled={testResults.size === 0}
                className="border-border/50"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Rensa resultat
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Matrix */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-6">
            <Accordion type="multiple" defaultValue={["chat", "speech", "ocr", "utility"]} className="space-y-4">
              {/* Chat Models */}
              {getModelsByType().chatModels.length > 0 && (
                <AccordionItem value="chat" className="border border-border/50 rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">Chat Modeller</h3>
                      <Badge variant="secondary">{getModelsByType().chatModels.length} modeller</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold text-foreground min-w-[200px] bg-card/90 border-r border-border/30">
                              <Button
                                size="sm"
                                onClick={() => runGroupTests('chat')}
                                className="gap-1 bg-[hsl(40,30%,92%)] text-black hover:bg-[hsl(40,30%,85%)]"
                              >
                                <Play className="h-4 w-4" />
                                Testa alla
                              </Button>
                            </TableHead>
                            {getFeaturesForGroupType('chat').map((feature) => (
                              <TableHead key={feature.id} className="text-center min-w-[120px] bg-card/90 border-r border-border/30 last:border-r-0">
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => runFeatureTests(feature, 'chat')}
                                      className="h-5 w-5 p-0 hover:bg-primary/20"
                                      title={`Kör ${feature.name} för alla modeller`}
                                    >
                                      <Play className="h-3 w-3 text-primary" />
                                    </Button>
                                    <span className="font-semibold text-foreground">{feature.name}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{feature.description}</span>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        {renderModelGroup(getModelsByType().chatModels, 'Chat', 'chat')}
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Speech Models */}
              {getModelsByType().speechModels.length > 0 && (
                <AccordionItem value="speech" className="border border-border/50 rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">Speech-to-Text Modeller</h3>
                      <Badge variant="secondary">{getModelsByType().speechModels.length} modeller</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold text-foreground min-w-[200px] bg-card/90 border-r border-border/30">
                              <Button
                                size="sm"
                                onClick={() => runGroupTests('speech-to-text')}
                                className="gap-1 bg-[hsl(40,30%,92%)] text-black hover:bg-[hsl(40,30%,85%)]"
                              >
                                <Play className="h-4 w-4" />
                                Testa alla
                              </Button>
                            </TableHead>
                            {getFeaturesForGroupType('speech-to-text').map((feature) => (
                              <TableHead key={feature.id} className="text-center min-w-[120px] bg-card/90 border-r border-border/30 last:border-r-0">
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => runFeatureTests(feature, 'speech-to-text')}
                                      className="h-5 w-5 p-0 hover:bg-primary/20"
                                      title={`Kör ${feature.name} för alla modeller`}
                                    >
                                      <Play className="h-3 w-3 text-primary" />
                                    </Button>
                                    <span className="font-semibold text-foreground">{feature.name}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{feature.description}</span>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        {renderModelGroup(getModelsByType().speechModels, 'Speech', 'speech-to-text')}
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* OCR Models */}
              {getModelsByType().ocrModels.length > 0 && (
                <AccordionItem value="ocr" className="border border-border/50 rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">OCR Modeller</h3>
                      <Badge variant="secondary">{getModelsByType().ocrModels.length} modeller</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold text-foreground min-w-[200px] bg-card/90 border-r border-border/30">
                              <Button
                                size="sm"
                                onClick={() => runGroupTests('ocr')}
                                className="gap-1 bg-[hsl(40,30%,92%)] text-black hover:bg-[hsl(40,30%,85%)]"
                              >
                                <Play className="h-4 w-4" />
                                Testa alla
                              </Button>
                            </TableHead>
                            {getFeaturesForGroupType('ocr').map((feature) => (
                              <TableHead key={feature.id} className="text-center min-w-[120px] bg-card/90 border-r border-border/30 last:border-r-0">
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => runFeatureTests(feature, 'ocr')}
                                      className="h-5 w-5 p-0 hover:bg-primary/20"
                                      title={`Kör ${feature.name} för alla modeller`}
                                    >
                                      <Play className="h-3 w-3 text-primary" />
                                    </Button>
                                    <span className="font-semibold text-foreground">{feature.name}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{feature.description}</span>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        {renderModelGroup(getModelsByType().ocrModels, 'OCR', 'ocr')}
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Utility Models */}
              {getModelsByType().utilityModels.length > 0 && (
                <AccordionItem value="utility" className="border border-border/50 rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">Utility Modeller (Rerank & Embedding)</h3>
                      <Badge variant="secondary">{getModelsByType().utilityModels.length} modeller</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold text-foreground min-w-[200px] bg-card/90 border-r border-border/30">
                              <Button
                                size="sm"
                                onClick={() => runGroupTests('utility')}
                                className="gap-1 bg-[hsl(40,30%,92%)] text-black hover:bg-[hsl(40,30%,85%)]"
                              >
                                <Play className="h-4 w-4" />
                                Testa alla
                              </Button>
                            </TableHead>
                            {getFeaturesForGroupType('utility').map((feature) => (
                              <TableHead key={feature.id} className="text-center min-w-[120px] bg-card/90 border-r border-border/30 last:border-r-0">
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => runFeatureTests(feature, 'utility')}
                                      className="h-5 w-5 p-0 hover:bg-primary/20"
                                      title={`Kör ${feature.name} för alla modeller`}
                                    >
                                      <Play className="h-3 w-3 text-primary" />
                                    </Button>
                                    <span className="font-semibold text-foreground">{feature.name}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{feature.description}</span>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        {renderModelGroup(getModelsByType().utilityModels, 'Utility', 'utility')}
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
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

      {/* Result Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedResult?.status === 'success' ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )}
              {selectedResult?.modelId} - {TEST_FEATURES.find(f => f.id === selectedResult?.feature)?.name}
            </SheetTitle>
          </SheetHeader>
          
          {selectedResult && (
            <div className="mt-6 space-y-6">
              {/* Status & Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={`font-semibold ${selectedResult.status === 'success' ? 'text-success' : 'text-destructive'}`}>
                    {selectedResult.status === 'success' ? 'Lyckades' : 'Misslyckades'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Tid</div>
                  <div className="font-semibold">{selectedResult.duration}ms</div>
                </div>
                {selectedResult.tokensPerSecond && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Tokens/sekund</div>
                    <div className="font-semibold">{selectedResult.tokensPerSecond} TPS</div>
                  </div>
                )}
                {selectedResult.errorCode && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Felkod</div>
                    <div className="font-semibold text-destructive">{selectedResult.errorCode}</div>
                  </div>
                )}
              </div>

              {/* Message */}
              {selectedResult.message && (
                <div>
                  <div className="text-sm font-medium mb-2">Meddelande</div>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    {selectedResult.message}
                  </div>
                </div>
              )}

              {/* Token Usage from Response */}
              {selectedResult.response?.usage && (
                <div>
                  <div className="text-sm font-medium mb-2">Token-användning</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <div className="text-xs text-muted-foreground">Input</div>
                      <div className="font-semibold">{selectedResult.response.usage.prompt_tokens}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <div className="text-xs text-muted-foreground">Output</div>
                      <div className="font-semibold">{selectedResult.response.usage.completion_tokens}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <div className="text-xs text-muted-foreground">Totalt</div>
                      <div className="font-semibold">{selectedResult.response.usage.total_tokens}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* cURL Command */}
              {selectedResult.curlCommand && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">cURL-kommando</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(selectedResult.curlCommand || '')}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Kopiera
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-muted/50 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    {selectedResult.curlCommand}
                  </pre>
                </div>
              )}

              {/* Full Response */}
              {selectedResult.response && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">API-svar</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(selectedResult.response, null, 2))}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Kopiera
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-muted/50 text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                    {JSON.stringify(selectedResult.response, null, 2)}
                  </pre>
                </div>
              )}

              {/* Sub Results */}
              {selectedResult.subResults && selectedResult.subResults.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">
                    Anrop ({selectedResult.subResults.filter(s => s.success).length}/{selectedResult.subResults.length} lyckades)
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {selectedResult.subResults.map((sub, idx) => (
                      <AccordionItem key={idx} value={`sub-${idx}`} className="border-border/30">
                        <AccordionTrigger className="py-2 text-sm hover:no-underline">
                          <div className="flex items-center gap-2">
                            {sub.success ? (
                              <Check className="h-4 w-4 text-success shrink-0" />
                            ) : (
                              <X className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <span className="font-medium">{sub.name}</span>
                            {sub.duration && (
                              <span className="text-xs text-muted-foreground ml-auto mr-2">{sub.duration}ms</span>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-1">
                          {sub.message && (
                            <div className="p-2 rounded bg-muted/50 text-xs">{sub.message}</div>
                          )}
                          {sub.tokensPerSecond && (
                            <div className="text-xs text-muted-foreground">TPS: {sub.tokensPerSecond}</div>
                          )}
                          {sub.errorCode && (
                            <div className="text-xs text-destructive">Felkod: {sub.errorCode}</div>
                          )}
                          {sub.curlCommand && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium">cURL</span>
                                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(sub.curlCommand || '')}>
                                  <Copy className="h-3 w-3 mr-1" />
                                  <span className="text-xs">Kopiera</span>
                                </Button>
                              </div>
                              <pre className="p-2 rounded bg-muted/50 text-[10px] overflow-x-auto whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto">
                                {sub.curlCommand}
                              </pre>
                            </div>
                          )}
                          {sub.response && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium">Svar</span>
                                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(JSON.stringify(sub.response, null, 2))}>
                                  <Copy className="h-3 w-3 mr-1" />
                                  <span className="text-xs">Kopiera</span>
                                </Button>
                              </div>
                              <pre className="p-2 rounded bg-muted/50 text-[10px] overflow-x-auto max-h-[200px] overflow-y-auto">
                                {JSON.stringify(sub.response, null, 2)}
                              </pre>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}

              {/* Re-run button */}
              <Button
                className="w-full"
                onClick={() => {
                  setIsDetailOpen(false);
                  const model = models.find(m => m.id === selectedResult.modelId);
                  const feature = TEST_FEATURES.find(f => f.id === selectedResult.feature);
                  if (model && feature) {
                    runTest(model, feature);
                  }
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Kör testet igen
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}