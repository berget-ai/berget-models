import { Model } from '../types/model';

const BASE_URL = 'https://backend-api.berget.ai/v1';

export function getModelType(modelId: string): 'chat' | 'embedding' | 'rerank' | 'speech-to-text' {
  const id = modelId.toLowerCase();
  if (id.includes('rerank') || id.includes('bge-reranker')) return 'rerank';
  if (id.includes('embed') || id.includes('embedding')) return 'embedding';
  if (id.includes('whisper')) return 'speech-to-text';
  return 'chat';
}

export async function fetchModels(apiKey: string): Promise<Model[]> {
  const response = await fetch(`${BASE_URL}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  const models = data.data || [];
  return models.map((model: any) => ({
    ...model,
    type: getModelType(model.id)
  }));
}

export async function testToolUse(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'user',
            content: 'What is the weather like today?'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The location to get weather for'
                  }
                },
                required: ['location']
              }
            }
          }
        ],
        tool_choice: 'auto',
        max_tokens: 100
      }),
    });

    const data = await response.json();
    return response.ok && data.choices?.[0]?.message?.tool_calls?.length > 0;
  } catch {
    return false;
  }
}

export async function testJsonSupport(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'user',
            content: 'Return a JSON object with a "test" field set to true'
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 50
      }),
    });

    const data = await response.json();
    if (!response.ok) return false;
    
    try {
      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content || '{}');
      return parsed.test === true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export async function testBasicCompletion(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'user',
            content: 'Hello, please respond with "Test successful"'
          }
        ],
        max_tokens: 20
      }),
    });

    const data = await response.json();
    return response.ok && data.choices?.[0]?.message?.content?.includes('Test successful');
  } catch {
    return false;
  }
}

export async function testStreamingSupport(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        stream: true,
        max_tokens: 10
      }),
    });

    if (!response.ok) return false;

    // Read a small chunk of the response to check for streaming format
    const reader = response.body?.getReader();
    if (!reader) return false;

    const { value } = await reader.read();
    reader.releaseLock();

    if (!value) return false;

    const chunk = new TextDecoder().decode(value);
    return chunk.includes('data: {') && (chunk.includes('"choices"') || chunk.includes('"delta"'));
  } catch {
    return false;
  }
}

export async function testMultimodal(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What do you see in this image?'
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                }
              }
            ]
          }
        ],
        max_tokens: 50
      }),
    });

    const data = await response.json();
    return response.ok && data.choices?.[0]?.message?.content?.length > 0;
  } catch {
    return false;
  }
}

export async function testEmbedding(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        input: 'Test embedding text',
      }),
    });

    const data = await response.json();
    return response.ok && Array.isArray(data.data) && data.data.length > 0 && Array.isArray(data.data[0].embedding);
  } catch {
    return false;
  }
}

export async function testReranking(model: Model, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/rerank`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        query: 'What is artificial intelligence?',
        documents: [
          'Artificial intelligence is a branch of computer science',
          'Machine learning is a subset of AI',
          'Weather is sunny today'
        ]
      }),
    });

    const data = await response.json();
    return response.ok && Array.isArray(data.results) && data.results.length > 0;
  } catch {
    return false;
  }
}

export async function testSpeechToText(model: Model, apiKey: string): Promise<boolean> {
  try {
    // Create a simple audio blob for testing (1 second of silence)
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
    
    // Convert to WAV format
    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'test.wav');
    formData.append('model', model.id);

    const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const data = await response.json();
    return response.ok && typeof data.text === 'string';
  } catch {
    return false;
  }
}