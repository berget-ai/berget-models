export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  type?: 'chat' | 'text' | 'embedding' | 'rerank' | 'speech-to-text' | 'ocr';
  isUp?: boolean;
}

export interface TestResult {
  modelId: string;
  feature: string;
  status: 'pending' | 'success' | 'error' | 'testing';
  message?: string;
  duration?: number;
  curlCommand?: string;
  response?: any;
  errorCode?: string;
  tokensPerSecond?: number;
}

export interface TestDetail {
  success: boolean;
  curlCommand: string;
  response?: any;
  errorCode?: string;
  message?: string;
  tokensPerSecond?: number;
}

export interface TestFeature {
  id: string;
  name: string;
  description: string;
  testFunction: (model: Model, apiKey: string, baseUrl: string) => Promise<TestDetail>;
  supportedTypes: string[];
}