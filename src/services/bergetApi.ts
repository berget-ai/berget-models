import { Model, TestDetail } from '../types/model';
import { encodeImageToBase64 } from '../utils/imageEncoder';
import testImage from '../assets/test-image.jpg';

function calculateTPS(response: any, durationMs: number): number | undefined {
  const completionTokens = response?.usage?.completion_tokens;
  if (!completionTokens || durationMs === 0) return undefined;
  return Math.round((completionTokens / durationMs) * 1000 * 10) / 10;
}

// GLM models require </think> suffix to skip thinking mode
function formatPrompt(prompt: string, modelId: string): string {
  const isGLM = modelId.toLowerCase().includes('glm');
  return isGLM ? `${prompt}</think>` : prompt;
}

// Strip thinking blocks from responses (internal tokens that break parsing)
// Handles both <think>...</think> and content before </think> without opening tag
function stripThinkingBlocks(content: string): string {
  if (!content) return content;
  // First, remove any <think>...</think> blocks
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Then, if there's a </think> tag, take only the content after it
  const thinkEndIndex = cleaned.indexOf('</think>');
  if (thinkEndIndex !== -1) {
    cleaned = cleaned.substring(thinkEndIndex + 8); // 8 = length of '</think>'
  }
  return cleaned.trim();
}

export function getModelType(modelId: string): 'chat' | 'embedding' | 'rerank' | 'speech-to-text' | 'ocr' {
  const id = modelId.toLowerCase();
  if (id.includes('rerank') || id.includes('bge-reranker')) return 'rerank';
  if (id.includes('embed') || id.includes('embedding')) return 'embedding';
  if (id.includes('whisper')) return 'speech-to-text';
  if (id.includes('ocr') || id.includes('docling')) return 'ocr';
  return 'chat';
}

