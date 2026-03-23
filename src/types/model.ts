export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  type?: 'chat' | 'text' | 'embedding' | 'rerank' | 'speech-to-text' | 'ocr';
  isUp?: boolean;
}

export interface SubResult {
  name: string;
  success: boolean;
  message?: string;
  curlCommand?: string;
  response?: any;
  errorCode?: string;
  duration?: number;
  tokensPerSecond?: number;
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
  subResults?: SubResult[];
}

export interface TestDetail {
  success: boolean;
  curlCommand: string;
  response?: any;
  errorCode?: string;
  message?: string;
  tokensPerSecond?: number;
  duration?: number;
  subResults?: SubResult[];
}

export interface TestFeature {
  id: string;
  name: string;
  description: string;
  testFunction: (model: Model, apiKey: string, baseUrl: string) => Promise<TestDetail>;
  supportedTypes: string[];
}