import { Model } from '../types/model';

const BASE_URL = 'https://api.berget.ai/v1';

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
  return data.data || [];
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