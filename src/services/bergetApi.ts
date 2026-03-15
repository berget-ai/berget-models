import { Model, TestDetail } from "../types/model";
import { encodeImageToBase64 } from "../utils/imageEncoder";
import testImage from "../assets/test-image.jpg";
import { LONG_TRANSCRIPTION } from "../data/longTranscription";

function calculateTPS(response: any, durationMs: number): number | undefined {
  const completionTokens = response?.usage?.completion_tokens;
  if (!completionTokens || durationMs === 0) return undefined;
  return Math.round((completionTokens / durationMs) * 1000 * 10) / 10;
}

// GLM models require </think> suffix to skip thinking mode
function formatPrompt(prompt: string, modelId: string): string {
  const isGLM = modelId.toLowerCase().includes("glm");
  return isGLM ? `${prompt}</think>` : prompt;
}

// Strip thinking blocks from responses (internal tokens that break parsing)
// Handles both <think>...</think> and content before </think> without opening tag
function stripThinkingBlocks(content: string): string {
  if (!content) return content;
  // First, remove any <think>...</think> blocks
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Then, if there's a </think> tag, take only the content after it
  const thinkEndIndex = cleaned.indexOf("</think>");
  if (thinkEndIndex !== -1) {
    cleaned = cleaned.substring(thinkEndIndex + 8); // 8 = length of '</think>'
  }
  return cleaned.trim();
}

export function getModelType(modelId: string): "chat" | "embedding" | "rerank" | "speech-to-text" | "ocr" {
  const id = modelId.toLowerCase();
  if (id.includes("rerank") || id.includes("bge-reranker")) return "rerank";
  if (id.includes("embed") || id.includes("embedding")) return "embedding";
  if (id.includes("whisper")) return "speech-to-text";
  if (id.includes("ocr") || id.includes("docling")) return "ocr";
  return "chat";
}

export async function fetchModels(apiKey: string, baseUrl: string): Promise<Model[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  const models = data.data || [];
  const mappedModels = models.map((model: any) => ({
    ...model,
    isUp: model.status?.up !== false,
    type:
      model.model_type === "text"
        ? "chat"
        : model.model_type === "embedding"
          ? "embedding"
          : model.model_type === "rerank"
            ? "rerank"
            : model.model_type === "speech-to-text"
              ? "speech-to-text"
              : model.model_type === "ocr"
                ? "ocr"
                : getModelType(model.id),
  }));

  // Add Docling OCR model if not already present
  const hasDocling = mappedModels.some((m: Model) => m.id.toLowerCase().includes("docling"));
  if (!hasDocling) {
    mappedModels.push({
      id: "docling",
      object: "model",
      created: Date.now(),
      owned_by: "berget",
      type: "ocr" as const,
    });
  }

  return mappedModels;
}

