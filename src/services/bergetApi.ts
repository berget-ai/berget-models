import { Model, TestDetail } from '../types/model';
import { encodeImageToBase64 } from '../utils/imageEncoder';
import testImage from '../assets/test-image.jpg';

const BASE_URL = 'https://api.berget.ai/v1';

function calculateTPS(response: any, durationMs: number): number | undefined {
  const completionTokens = response?.usage?.completion_tokens;
  if (!completionTokens || durationMs === 0) return undefined;
  return Math.round((completionTokens / durationMs) * 1000 * 10) / 10;
}

export function getModelType(modelId: string): 'chat' | 'embedding' | 'rerank' | 'speech-to-text' | 'ocr' {
  const id = modelId.toLowerCase();
  if (id.includes('rerank') || id.includes('bge-reranker')) return 'rerank';
  if (id.includes('embed') || id.includes('embedding')) return 'embedding';
  if (id.includes('whisper')) return 'speech-to-text';
  if (id.includes('ocr')) return 'ocr';
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
          model.model_type === 'ocr' ? 'ocr' :
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
        content: 'What is the weather like today in Stockholm? Use the get_weather tool to answer this question.</think>'
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
    max_tokens: 4000
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();
  
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
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        curlCommand,
        response: data,
        errorCode: response.status.toString(),
        message: 'API request failed'
      };
    }
    
    const hasToolCalls = data.choices?.[0]?.message?.tool_calls?.length > 0;
    const textContent = data.choices?.[0]?.message?.content || '';
    const onlyTextResponse = !hasToolCalls && textContent.length > 0;
    
    return {
      success: hasToolCalls,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
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
        content: 'Please return a valid JSON object with exactly one field called "test" that has the boolean value true. Your response should be only the JSON object, nothing else.</think>'
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    
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
        tokensPerSecond: calculateTPS(data, duration),
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

export async function testJsonSchema(model: Model, apiKey: string): Promise<TestDetail> {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      email: { type: 'string' }
    },
    required: ['name', 'age', 'email'],
    additionalProperties: false
  };

  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: `Generate a person profile as JSON with exactly these fields: name (string), age (number), email (string). Use: name "John Doe", age 30, email "john@example.com". Return only valid JSON with no additional fields.</think>`
      }
    ],
    response_format: { 
      type: 'json_object'
    },
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    
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
      
      const hasName = typeof parsed.name === 'string' && parsed.name.length > 0;
      const hasAge = typeof parsed.age === 'number';
      const hasEmail = typeof parsed.email === 'string' && parsed.email.length > 0;
      const noExtraProps = Object.keys(parsed).length === 3;
      
      const success = hasName && hasAge && hasEmail && noExtraProps;
      
      return {
        success,
        curlCommand,
        response: data,
        tokensPerSecond: calculateTPS(data, duration),
        message: success ? 'JSON schema validation successful' : 'Response does not match schema'
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
        content: 'Hello, please respond with "Test successful"</think>'
      }
    ],
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    const success = response.ok && data.choices?.[0]?.message?.content?.includes('Test successful');
    
    return {
      success,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
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

export async function testTPS(model: Model, apiKey: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: 'Write a detailed explanation of how neural networks work, including the concepts of layers, weights, biases, activation functions, backpropagation, and gradient descent. Please provide a comprehensive response with examples.</think>'
      }
    ],
    max_tokens: 1000
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        curlCommand,
        response: data,
        errorCode: response.status.toString(),
        message: 'API request failed'
      };
    }
    
    const completionTokens = data?.usage?.completion_tokens || 0;
    const tps = calculateTPS(data, duration);
    const hasContent = data.choices?.[0]?.message?.content?.length > 100;
    
    return {
      success: hasContent && tps !== undefined,
      curlCommand,
      response: data,
      tokensPerSecond: tps,
      message: tps 
        ? `TPS: ${tps} tok/s (${completionTokens} tokens i ${(duration / 1000).toFixed(1)}s)` 
        : 'Kunde inte beräkna TPS'
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
        content: 'Hello</think>'
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
            text: 'What do you see in this image? Please describe it briefly.</think>'
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

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    
    // Check if model actually saw the image (not just responded)
    const content = data.choices?.[0]?.message?.content || '';
    const imageNotSeenPhrases = [
      "can't see",
      "cannot see",
      "not able to see",
      "no image",
      "not attached",
      "nothing was attached",
      "didn't receive",
      "no picture",
      "don't see"
    ];
    
    const contentLower = content.toLowerCase();
    const modelDidNotSeeImage = imageNotSeenPhrases.some(phrase => contentLower.includes(phrase));
    const success = response.ok && content.length > 0 && !modelDidNotSeeImage;
    
    return {
      success,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      errorCode: response.ok ? undefined : response.status.toString(),
      message: modelDidNotSeeImage 
        ? 'Model did not receive or process the image' 
        : success 
          ? 'Multimodal test successful' 
          : 'Model did not process image'
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

export async function testOCR(model: Model, apiKey: string): Promise<TestDetail> {
  // Use a receipt image with tables and text for OCR testing
  const receiptImageUrl = 'https://ofasys-multimodal-wlcb-3-toshanghai.oss-accelerate.aliyuncs.com/wpf272043/keepme/image/receipt.png';
  
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: receiptImageUrl
            }
          },
          {
            type: 'text',
            text: 'Free OCR.</think>'
          }
        ]
      }
    ],
    max_tokens: 2048,
    temperature: 0.0
  };

  const curlCommand = `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

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
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        curlCommand,
        response: data,
        errorCode: response.status.toString(),
        message: 'API request failed'
      };
    }
    
    const content = data.choices?.[0]?.message?.content || '';
    
    // Check for OCR-specific indicators:
    // - Contains table markup (<td>, </td>, <table>, etc.)
    // - Contains extracted text (numbers, words)
    // - Response is substantial (OCR output is typically verbose)
    const hasTableMarkup = content.includes('<td>') || content.includes('</td>') || content.includes('<table>');
    const hasSubstantialContent = content.length > 100;
    const containsNumbers = /\d+/.test(content);
    
    const success = response.ok && hasSubstantialContent && (hasTableMarkup || containsNumbers);
    
    return {
      success,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success 
        ? `OCR test successful - extracted ${content.length} chars` 
        : content.length === 0 
          ? 'No OCR output received'
          : 'OCR output may be incomplete or invalid'
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