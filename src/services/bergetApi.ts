import { Model, TestDetail } from '../types/model';
import { encodeImageToBase64 } from '../utils/imageEncoder';
import testImage from '../assets/test-image.jpg';

const BASE_URL = 'https://api.berget.ai/v1';

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
    type: model.model_type === 'text' ? 'chat' : 
          model.model_type === 'embedding' ? 'embedding' :
          model.model_type === 'rerank' ? 'rerank' :
          model.model_type === 'speech-to-text' ? 'speech-to-text' :
          getModelType(model.id) // fallback to old method
  }));
}

export async function testToolUse(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. You MUST use the provided tools to answer questions. Do not respond with text explanations when a tool is available - always call the appropriate tool function.'
      },
      {
        role: 'user',
        content: 'What is the weather like today in Stockholm? Use the get_weather tool to answer this question.'
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
    stream: true,
    max_tokens: 4000
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        curlCommand,
        response: errorData,
        errorCode: response.status.toString(),
        message: 'API request failed'
      };
    }

    // Read streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        curlCommand,
        message: 'No readable stream'
      };
    }

    let hasToolCalls = false;
    let fullResponse = '';
    let textContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        fullResponse += chunk;

        // Parse SSE chunks
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              // Check for tool calls in delta
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                hasToolCalls = true;
              }
              
              // Collect text content if any
              if (parsed.choices?.[0]?.delta?.content) {
                textContent += parsed.choices[0].delta.content;
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const onlyTextResponse = !hasToolCalls && textContent.length > 0;
    
    return {
      success: hasToolCalls,
      curlCommand,
      response: fullResponse,
      message: hasToolCalls 
        ? 'Tool use test successful - model called the tool' 
        : onlyTextResponse 
          ? 'Model responded with text instead of using the tool'
          : 'Model did not use tools'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testJsonSupport(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: 'Please return a valid JSON object with exactly one field called "test" that has the boolean value true. Your response should be only the JSON object, nothing else.'
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        curlCommand,
        response: data,
        errorCode: response.status.toString(),
        message: 'API request failed'
      };
    }
    
    try {
      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content || '{}');
      const success = parsed.test === true;
      
      return {
        success,
        curlCommand,
        response: data,
        message: success ? 'JSON response valid' : 'JSON response invalid'
      };
    } catch {
      return {
        success: false,
        curlCommand,
        response: data,
        message: 'Failed to parse JSON response'
      };
    }
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testBasicCompletion(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: 'Hello, please respond with "Test successful"'
      }
    ],
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const success = response.ok && data.choices?.[0]?.message?.content?.includes('Test successful');
    
    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? 'Basic completion test successful' : 'Model did not respond correctly'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testStreamingSupport(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: 'Hello'
      }
    ],
    stream: true,
    max_tokens: 200
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return {
        success: false,
        curlCommand,
        response: errorData,
        errorCode: response.status.toString(),
        message: 'Streaming request failed'
      };
    }

    // Read a small chunk of the response to check for streaming format
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        curlCommand,
        message: 'No readable stream'
      };
    }

    const { value } = await reader.read();
    reader.releaseLock();

    if (!value) {
      return {
        success: false,
        curlCommand,
        message: 'Empty stream response'
      };
    }

    const chunk = new TextDecoder().decode(value);
    const success = chunk.includes('data: {') && (chunk.includes('"choices"') || chunk.includes('"delta"'));
    
    return {
      success,
      curlCommand,
      response: chunk,
      message: success ? 'Streaming test successful' : 'Invalid streaming format'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testMultimodal(model: Model, apiKey: string): Promise<TestDetail> {
  let base64Image: string;
  
  try {
    base64Image = await encodeImageToBase64(testImage);
  } catch (error) {
    return {
      success: false,
      curlCommand: '',
      errorCode: 'IMAGE_ENCODING_ERROR',
      message: 'Failed to encode test image'
    };
  }

  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What do you see in this image? Please describe it briefly.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    max_tokens: 300
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const success = response.ok && data.choices?.[0]?.message?.content?.length > 0;
    
    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? 'Multimodal test successful' : 'Model did not process image'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testEmbedding(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    input: 'Test embedding text',
  };

  const curlCommand = `curl -X POST "${BASE_URL}/embeddings" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const success = response.ok && Array.isArray(data.data) && data.data.length > 0 && Array.isArray(data.data[0].embedding);
    
    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? 'Embedding test successful' : 'Invalid embedding response'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testReranking(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    query: 'What is artificial intelligence?',
    documents: [
      'Artificial intelligence is a branch of computer science',
      'Machine learning is a subset of AI',
      'Weather is sunny today'
    ]
  };

  const curlCommand = `curl -X POST "${BASE_URL}/rerank" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${BASE_URL}/rerank`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const success = response.ok && Array.isArray(data.results) && data.results.length > 0;
    
    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? 'Reranking test successful' : 'Invalid reranking response'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testSpeechToText(model: Model, apiKey: string): Promise<TestDetail> {
  const curlCommand = `curl -X POST "${BASE_URL}/audio/transcriptions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -F "file=@test.wav" \\
  -F "model=${model.id}"`;

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
    const success = response.ok && typeof data.text === 'string';
    
    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? 'Speech-to-text test successful' : 'Invalid transcription response'
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}