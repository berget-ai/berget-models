export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  type?: 'chat' | 'embedding' | 'rerank' | 'speech-to-text';
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
}

export interface TestDetail {
  success: boolean;
  curlCommand: string;
  response?: any;
  errorCode?: string;
  message?: string;
}

export interface TestFeature {
  id: string;
  name: string;
  description: string;
  testFunction: (model: Model, apiKey: string) => Promise<TestDetail>;
  supportedTypes: string[];
}