export async function fetchModels(apiKey: string, baseUrl: string): Promise<Model[]> {
  const response = await fetch(`${baseUrl}/models`, {
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
  const mappedModels = models.map((model: any) => ({
    ...model,
    type: model.model_type === 'text' ? 'chat' : 
          model.model_type === 'embedding' ? 'embedding' :
          model.model_type === 'rerank' ? 'rerank' :
          model.model_type === 'speech-to-text' ? 'speech-to-text' :
          model.model_type === 'ocr' ? 'ocr' :
          getModelType(model.id)
  }));
  
  // Add Docling OCR model if not already present
  const hasDocling = mappedModels.some((m: Model) => m.id.toLowerCase().includes('docling'));
  if (!hasDocling) {
    mappedModels.push({
      id: 'docling',
      object: 'model',
      created: Date.now(),
      owned_by: 'berget',
      type: 'ocr' as const
    });
  }
  
  return mappedModels;
}

export async function testToolUse(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('What is the weather like today in Stockholm? Use the get_weather tool to answer this question.', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. You MUST use the provided tools to answer questions. Do not respond with text explanations when a tool is available - always call the appropriate tool function.'
      },
      {
        role: 'user',
        content: userPrompt
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

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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

export async function testJsonSupport(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('Please return a valid JSON object with exactly one field called "test" that has the boolean value true. Your response should be only the JSON object, nothing else.', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || '');
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

export async function testJsonSchema(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
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

  const userPrompt = formatPrompt('Generate a person profile as JSON with exactly these fields: name (string), age (number), email (string). Use: name "John Doe", age 30, email "john@example.com". Return only valid JSON with no additional fields.', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    response_format: { 
      type: 'json_object'
    },
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || '');
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

export async function testBasicCompletion(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('Hello, please respond with "Test successful"', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    max_tokens: 500
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;
    const rawContent = data.choices?.[0]?.message?.content || '';
    const content = stripThinkingBlocks(rawContent);
    const success = response.ok && content.includes('Test successful');
    
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

export async function testTPS(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('Write a detailed explanation of how neural networks work, including the concepts of layers, weights, biases, activation functions, backpropagation, and gradient descent. Please provide a comprehensive response with examples.', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    max_tokens: 1000
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
    const rawContent = data.choices?.[0]?.message?.content || '';
    const content = stripThinkingBlocks(rawContent);
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content || '';
    const hasContent = content.length > 100 || reasoningContent.length > 100;
    
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

export async function testStreamingSupport(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('Hello', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ],
    stream: true,
    max_tokens: 200
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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

export async function testMultimodal(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
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

  const textPrompt = formatPrompt('What do you see in this image? Please describe it briefly.', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: textPrompt
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

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;
    
    const rawContent = data.choices?.[0]?.message?.content || '';
    const content = stripThinkingBlocks(rawContent);
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

export async function testOCR(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const isDocling = model.id.toLowerCase().includes('docling');
  
  if (isDocling) {
    // Use dedicated /v1/ocr endpoint for Docling
    const testDocumentUrl = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg';
    
    const requestBody = {
      document: {
        url: testDocumentUrl,
        type: 'document'
      },
      options: {
        tableMode: 'accurate',
        ocrMethod: 'easyocr',
        outputFormat: 'md'
      }
    };

    const ocrBaseUrl = baseUrl.replace(/\/v1$/, '');
    
    const curlCommand = `curl -X POST "${ocrBaseUrl}/v1/ocr" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    const startTime = Date.now();

    try {
      const response = await fetch(`${ocrBaseUrl}/v1/ocr`, {
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
          message: `Docling OCR request failed: ${data.error || response.statusText}`
        };
      }
      
      const content = data.content || data.markdown || '';
      const hasContent = content.length > 0;
      
      return {
        success: hasContent,
        curlCommand,
        response: data,
        errorCode: hasContent ? undefined : 'NO_CONTENT',
        message: hasContent 
          ? `Docling OCR successful - extracted ${content.length} chars in ${duration}ms` 
          : 'No content extracted from document'
      };
    } catch (error) {
      return {
        success: false,
        curlCommand,
        errorCode: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } else {
    // Use chat/completions endpoint for vision-based OCR (e.g., deepseek-ocr)
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
              text: formatPrompt('Free OCR.', model.id)
            }
          ]
        }
      ],
      max_tokens: 2048,
      temperature: 0.0
    };

    const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    const startTime = Date.now();

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
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
      
      const rawContent = data.choices?.[0]?.message?.content || '';
      const content = stripThinkingBlocks(rawContent);
      
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
}

export async function testEmbedding(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    input: 'Test embedding text',
  };

  const curlCommand = `curl -X POST "${baseUrl}/embeddings" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
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

export async function testReranking(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    query: 'What is artificial intelligence?',
    documents: [
      'Artificial intelligence is a branch of computer science',
      'Machine learning is a subset of AI',
      'Weather is sunny today'
    ]
  };

  const curlCommand = `curl -X POST "${baseUrl}/rerank" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/rerank`, {
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

export async function testSpeechToText(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const curlCommand = `curl -X POST "${baseUrl}/audio/transcriptions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -F "file=@test.wav" \\
  -F "model=${model.id}"`;

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
    
    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'test.wav');
    formData.append('model', model.id);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
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

// Long transcription sample for long context testing (~8000 tokens)
const LONG_TRANSCRIPTION = `
[00:00:00] Moderator: Welcome everyone to today's quarterly business review meeting. We have quite a full agenda today, so let's get started right away. First, I'd like to welcome our CEO, Sarah Johnson, who will give us an overview of the company's performance this quarter.

[00:00:25] Sarah Johnson: Thank you, and good morning everyone. It's great to see so many familiar faces here today, both in person and joining us remotely. Before we dive into the numbers, I want to acknowledge the incredible work that all of our teams have put in this quarter. Despite the challenging market conditions, we've managed to not only meet but exceed several of our key performance indicators.

[00:01:15] Sarah Johnson: Let me start with some high-level figures. Our total revenue for Q3 came in at 47.3 million dollars, which represents a 12% increase compared to the same quarter last year. Our gross margin improved by 2.5 percentage points to 68.3%, thanks largely to the operational efficiency initiatives that our COO Michael will discuss later.

[00:02:00] Sarah Johnson: On the customer side, we added 340 new enterprise customers this quarter, bringing our total enterprise customer base to 2,847. More importantly, our net revenue retention rate stands at 118%, which means our existing customers are not only staying with us but expanding their usage of our platform.

[00:02:45] Sarah Johnson: Now, let me hand over to our CFO, David Chen, who will walk us through the detailed financial breakdown.

[00:03:00] David Chen: Thank you, Sarah. Good morning, everyone. As Sarah mentioned, this has been a strong quarter financially. Let me break down the revenue by segment. Our SaaS platform revenue was 38.2 million, up 15% year-over-year. Professional services contributed 6.8 million, and our marketplace revenue came in at 2.3 million.

[00:03:45] David Chen: Looking at our cost structure, we've been very focused on maintaining discipline while still investing in growth. Our total operating expenses were 32.1 million, which is a 8% increase from last quarter. The largest increases were in R&D, where we're continuing to invest heavily in our AI capabilities, and in sales and marketing as we expand into new geographic markets.

[00:04:30] David Chen: Our EBITDA for the quarter was 9.4 million, representing a margin of 19.9%. This is an improvement of 3.2 percentage points from Q2. We ended the quarter with 124 million in cash and no debt, giving us a very strong balance sheet to support our growth initiatives.

[00:05:15] David Chen: One thing I want to highlight is our customer acquisition cost, or CAC. We've managed to reduce our CAC by 18% this quarter through more efficient marketing spend and improved sales processes. Our CAC payback period is now down to 14 months, which is best-in-class for our industry.

[00:06:00] Moderator: Thank you, David. Now let's hear from our Chief Product Officer, Amanda Rodriguez, about our product developments.

[00:06:15] Amanda Rodriguez: Thanks. I'm excited to share what we've been building. This quarter, we shipped 47 new features across our platform. The biggest release was our new AI-powered analytics dashboard, which uses machine learning to automatically surface insights from customer data. Early feedback has been overwhelmingly positive, with 87% of beta users saying it has significantly improved their workflow.

[00:07:00] Amanda Rodriguez: We also completed a major infrastructure upgrade that has reduced our average API response time by 40%. This was a multi-quarter effort, and I want to thank the engineering team for their dedication in making this happen. Customer complaints about performance have dropped by 65% since the upgrade went live.

[00:07:45] Amanda Rodriguez: Looking ahead to Q4, we have several exciting releases planned. Our new mobile app is entering final testing and should launch in October. We're also rolling out enhanced security features including SOC 2 Type II certification, which has been a top request from our enterprise customers.

[00:08:30] Amanda Rodriguez: On the AI front, we're preparing to launch our natural language query feature, which will allow users to ask questions about their data in plain English and get instant visualizations. This is powered by the latest large language models and represents a significant step forward in making our platform accessible to non-technical users.

[00:09:15] Moderator: Excellent updates, Amanda. Michael, can you tell us about operations?

[00:09:25] Michael Foster: Absolutely. On the operations side, we've had a transformative quarter. As Sarah mentioned, our gross margin improvement was significant, and I want to explain what drove that. We renegotiated our cloud infrastructure contracts, which will save us approximately 3.2 million annually. We also implemented automated scaling that reduces our compute costs during off-peak hours by 35%.

[00:10:15] Michael Foster: Our customer support metrics continue to improve. Average first response time is now under 2 hours, down from 4 hours last quarter. Customer satisfaction scores for support interactions are at 94%. We achieved this while actually reducing our support headcount by 10% through better tooling and AI-assisted responses.

[00:11:00] Michael Foster: On the people side, we now have 847 employees across 12 countries. Our voluntary attrition rate this quarter was 8% annualized, which is below industry average. We've been particularly successful in retaining our engineering talent, with only 5% attrition in that department.

[00:11:45] Michael Foster: We opened our new office in Singapore last month, which will serve as our Asia-Pacific headquarters. We're planning to have 50 employees there by the end of next year, focusing on sales, customer success, and regional partnerships.

[00:12:30] Moderator: Thank you, Michael. Now let's hear from Jennifer Lee, our VP of Sales, about our go-to-market performance.

[00:12:45] Jennifer Lee: Thank you. Q3 was a record quarter for our sales team. We closed 78 deals with annual contract values over 100,000 dollars, up from 52 in Q2. Our largest deal this quarter was a 2.4 million dollar multi-year agreement with a Fortune 100 manufacturing company.

[00:13:30] Jennifer Lee: Our pipeline is looking very healthy. We currently have 156 million in qualified pipeline, which is 2.8 times our Q4 quota. Win rates have improved to 34%, up from 28% last quarter, which I attribute to our improved demo process and the new case studies we've been using.

[00:14:15] Jennifer Lee: Geographically, North America continues to be our largest market at 62% of new bookings. Europe was 28%, and Asia-Pacific was 10%. However, APAC is growing fastest at 45% year-over-year, which is why the Singapore office expansion is so important.

[00:15:00] Jennifer Lee: We've also seen great success with our partner channel this quarter. Partner-sourced deals accounted for 23% of new bookings, up from 15% last year. We added 12 new certified implementation partners and 8 new technology integration partners.

[00:15:45] Moderator: Great insights, Jennifer. Let's now discuss our marketing initiatives with Tom Williams, VP of Marketing.

[00:16:00] Tom Williams: Thanks. Marketing has been focused on building awareness and generating high-quality leads. Our brand awareness survey showed a 15-point increase in unaided awareness among our target audience compared to six months ago. We attribute this to our thought leadership content and increased presence at industry events.

[00:16:45] Tom Williams: In terms of demand generation, we generated 4,200 marketing qualified leads this quarter, up 22% from Q2. More importantly, the quality of leads has improved, with MQL to SQL conversion rate at 32%, up from 24%. Our content marketing efforts have been particularly effective, with our blog and resource center now attracting over 200,000 unique visitors per month.

[00:17:30] Tom Williams: We launched our new customer advocacy program this quarter, and already have 45 customers who have agreed to participate in case studies, reference calls, and speaking opportunities. This is invaluable for building credibility with prospects.

[00:18:15] Tom Williams: Looking at Q4, we have our annual user conference coming up in November. We're expecting 1,500 attendees, which would be a 40% increase from last year. We're also planning a major product announcement at the conference that Amanda's team has been working on.

[00:19:00] Moderator: Excellent. Now I'd like to open the floor for questions from the board members. Patricia, you had some questions earlier?

[00:19:15] Patricia Morgan: Yes, thank you. I have a few questions. First, Sarah, can you elaborate on the competitive landscape? We've seen some new entrants in the market recently. How are we positioning ourselves?

[00:19:35] Sarah Johnson: Great question, Patricia. You're right that we've seen increased competition, particularly from well-funded startups. However, I believe our position has actually strengthened. Our product depth and enterprise-grade capabilities are difficult to replicate quickly. In head-to-head evaluations, we're winning 7 out of 10 deals against our closest competitor, up from 6 out of 10 a year ago.

[00:20:20] Sarah Johnson: We're also seeing some consolidation in the market, with smaller players being acquired. This actually benefits us as customers become wary of platform risk with smaller vendors. Our financial stability and continued investment in the product are becoming stronger selling points.

[00:21:00] Patricia Morgan: That's helpful. My second question is about international expansion. What are the biggest challenges you're facing in new markets?

[00:21:15] Michael Foster: I can take that one. The biggest challenges are around localization and compliance. Each new market has its own data residency requirements, language needs, and business practices. We've invested heavily in infrastructure to support data residency, and we now offer the platform in 8 languages.

[00:21:55] Michael Foster: The other challenge is building local teams and partnerships. It takes time to find the right talent and the right partners who understand both our product and the local market. This is why we're taking a measured approach to expansion rather than trying to enter too many markets at once.

[00:22:35] Board Member Robert Kim: I have a question about AI. We're seeing AI mentioned everywhere now. How real is the opportunity for us, and what's our strategy?

[00:22:50] Amanda Rodriguez: This is something we're very excited about. AI is not just a buzzword for us - it's fundamentally changing what our platform can do. The features I mentioned earlier, like natural language queries and automated insights, are just the beginning.

[00:23:25] Amanda Rodriguez: We're building what we call "AI-first" features, where the AI doesn't just assist but actually drives the user experience. For example, we're developing predictive capabilities that can anticipate what analysis a user needs before they even ask for it.

[00:24:00] Amanda Rodriguez: From a competitive perspective, we believe our advantage lies in our data. We have 8 years of customer data and usage patterns that we can use to train our models. New entrants don't have this, and it's not something they can acquire quickly.

[00:24:40] Robert Kim: How are you thinking about AI infrastructure costs? I've heard that running these models can be very expensive.

[00:25:00] David Chen: That's a valid concern, Robert. We're being very thoughtful about this. We're using a hybrid approach where we use third-party APIs for some capabilities and run our own fine-tuned models for others. This gives us flexibility and helps manage costs.

[00:25:35] David Chen: We've budgeted 4.2 million for AI infrastructure in Q4, which is about 15% of our R&D budget. We expect this to pay back through reduced support costs, improved customer outcomes, and the ability to charge premium pricing for AI features.

[00:26:15] Moderator: We have time for one more question before we wrap up.

[00:26:25] Board Member Lisa Chang: I'd like to understand more about customer health and churn. What are you seeing, and what's driving retention?

[00:26:40] Jennifer Lee: Our gross churn this quarter was 1.8%, which annualizes to about 7%. This is consistent with prior quarters and below industry benchmarks. When we analyze churned customers, the primary reasons are budget cuts at the customer organization, M&A activity where our product is displaced, and in rare cases, competitive displacement.

[00:27:25] Jennifer Lee: What's driving retention is product value delivery. Customers who fully implement our platform and use it regularly have churn rates below 3% annualized. We've invested heavily in our customer success team to drive adoption, and we're seeing the results.

[00:28:00] Jennifer Lee: We've also introduced new pricing tiers this quarter that allow customers to grow with us more gradually. This has been well-received, especially by mid-market customers who found the jump from our starter tier to enterprise tier too steep.

[00:28:40] Moderator: Thank you all for these comprehensive updates. Before we conclude, Sarah, would you like to share closing thoughts?

[00:28:55] Sarah Johnson: Yes, thank you. I want to reiterate how proud I am of this team and what we've accomplished this quarter. The combination of strong financial performance, product innovation, and operational excellence positions us well for continued growth.

[00:29:30] Sarah Johnson: Looking ahead to Q4 and into next year, our priorities are clear: continue to innovate on the product, expand our market presence, and deliver exceptional value to our customers. We have ambitious goals, but I'm confident in our ability to achieve them.

[00:30:00] Sarah Johnson: Thank you all for your continued support and partnership. Let's make Q4 our best quarter yet.

[00:30:15] Moderator: Thank you, Sarah. That concludes today's quarterly business review. The next QBR will be scheduled for January. Meeting adjourned.
`;

export async function testLongContextJson(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const systemPrompt = `You are an expert meeting analyst. Analyze the provided meeting transcription and extract structured information.
Return a JSON object with exactly these fields:
- summary: A 2-3 sentence summary of the meeting
- attendees: An array of objects with name and role fields for each person who spoke
- key_metrics: An object containing any numerical metrics mentioned (revenue, growth rates, etc)
- action_items: An array of strings listing any action items or next steps mentioned
- topics_discussed: An array of strings listing the main topics covered`;

  const userPrompt = formatPrompt(`Please analyze this meeting transcription and return the results as JSON:\n\n${LONG_TRANSCRIPTION}`, model.id);
  
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 4000
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({...requestBody, messages: [{role: 'system', content: systemPrompt}, {role: 'user', content: '[LONG TRANSCRIPTION ~8000 tokens]'}]}, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
        message: `API request failed: ${data.error?.message || response.statusText}`
      };
    }
    
    try {
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || '');
      const parsed = JSON.parse(content || '{}');
      
      // Validate expected structure
      const hasSummary = typeof parsed.summary === 'string' && parsed.summary.length > 0;
      const hasAttendees = Array.isArray(parsed.attendees) && parsed.attendees.length > 0;
      const hasKeyMetrics = typeof parsed.key_metrics === 'object' && Object.keys(parsed.key_metrics).length > 0;
      const hasActionItems = Array.isArray(parsed.action_items);
      const hasTopics = Array.isArray(parsed.topics_discussed) && parsed.topics_discussed.length > 0;
      
      const validFields = [hasSummary, hasAttendees, hasKeyMetrics, hasActionItems, hasTopics].filter(Boolean).length;
      const success = validFields >= 4; // At least 4 of 5 fields should be valid
      
      const promptTokens = data?.usage?.prompt_tokens || 0;
      const completionTokens = data?.usage?.completion_tokens || 0;
      const tps = calculateTPS(data, duration);
      
      return {
        success,
        curlCommand,
        response: data,
        tokensPerSecond: tps,
        message: success 
          ? `Long context + JSON OK (prompt: ${promptTokens} tokens, completion: ${completionTokens} tokens, ${(duration / 1000).toFixed(1)}s)`
          : `JSON structure incomplete (${validFields}/5 fields valid)`
      };
    } catch (parseError) {
      return {
        success: false,
        curlCommand,
        response: data,
        message: `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`
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