export async function testToolUse(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "What is the weather like today in Stockholm? Use the get_weather tool to answer this question.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. You MUST use the provided tools to answer questions. Do not respond with text explanations when a tool is available - always call the appropriate tool function.",
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The location to get weather for",
              },
            },
            required: ["location"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: "API request failed",
      };
    }

    const hasToolCalls = data.choices?.[0]?.message?.tool_calls?.length > 0;
    const textContent = data.choices?.[0]?.message?.content || "";
    const onlyTextResponse = !hasToolCalls && textContent.length > 0;

    return {
      success: hasToolCalls,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      message: hasToolCalls
        ? "Tool use test successful - model called the tool"
        : onlyTextResponse
          ? "Model responded with text instead of using the tool"
          : "Model did not use tools",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Advanced Tool Use Level 2: Multiple parameters with enums and optional fields
export async function testToolUseMultiParam(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "Book a flight from Stockholm to Tokyo on 2025-06-15 in business class for 2 passengers. Use the book_flight tool.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content: "You are a travel assistant. You MUST use the provided tools. Do not respond with text - always call the appropriate tool.",
      },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "book_flight",
          description: "Book a flight between two cities",
          parameters: {
            type: "object",
            properties: {
              origin: { type: "string", description: "Departure city" },
              destination: { type: "string", description: "Arrival city" },
              date: { type: "string", description: "Travel date in YYYY-MM-DD format" },
              cabin_class: {
                type: "string",
                enum: ["economy", "premium_economy", "business", "first"],
                description: "Cabin class",
              },
              passengers: { type: "integer", description: "Number of passengers", minimum: 1, maximum: 9 },
              return_date: { type: "string", description: "Optional return date in YYYY-MM-DD format" },
            },
            required: ["origin", "destination", "date", "cabin_class", "passengers"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, curlCommand, response: data, errorCode: response.status.toString(), message: "API request failed" };
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    const hasToolCalls = toolCalls?.length > 0;

    if (!hasToolCalls) {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Model did not use tools" };
    }

    // Validate the arguments contain required fields
    try {
      const args = JSON.parse(toolCalls[0].function.arguments);
      const requiredFields = ["origin", "destination", "date", "cabin_class", "passengers"];
      const missingFields = requiredFields.filter(f => !(f in args));
      const validEnum = ["economy", "premium_economy", "business", "first"].includes(args.cabin_class);

      if (missingFields.length > 0) {
        return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: `Missing required fields: ${missingFields.join(", ")}` };
      }
      if (!validEnum) {
        return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: `Invalid cabin_class: ${args.cabin_class}` };
      }

      return { success: true, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: `Tool called with ${Object.keys(args).length} params, cabin: ${args.cabin_class}, passengers: ${args.passengers}` };
    } catch {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Failed to parse tool arguments" };
    }
  } catch (error) {
    return { success: false, curlCommand, errorCode: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Advanced Tool Use Level 3: Multiple tools - model must pick the right one
export async function testToolUseMultiTool(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "I need to convert 500 SEK to EUR. Use the appropriate tool.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. You MUST use the provided tools. Pick the most appropriate tool for the task.",
      },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "convert_currency",
          description: "Convert an amount from one currency to another",
          parameters: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Amount to convert" },
              from_currency: { type: "string", description: "ISO 4217 currency code to convert from" },
              to_currency: { type: "string", description: "ISO 4217 currency code to convert to" },
            },
            required: ["amount", "from_currency", "to_currency"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "translate_text",
          description: "Translate text from one language to another",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" },
              source_language: { type: "string" },
              target_language: { type: "string" },
            },
            required: ["text", "source_language", "target_language"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, curlCommand, response: data, errorCode: response.status.toString(), message: "API request failed" };
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    const hasToolCalls = toolCalls?.length > 0;

    if (!hasToolCalls) {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Model did not use tools" };
    }

    const calledFunction = toolCalls[0].function.name;
    const pickedCorrectTool = calledFunction === "convert_currency";

    if (!pickedCorrectTool) {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: `Wrong tool selected: ${calledFunction} (expected convert_currency)` };
    }

    try {
      const args = JSON.parse(toolCalls[0].function.arguments);
      const correctAmount = args.amount === 500;
      const correctFrom = args.from_currency?.toUpperCase() === "SEK";
      const correctTo = args.to_currency?.toUpperCase() === "EUR";

      return {
        success: true,
        curlCommand,
        response: data,
        tokensPerSecond: calculateTPS(data, duration),
        message: `Correct tool! amount=${args.amount}${correctAmount ? "✓" : "✗"} from=${args.from_currency}${correctFrom ? "✓" : "✗"} to=${args.to_currency}${correctTo ? "✓" : "✗"}`,
      };
    } catch {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Correct tool but failed to parse arguments" };
    }
  } catch (error) {
    return { success: false, curlCommand, errorCode: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Advanced Tool Use Level 4: Complex nested schema with arrays and objects
export async function testToolUseComplexSchema(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "Create an order for customer 'Anna Svensson' (email: anna@example.com) with 2 items: 3x 'Wireless Mouse' at 299 SEK each, and 1x 'USB-C Hub' at 599 SEK. Apply a 10% discount. Shipping to Kungsgatan 1, Stockholm, 11143, Sweden. Use the create_order tool.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content: "You are an order management assistant. You MUST use the provided tools. Fill in all required fields accurately based on the user's request.",
      },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "create_order",
          description: "Create a new order with customer info, items, and shipping details",
          parameters: {
            type: "object",
            properties: {
              customer: {
                type: "object",
                description: "Customer information",
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                },
                required: ["name", "email"],
              },
              items: {
                type: "array",
                description: "List of order items",
                items: {
                  type: "object",
                  properties: {
                    product_name: { type: "string" },
                    quantity: { type: "integer", minimum: 1 },
                    unit_price: { type: "number", description: "Price per unit in SEK" },
                  },
                  required: ["product_name", "quantity", "unit_price"],
                },
                minItems: 1,
              },
              shipping_address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  postal_code: { type: "string" },
                  country: { type: "string" },
                },
                required: ["street", "city", "postal_code", "country"],
              },
              discount: {
                type: "object",
                description: "Optional discount",
                properties: {
                  type: { type: "string", enum: ["percentage", "fixed_amount"] },
                  value: { type: "number" },
                },
                required: ["type", "value"],
              },
              notes: { type: "string", description: "Optional order notes" },
            },
            required: ["customer", "items", "shipping_address"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, curlCommand, response: data, errorCode: response.status.toString(), message: "API request failed" };
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls?.length) {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Model did not use tools" };
    }

    try {
      const args = JSON.parse(toolCalls[0].function.arguments);
      const checks: string[] = [];
      let score = 0;
      const total = 6;

      // Check customer
      if (args.customer?.name && args.customer?.email) { score++; checks.push("customer✓"); } else { checks.push("customer✗"); }

      // Check items is array with 2 items
      if (Array.isArray(args.items) && args.items.length === 2) { score++; checks.push("items(2)✓"); } else { checks.push(`items(${Array.isArray(args.items) ? args.items.length : 0})✗`); }

      // Check item quantities
      const mouse = args.items?.find((i: any) => i.product_name?.toLowerCase().includes("mouse"));
      const hub = args.items?.find((i: any) => i.product_name?.toLowerCase().includes("hub") || i.product_name?.toLowerCase().includes("usb"));
      if (mouse?.quantity === 3) { score++; checks.push("qty-mouse✓"); } else { checks.push("qty-mouse✗"); }
      if (hub?.quantity === 1) { score++; checks.push("qty-hub✓"); } else { checks.push("qty-hub✗"); }

      // Check shipping address
      if (args.shipping_address?.street && args.shipping_address?.city && args.shipping_address?.postal_code) { score++; checks.push("shipping✓"); } else { checks.push("shipping✗"); }

      // Check discount
      if (args.discount?.type === "percentage" && args.discount?.value === 10) { score++; checks.push("discount✓"); } else { checks.push("discount✗"); }

      return {
        success: score >= 4,
        curlCommand,
        response: data,
        tokensPerSecond: calculateTPS(data, duration),
        message: `Schema score: ${score}/${total} — ${checks.join(" ")}`,
      };
    } catch {
      return { success: false, curlCommand, response: data, tokensPerSecond: calculateTPS(data, duration), message: "Failed to parse tool arguments" };
    }
  } catch (error) {
    return { success: false, curlCommand, errorCode: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Advanced Tool Use Level 5: Parallel tool calls - model should call multiple tools
export async function testToolUseParallel(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "I need three things at once: 1) What's the weather in Stockholm? 2) Convert 1000 SEK to USD. 3) Translate 'Hello, how are you?' to Swedish. Use ALL three tools in a single response.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. You MUST call ALL relevant tools in a single response. Call multiple tools simultaneously when the user asks for multiple things.",
      },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
        },
      },
      {
        type: "function",
        function: {
          name: "convert_currency",
          description: "Convert currency",
          parameters: {
            type: "object",
            properties: {
              amount: { type: "number" },
              from_currency: { type: "string" },
              to_currency: { type: "string" },
            },
            required: ["amount", "from_currency", "to_currency"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "translate_text",
          description: "Translate text between languages",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" },
              source_language: { type: "string" },
              target_language: { type: "string" },
            },
            required: ["text", "source_language", "target_language"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, curlCommand, response: data, errorCode: response.status.toString(), message: "API request failed" };
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    const calledTools = toolCalls.map((tc: any) => tc.function.name);
    const uniqueTools = new Set(calledTools);

    const hasWeather = calledTools.includes("get_weather");
    const hasCurrency = calledTools.includes("convert_currency");
    const hasTranslate = calledTools.includes("translate_text");

    return {
      success: uniqueTools.size >= 3,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      message: `${uniqueTools.size}/3 parallel calls: weather${hasWeather ? "✓" : "✗"} currency${hasCurrency ? "✓" : "✗"} translate${hasTranslate ? "✓" : "✗"}`,
    };
  } catch (error) {
    return { success: false, curlCommand, errorCode: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function testJsonSupport(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    'Please return a valid JSON object with exactly one field called "test" that has the boolean value true. Your response should be only the JSON object, nothing else.',
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: "API request failed",
      };
    }

    try {
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || "");
      const parsed = JSON.parse(content || "{}");
      const success = parsed.test === true;

      return {
        success,
        curlCommand,
        response: data,
        tokensPerSecond: calculateTPS(data, duration),
        message: success ? "JSON response valid" : "JSON response invalid",
      };
    } catch {
      return {
        success: false,
        curlCommand,
        response: data,
        message: "Failed to parse JSON response",
      };
    }
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testJsonSchema(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      email: { type: "string" },
    },
    required: ["name", "age", "email"],
    additionalProperties: false,
  };

  const userPrompt = formatPrompt(
    'Generate a person profile as JSON with exactly these fields: name (string), age (number), email (string). Use: name "John Doe", age 30, email "john@example.com". Return only valid JSON with no additional fields.',
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_object",
    },
    max_tokens: 500,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: "API request failed",
      };
    }

    try {
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || "");
      const parsed = JSON.parse(content || "{}");

      const hasName = typeof parsed.name === "string" && parsed.name.length > 0;
      const hasAge = typeof parsed.age === "number";
      const hasEmail = typeof parsed.email === "string" && parsed.email.length > 0;
      const noExtraProps = Object.keys(parsed).length === 3;

      const success = hasName && hasAge && hasEmail && noExtraProps;

      return {
        success,
        curlCommand,
        response: data,
        tokensPerSecond: calculateTPS(data, duration),
        message: success ? "JSON schema validation successful" : "Response does not match schema",
      };
    } catch {
      return {
        success: false,
        curlCommand,
        response: data,
        message: "Failed to parse JSON response",
      };
    }
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testBasicCompletion(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt('Hello, please respond with "Test successful"', model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_tokens: 500,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;
    const rawContent = data.choices?.[0]?.message?.content || "";
    const content = stripThinkingBlocks(rawContent);
    const success = response.ok && content.includes("Test successful");

    return {
      success,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? "Basic completion test successful" : "Model did not respond correctly",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testTPS(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt(
    "Write a detailed explanation of how neural networks work, including the concepts of layers, weights, biases, activation functions, backpropagation, and gradient descent. Please provide a comprehensive response with examples. Format your response as markdown with headers, bullet points, and code examples where appropriate.",
    model.id,
  );
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_tokens: 1000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: "API request failed",
      };
    }

    const completionTokens = data?.usage?.completion_tokens || 0;
    const tps = calculateTPS(data, duration);
    const rawContent = data.choices?.[0]?.message?.content || "";
    const content = stripThinkingBlocks(rawContent);
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content || "";
    const hasContent = content.length > 100 || reasoningContent.length > 100;

    return {
      success: hasContent && tps !== undefined,
      curlCommand,
      response: data,
      tokensPerSecond: tps,
      message: tps
        ? `TPS: ${tps} tok/s (${completionTokens} tokens i ${(duration / 1000).toFixed(1)}s)`
        : "Kunde inte beräkna TPS",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testStreamingSupport(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const userPrompt = formatPrompt("Hello", model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    stream: true,
    max_tokens: 200,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: "Streaming request failed",
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        curlCommand,
        message: "No readable stream",
      };
    }

    const { value } = await reader.read();
    reader.releaseLock();

    if (!value) {
      return {
        success: false,
        curlCommand,
        message: "Empty stream response",
      };
    }

    const chunk = new TextDecoder().decode(value);
    const success = chunk.includes("data: {") && (chunk.includes('"choices"') || chunk.includes('"delta"'));

    return {
      success,
      curlCommand,
      response: chunk,
      message: success ? "Streaming test successful" : "Invalid streaming format",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
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
      curlCommand: "",
      errorCode: "IMAGE_ENCODING_ERROR",
      message: "Failed to encode test image",
    };
  }

  const textPrompt = formatPrompt("What do you see in this image? Please describe it briefly.", model.id);
  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: textPrompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 300,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    const rawContent = data.choices?.[0]?.message?.content || "";
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
      "don't see",
    ];

    const contentLower = content.toLowerCase();
    const modelDidNotSeeImage = imageNotSeenPhrases.some((phrase) => contentLower.includes(phrase));
    const success = response.ok && content.length > 0 && !modelDidNotSeeImage;

    return {
      success,
      curlCommand,
      response: data,
      tokensPerSecond: calculateTPS(data, duration),
      errorCode: response.ok ? undefined : response.status.toString(),
      message: modelDidNotSeeImage
        ? "Model did not receive or process the image"
        : success
          ? "Multimodal test successful"
          : "Model did not process image",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testOCR(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const isDocling = model.id.toLowerCase().includes("docling");

  if (isDocling) {
    // Use dedicated /v1/ocr endpoint for Docling
    const testDocumentUrl = "https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg";

    const requestBody = {
      document: {
        url: testDocumentUrl,
        type: "document",
      },
      options: {
        tableMode: "accurate",
        ocrMethod: "easyocr",
        outputFormat: "md",
      },
    };

    const ocrBaseUrl = baseUrl.replace(/\/v1$/, "");

    const curlCommand = `curl -X POST "${ocrBaseUrl}/v1/ocr" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    const startTime = Date.now();

    try {
      const response = await fetch(`${ocrBaseUrl}/v1/ocr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
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
          message: `Docling OCR request failed: ${data.error || response.statusText}`,
        };
      }

      const content = data.content || data.markdown || "";
      const hasContent = content.length > 0;

      return {
        success: hasContent,
        curlCommand,
        response: data,
        errorCode: hasContent ? undefined : "NO_CONTENT",
        message: hasContent
          ? `Docling OCR successful - extracted ${content.length} chars in ${duration}ms`
          : "No content extracted from document",
      };
    } catch (error) {
      return {
        success: false,
        curlCommand,
        errorCode: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  } else {
    // Use chat/completions endpoint for vision-based OCR (e.g., deepseek-ocr)
    const receiptImageUrl =
      "https://ofasys-multimodal-wlcb-3-toshanghai.oss-accelerate.aliyuncs.com/wpf272043/keepme/image/receipt.png";

    const requestBody = {
      model: model.id,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: receiptImageUrl,
              },
            },
            {
              type: "text",
              text: formatPrompt("Free OCR.", model.id),
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.0,
    };

    const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    const startTime = Date.now();

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
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
          message: "API request failed",
        };
      }

      const rawContent = data.choices?.[0]?.message?.content || "";
      const content = stripThinkingBlocks(rawContent);

      const hasTableMarkup = content.includes("<td>") || content.includes("</td>") || content.includes("<table>");
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
            ? "No OCR output received"
            : "OCR output may be incomplete or invalid",
      };
    } catch (error) {
      return {
        success: false,
        curlCommand,
        errorCode: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export async function testEmbedding(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    input: "Test embedding text",
  };

  const curlCommand = `curl -X POST "${baseUrl}/embeddings" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const success =
      response.ok && Array.isArray(data.data) && data.data.length > 0 && Array.isArray(data.data[0].embedding);

    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? "Embedding test successful" : "Invalid embedding response",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testReranking(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const requestBody = {
    model: model.id,
    query: "What is artificial intelligence?",
    documents: [
      "Artificial intelligence is a branch of computer science",
      "Machine learning is a subset of AI",
      "Weather is sunny today",
    ],
  };

  const curlCommand = `curl -X POST "${baseUrl}/rerank" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

  try {
    const response = await fetch(`${baseUrl}/rerank`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
      message: success ? "Reranking test successful" : "Invalid reranking response",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
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
    const audioBlob = new Blob([buffer], { type: "audio/wav" });
    formData.append("file", audioBlob, "test.wav");
    formData.append("model", model.id);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const data = await response.json();
    const success = response.ok && typeof data.text === "string";

    return {
      success,
      curlCommand,
      response: data,
      errorCode: response.ok ? undefined : response.status.toString(),
      message: success ? "Speech-to-text test successful" : "Invalid transcription response",
    };
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testLongContextJson(model: Model, apiKey: string, baseUrl: string): Promise<TestDetail> {
  const systemPrompt = `You are an expert meeting analyst. Analyze the provided meeting transcription and extract structured information.
Return a JSON object with exactly these fields:
- summary: A 2-3 sentence summary of the meeting
- attendees: An array of objects with name and role fields for each person who spoke
- key_metrics: An object containing any numerical metrics mentioned (revenue, growth rates, etc)
- action_items: An array of strings listing any action items or next steps mentioned
- topics_discussed: An array of strings listing the main topics covered`;

  const userPrompt = formatPrompt(
    `Please analyze this meeting transcription and return the results as JSON:\n\n${LONG_TRANSCRIPTION}`,
    model.id,
  );

  const requestBody = {
    model: model.id,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 4000,
  };

  const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer ${apiKey.substring(0, 10)}..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      ...requestBody,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "[LONG TRANSCRIPTION ~8000 tokens]" },
      ],
    },
    null,
    2,
  )}'`;

  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        message: `API request failed: ${data.error?.message || response.statusText}`,
      };
    }

    try {
      const rawContent = data.choices?.[0]?.message?.content;
      const content = stripThinkingBlocks(rawContent || "");
      const parsed = JSON.parse(content || "{}");

      // Validate expected structure
      const hasSummary = typeof parsed.summary === "string" && parsed.summary.length > 0;
      const hasAttendees = Array.isArray(parsed.attendees) && parsed.attendees.length > 0;
      const hasKeyMetrics = typeof parsed.key_metrics === "object" && Object.keys(parsed.key_metrics).length > 0;
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
          : `JSON structure incomplete (${validFields}/5 fields valid)`,
      };
    } catch (parseError) {
      return {
        success: false,
        curlCommand,
        response: data,
        message: `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      curlCommand,
      errorCode: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
