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
}

export interface TestFeature {
  id: string;
  name: string;
  description: string;
  testFunction: (model: Model, apiKey: string) => Promise<boolean>;
  supportedTypes: string[];
}