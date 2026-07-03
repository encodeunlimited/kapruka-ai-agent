import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '..')));
const openai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    maxRetries: 5
});

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    maxRetries: 5
});

const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-dummy',
    baseURL: 'https://openrouter.ai/api/v1',
    maxRetries: 5
});

const gemini = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    maxRetries: 5
});

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const OPENROUTER_MODELS = ['z-ai/glm-4.5-air:free', 'z-ai/glm-4.5-air'];
const GEMINI_MODELS = [
    'gemini-2.5-flash', 
    'gemini-1.5-flash', 
    'gemini-2.5-pro', 
    'gemini-1.5-pro', 
    'gemini-2.0-flash',
    'models/gemini-2.5-flash',
    'models/gemini-flash-latest',
    'models/gemini-2.5-pro',
    'models/gemini-pro-latest',
    'models/gemini-2.0-flash'
];

let cachedCloudflareAccountId: string | null = null;

async function getCloudflareAccountId(): Promise<string> {
    if (cachedCloudflareAccountId) return cachedCloudflareAccountId;
    if (process.env.CLOUDFLARE_ACCOUNT_ID) {
        cachedCloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        return cachedCloudflareAccountId;
    }
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
        throw new Error("CLOUDFLARE_API_TOKEN is not configured in .env");
    }
    
    try {
        console.log("📡 Fetching Cloudflare Account ID dynamically...");
        const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data: any = await res.json();
        if (data.success && data.result && data.result.length > 0) {
            cachedCloudflareAccountId = data.result[0].id;
            console.log(`✅ Dynamically retrieved Cloudflare Account ID: ${cachedCloudflareAccountId}`);
            return cachedCloudflareAccountId!;
        }
        throw new Error(data.errors?.[0]?.message || "No accounts found");
    } catch (e: any) {
        console.error("❌ Failed to fetch Cloudflare Account ID:", e.message || e);
        throw e;
    }
}

function isGroqModel(model: string): boolean {
    return GROQ_MODELS.includes(model);
}

function isOpenRouterModel(model: string): boolean {
    return OPENROUTER_MODELS.includes(model);
}

function isGeminiModel(model: string): boolean {
    return GEMINI_MODELS.includes(model);
}

function isCloudflareModel(model: string): boolean {
    return model.startsWith('@cf/');
}

function sanitizeMessagesForCloudflare(messages: any[]): any[] {
    const sanitized: any[] = [];
    for (const msg of messages) {
        if (msg.role === 'assistant' && msg.tool_calls) {
            const toolCallNames = msg.tool_calls.map((tc: any) => tc.function?.name || 'tool').join(', ');
            sanitized.push({
                role: 'assistant',
                content: msg.content || `[Executing tool(s): ${toolCallNames}]`
            });
        } else if (msg.role === 'tool') {
            sanitized.push({
                role: 'user',
                content: `[Tool result for ${msg.name || 'tool'}]: ${msg.content}`
            });
        } else {
            sanitized.push({
                role: msg.role,
                content: msg.content === null || msg.content === undefined ? "" : msg.content
            });
        }
    }
    return sanitized;
}

async function callLLM(model: string, params: any, retries = 5, delay = 2000): Promise<any> {
    const isGroq = isGroqModel(model);
    const isOpenRouter = isOpenRouterModel(model);
    const isCloudflare = isCloudflareModel(model);
    const isGemini = isGeminiModel(model);
    
    let client;
    const payload: any = {
        ...params,
        model: model
    };

    if (isGroq) {
        client = groq;
    } else if (isOpenRouter) {
        client = openrouter;
    } else if (isGemini) {
        client = gemini;
        if (!model.startsWith('models/')) {
            if (model === 'gemini-2.5-flash') payload.model = 'models/gemini-2.5-flash';
            else if (model === 'gemini-1.5-flash') payload.model = 'models/gemini-flash-latest';
            else if (model === 'gemini-2.5-pro') payload.model = 'models/gemini-2.5-pro';
            else if (model === 'gemini-1.5-pro') payload.model = 'models/gemini-pro-latest';
            else if (model === 'gemini-2.0-flash') payload.model = 'models/gemini-2.0-flash';
        }
    } else if (isCloudflare) {
        const accountId = await getCloudflareAccountId();
        client = new OpenAI({
            apiKey: process.env.CLOUDFLARE_API_TOKEN,
            baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
            maxRetries: 5
        });

        // Apply Cloudflare message formatting and compatibility fixes
        payload.messages = sanitizeMessagesForCloudflare(params.messages);
        
        // Strip the tools parameter in subsequent iterations if a tool was executed
        const lastMsg = payload.messages[payload.messages.length - 1];
        if (lastMsg && lastMsg.content && lastMsg.content.includes('[Tool result for')) {
            delete payload.tools;
            delete payload.tool_choice;
        }
    } else {
        client = openai;
    }

    try {
        return await client.chat.completions.create(payload);
    } catch (error: any) {
        if (error.status === 429 && retries > 0) {
            const providerName = isGroq ? 'GROQ' : (isOpenRouter ? 'OpenRouter' : (isGemini ? 'Google' : (isCloudflare ? 'Cloudflare' : 'NVIDIA')));
            console.warn(`⚠️ ${providerName} Rate Limit hit (429) for model ${model}. Retrying in ${delay / 1000}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callLLM(model, params, retries - 1, delay * 1.5);
        }
        throw error;
    }
}

async function callLLMWithFallback(
    selectedModel: string,
    params: {
        messages: any[];
        tools?: any[];
        tool_choice?: any;
    }
): Promise<{ response: any; usedModel: string }> {
    let modelSequence: string[] = [];

    const standardSequence = [
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'llama-3.3-70b-versatile',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'qwen/qwen3-32b',
        'llama-3.1-8b-instant',
        'meta/llama-3.3-70b-instruct'
    ];

    if (selectedModel === 'auto-pick' || !selectedModel) {
        modelSequence = [...standardSequence];
    } else {
        modelSequence = [selectedModel];
        for (const model of standardSequence) {
            if (model !== selectedModel) {
                modelSequence.push(model);
            }
        }
    }

    let lastError: any = null;
    for (const model of modelSequence) {
        try {
            console.log(`🤖 Attempting LLM call with model: ${model}`);
            const response = await callLLM(model, params);
            console.log(`✅ LLM call successful with model: ${model}`);
            return { response, usedModel: model };
        } catch (error: any) {
            lastError = error;
            console.error(`❌ Model [${model}] failed:`, error.message || error);
        }
    }

    throw lastError || new Error("All LLM models in fallback sequence failed.");
}

function resolveRefs(schema: any, defs?: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    
    const currentDefs = schema.$defs || defs;
    
    if (schema.$ref) {
        const refPath = schema.$ref;
        if (refPath.startsWith('#/$defs/') && currentDefs) {
            const defName = refPath.replace('#/$defs/', '');
            const resolved = currentDefs[defName];
            if (resolved) {
                return resolveRefs(resolved, currentDefs);
            }
        }
    }
    
    const newSchema: any = Array.isArray(schema) ? [] : {};
    for (const key in schema) {
        if (key === '$defs') continue;
        newSchema[key] = resolveRefs(schema[key], currentDefs);
    }
    return newSchema;
}

function flattenToolSchema(schema: any): any {
    if (schema && schema.type === 'object' && schema.properties && schema.properties.params) {
        const paramsSchema = schema.properties.params;
        return {
            type: 'object',
            properties: paramsSchema.properties || {},
            required: paramsSchema.required || [],
            $defs: schema.$defs || paramsSchema.$defs
        };
    }
    return schema;
}

function sanitizeArgs(args: any): any {
    if (!args || typeof args !== 'object') return args;
    
    if (Array.isArray(args)) {
        return args.map(item => sanitizeArgs(item));
    }
    
    const clean: any = {};
    for (const key in args) {
        const val = args[key];
        if (val === 'null' || val === 'undefined' || val === null || val === undefined) {
            continue;
        }
        if (typeof val === 'object') {
            clean[key] = sanitizeArgs(val);
        } else {
            clean[key] = val;
        }
    }
    return clean;
}

// Initialize Client
const mcpClient = new Client(
    { name: 'kapruka-shopping-agent', version: '2.0.0' },
    { capabilities: { tools: {} } } as any
);

let isMcpConnected = false;

async function initMcp() {
    try {
        const targetUrl = `https://mcp.kapruka.com/mcp`;
        
        console.log(`🔄 Attempting to connect to Kapruka MCP at: ${targetUrl}`);
        
        const transport = new StreamableHTTPClientTransport(new URL(targetUrl), {
            requestInit: {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
                }
            }
        }); 
        
        await mcpClient.connect(transport);
        isMcpConnected = true;
        console.log(`✅ Connected smoothly to Kapruka MCP Server. Session ID: ${transport.sessionId}`);
    } catch (error: any) {
        isMcpConnected = false;
        console.error('❌ MCP Connection failed:', error.message || error);
    }
}

// Start connection asynchronously
initMcp();

const SYSTEM_PROMPT = `
You are Sri Lanka's most advanced, helpful, and charming AI Shopping Agent, powered by Kapruka. 
Your goal is to guide users smoothly from product discovery to complete checkout. 

CRITICAL RULES:
1. Always present items beautifully. To make card creation blazing fast, you MUST list each product using the short block template below:
:::product
id: [Product ID from the tool's id property]
:::
DO NOT write the title, price, availability, image, or link fields inside the block. Just write the 'id' field. The server will automatically expand it to a premium product card. DO NOT use plain text, bullet points (* or -), numbered lists, or standard markdown lists for products. If you do not use the :::product block template, the user's interface will NOT show the cards at all! NEVER write the product ID (e.g., 'product id: ...', 'ID: ...', or the ID string itself) in the plain text part of your response. Product IDs are internal metadata and MUST NOT be shown directly to the user in text. Only use them inside the :::product blocks.
2. Support Tanglish (e.g., "machan meka hoda da?") seamlessly. Maintain a warm, friendly Sri Lankan tone. You MUST output friendly, conversational Sri Lankan/Tanglish text *before* rendering the :::product block. Never abruptly output the product card UI without a greeting or transition.
3. Manage a multi-item cart if the user asks. If the user explicitly confirms they want to add an item to their cart or buy an item, you must autonomously execute a background search for a complementary item (e.g., greeting card, watch box, or chocolates) and gracefully suggest it in your response.
4. When users are ready, ask for their address to quote delivery, then generate the checkout link.
5. NEVER call checkout or order creation tools (like 'kapruka_create_order') with placeholder, mock, or hallucinated values. You MUST explicitly ask the user for their address, recipient name, phone number, and delivery date first, and only call 'kapruka_create_order' once they have provided these details.
6. When the user asks to search or see products (e.g. "show me", "pennanna"), you MUST search for the products using 'kapruka_search_products', present the results using the ':::product' block template, and STOP to wait for the user's response. Do NOT call 'kapruka_create_order' or check delivery until the user selects a product and explicitly asks to order it.
7. You MUST NOT make multiple parallel tool calls in a single response (to prevent API errors). Instead, if a multi-step workflow is needed, perform a single tool call, wait for the result, and then immediately call the next tool in a sequential loop.
8. The search query parameter 'q' for 'kapruka_search_products' must contain a valid keyword of at least 3 characters. Never call the search tool with an empty string ('') or generic/meaningless query.
9. THE BUDGET BUNDLE ARCHITECT: If a user specifies a budget and an occasion (e.g., '15,000 LKR for a birthday'), DO NOT just search for one item. You must act as an event planner. Autonomously execute multiple 'kapruka_search_products' calls (sequentially) to build a cohesive bundle (e.g., a cake, flowers, and a gift). Present the final bundle with a calculated total that strictly respects the user's budget. Format all search results using the ':::product' block template.
10. STRICTLY NO HALLUCINATIONS OR MANUAL PRODUCT CREATION: You MUST only suggest products that were returned by the Kapruka tool calls.
11. PANIC MODE (Urgency & Emotion Detection): Monitor the user's input for urgency, panic, or last-minute requests (e.g., 'forgot', 'today', 'urgent', 'ASAP'). If detected, immediately shift your tone to be highly reassuring and fast-paced ('Don't panic machan, I've got you covered!'). Autonomously append 'in_stock_only: true' to all searches and prioritize items with fast delivery.
12. IMAGE SEARCH: Analyze uploaded images, extract visual keywords (e.g., 'blue dial silver watch'), and autonomously use the kapruka_search_products tool to find it.
13. COMPARISON TABLES: If a user asks to compare two or more products, output a beautifully formatted Markdown table comparing their Price, Stock Status, and Key Features before asking which one they prefer.
14. PRE-EMPTIVE DELIVERY INTELLIGENCE: Actively remember any location data the user mentions. If the user's city is known, and they show interest in a specific product, you must silently execute the 'kapruka_check_delivery' tool in the background BEFORE they ask about delivery. Append the delivery feasibility seamlessly into your product presentation (e.g., 'Good news, I checked and we can deliver this to Colombo 03 by tomorrow').
15. CONTEXT INTERRUPTION & ORDER TRACKING: Users will interrupt you. If you are in the middle of building a cart and the user suddenly asks about a past order (e.g., 'Did my cake from yesterday arrive?'), immediately pause the shopping context, execute 'kapruka_track_order', report the status, and then smoothly pivot back to the previous shopping conversation.
`;

app.post('/api/chat', async (req: Request, res: Response): Promise<any> => {
    const { messages, model, clientProfile } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages format' });
    }

    // 🛡️ GRACEFUL FALLBACK
    if (!isMcpConnected) {
        return res.status(503).json({ 
            reply: "Machan, the Kapruka live inventory connection is currently restarting. Give me a second and try asking again!" 
        });
    }

    try {
        const mcpToolsResponse = await mcpClient.listTools();
        
        const openAiTools = mcpToolsResponse.tools.map((tool) => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: flattenToolSchema(resolveRefs(tool.inputSchema)),
            },
        }));

        let activeSystemPrompt = SYSTEM_PROMPT;
        if (clientProfile && Object.keys(clientProfile).length > 0) {
            activeSystemPrompt += `\n\nCLIENT PROFILE MEMORY:\nThe user has previously used the following delivery details: ${JSON.stringify(clientProfile)}. If the user profile contains past addresses or details, proactively offer to use them to save time.`;
        }

        let chatMessages = [
            { role: 'system', content: activeSystemPrompt },
            ...messages
        ];

        const selectedModel = model || 'meta/llama-3.3-70b-instruct';

        const validProducts = new Map<string, any>();
        // Scan historical messages for valid products
        messages.forEach((msg: any) => {
            if (msg.content) {
                const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                if (msg.role === 'tool') {
                    try {
                        const parsed = JSON.parse(contentStr);
                        if (parsed && Array.isArray(parsed.results)) {
                            parsed.results.forEach((prod: any) => {
                                if (prod && prod.id) {
                                    validProducts.set(prod.id.trim(), prod);
                                }
                            });
                        }
                    } catch (e) {
                        // Regex fallback for markdown/text content
                        const idRegex = /ID:\s*`([^`]+)`|id:\s*"([^"]+)"/gi;
                        let match;
                        while ((match = idRegex.exec(contentStr)) !== null) {
                            const foundId = (match[1] || match[2] || '').trim();
                            if (foundId) {
                                validProducts.set(foundId, { id: foundId, name: foundId });
                            }
                        }
                    }
                } else if (msg.role === 'assistant') {
                    // Extract from expanded or short product blocks
                    const productRegex = /:::product\s*([\s\S]*?)\s*:::/gi;
                    let match;
                    while ((match = productRegex.exec(contentStr)) !== null) {
                        const blockContent = match[1];
                        const idMatch = /id:\s*([^\n\r]+)/i.exec(blockContent);
                        const titleMatch = /title:\s*([^\n\r]+)/i.exec(blockContent);
                        const priceMatch = /price:\s*([^\n\r]+)/i.exec(blockContent);
                        const availabilityMatch = /availability:\s*([^\n\r]+)/i.exec(blockContent);
                        const imageMatch = /image:\s*([^\n\r]+)/i.exec(blockContent);
                        const linkMatch = /link:\s*([^\n\r]+)/i.exec(blockContent);
                        
                        if (idMatch) {
                            const id = idMatch[1].replace(/^["'`]|["'`]$/g, '').trim();
                            const title = titleMatch ? titleMatch[1].replace(/^["'`]|["'`]$/g, '').trim() : id;
                            const priceStr = priceMatch ? priceMatch[1].replace(/^["'`]|["'`]$/g, '').trim() : '';
                            const avail = availabilityMatch ? availabilityMatch[1].replace(/^["'`]|["'`]$/g, '').trim() : '';
                            const image = imageMatch ? imageMatch[1].replace(/^["'`]|["'`]$/g, '').trim() : '';
                            const link = linkMatch ? linkMatch[1].replace(/^["'`]|["'`]$/g, '').trim() : '';
                            
                            let priceAmount = 0;
                            if (priceStr) {
                                const cleaned = priceStr.replace(/[^\d.]/g, '');
                                priceAmount = parseFloat(cleaned) || 0;
                            }
                            
                            validProducts.set(id, {
                                id: id,
                                name: title,
                                price: { amount: priceAmount, currency: 'LKR' },
                                in_stock: !avail.toLowerCase().includes('out'),
                                stock_level: avail.toLowerCase().includes('low') ? 'low' : 'high',
                                image_url: image,
                                url: link
                            });
                        }
                    }
                }
            }
        });

        let llmResult;
        try {
            llmResult = await callLLMWithFallback(selectedModel, {
                messages: chatMessages,
                tools: openAiTools.length > 0 ? openAiTools : undefined,
                tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
            });
        } catch (fallbackError: any) {
            console.error(`❌ Critical: All LLM models and fallbacks failed:`, fallbackError);
            return res.status(500).json({ error: `Machan, all AI models are currently offline. Please try again in a moment!` });
        }

        let response = llmResult.response;
        let activeModel = llmResult.usedModel;

        let responseMessage = response.choices[0].message;

        // Loop for tool execution
        while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            // Guard: Enforce single tool-call limit to prevent NVIDIA API 400 Bad Request error
            if (responseMessage.tool_calls.length > 1) {
                console.warn(`⚠️ Model returned ${responseMessage.tool_calls.length} tool calls. Enforcing single tool call limit.`);
                responseMessage.tool_calls = [responseMessage.tool_calls[0]];
            }

            chatMessages.push(responseMessage as any);

            for (const toolCall of responseMessage.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);
                const cleanedArgs = sanitizeArgs(toolArgs);

                // Auto-wrap arguments in "params" if missing (compatibility layer for strict/lax model generation)
                let mcpArgs = cleanedArgs;
                if (cleanedArgs && typeof cleanedArgs === 'object' && !cleanedArgs.params) {
                    mcpArgs = { params: cleanedArgs };
                    console.log(`🔧 Auto-wrapped tool arguments in 'params':`, JSON.stringify(mcpArgs));
                }

                // Force response_format to JSON for search results to ensure we always get direct image URLs
                if (toolName === 'kapruka_search_products') {
                    if (!mcpArgs.params) {
                        mcpArgs.params = {};
                    }
                    mcpArgs.params.response_format = 'json';
                }

                console.log(`📡 Executing Kapruka tool [${toolName}] with args:`, JSON.stringify(mcpArgs));

                // Introduce a 1-second delay between sequential tool calls to prevent rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));

                let rawContent = '';
                try {
                    const toolResult = await mcpClient.callTool({
                        name: toolName,
                        arguments: mcpArgs,
                    });

                    console.log(`🔌 Tool [${toolName}] returned:`, JSON.stringify(toolResult));

                    // Extract raw text block content if available, otherwise stringify the content array
                    const contentArray = toolResult.content as any[];
                    rawContent = contentArray && contentArray[0]?.text !== undefined
                        ? contentArray[0].text
                        : JSON.stringify(toolResult.content);
                } catch (toolError: any) {
                    console.error(`❌ Tool execution failed [${toolName}]:`, toolError);
                    rawContent = `Error: The Kapruka live inventory is temporarily busy or rate limited. (Detail: ${toolError.message || toolError}). Suggest to customer that we can try again shortly or suggest a different category.`;
                }

                chatMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: rawContent,
                } as any);

                if (toolName === 'kapruka_search_products') {
                    try {
                        const parsed = JSON.parse(rawContent);
                        if (parsed && Array.isArray(parsed.results)) {
                            parsed.results.forEach((prod: any) => {
                                if (prod && prod.id) {
                                    validProducts.set(prod.id.trim(), prod);
                                }
                            });
                        }
                    } catch (e) {
                        // Regex parsing for Markdown formatting from tool output
                        const productRegex = /\*\*[\d]+\.\s*([^*]+)\*\*\s*\r?\n\s*ID:\s*`([^`]+)`\s*·\s*(?:LKR|Rs\.?)\s*([\d,]+)\s*·\s*([^\r\n·]+)(?:·\s*([^\r\n]+))?\s*\r?\n\s*\[View product\]\(([^)]+)\)/gi;
                        let match;
                        while ((match = productRegex.exec(rawContent)) !== null) {
                            const name = match[1].trim();
                            const id = match[2].trim();
                            const priceAmount = parseFloat(match[3].replace(/,/g, ''));
                            const stockStatus = match[4].trim();
                            const url = match[6] ? match[6].trim() : '';
                            
                            // Reconstruct standard image URL from the ID
                            let image_url = 'images.png';
                            if (id.match(/^[a-zA-Z]+[0-9]+$/)) {
                                image_url = `https://www.kapruka.com/product-image/width=330,quality=93,f=auto/shops/specialGifts/productImages/${id.toLowerCase()}.jpg`;
                            } else if (id.toLowerCase().startsWith('cake')) {
                                image_url = `https://www.kapruka.com/product-image/width=330,quality=93,f=auto/shops/cakes/productImages/zoom/${id.toLowerCase()}.jpg`;
                            }
                            
                            validProducts.set(id, {
                                id: id,
                                name: name,
                                price: { amount: priceAmount, currency: 'LKR' },
                                in_stock: !stockStatus.toLowerCase().includes('out'),
                                stock_level: stockStatus.toLowerCase().includes('low') ? 'low' : 'high',
                                image_url: image_url,
                                url: url
                            });
                        }
                        
                        // Fallback parsing just for IDs if the structured regex fails
                        if (validProducts.size === 0) {
                            const idRegex = /ID:\s*`([^`]+)`|id:\s*"([^"]+)"/gi;
                            let idMatch;
                            while ((idMatch = idRegex.exec(rawContent)) !== null) {
                                const foundId = (idMatch[1] || idMatch[2] || '').trim();
                                if (foundId) {
                                    validProducts.set(foundId, { id: foundId, name: foundId });
                                }
                            }
                        }
                    }

                    chatMessages.push({
                        role: 'system',
                        content: 'REMINDER: You MUST format EVERY product returned in the search results using the :::product template. DO NOT use plain text bullet points or standard markdown lists. Ensure all properties (id, title, price, availability, image, link) are exactly mapped from the JSON result.'
                    } as any);
                }
            }

            try {
                llmResult = await callLLMWithFallback(activeModel, {
                    messages: chatMessages,
                    tools: openAiTools,
                });
            } catch (fallbackError: any) {
                console.error(`❌ Critical: All LLM models failed in loop:`, fallbackError);
                return res.status(500).json({ error: `Machan, all AI models are currently offline. Please try again in a moment!` });
            }
            response = llmResult.response;
            activeModel = llmResult.usedModel;
            responseMessage = response.choices[0].message;
        }

        let finalReply = responseMessage.content || '';

        // 1. Extract and expand product blocks, replacing them with placeholders to shield them from raw ID filtering
        const productBlocks: string[] = [];
        if (finalReply.includes(':::product')) {
            const productBlockRegex = /:::product\s*([\s\S]*?)\s*:::/g;
            let blockIndex = 0;
            finalReply = finalReply.replace(productBlockRegex, (match: string, blockContent: string) => {
                const idMatch = /id:\s*([^\n\r]+)/i.exec(blockContent);
                if (idMatch) {
                    let extractedId = idMatch[1].trim();
                    extractedId = extractedId.replace(/^["'`]|["'`]$/g, '').trim();
                    
                    const productInfo = validProducts.get(extractedId);
                    if (productInfo) {
                        const priceVal = productInfo.price 
                            ? `${productInfo.price.currency || 'LKR'} ${productInfo.price.amount.toLocaleString()}`
                            : 'N/A';
                        const avail = productInfo.in_stock 
                            ? (productInfo.stock_level === 'low' ? 'Low Stock' : 'In Stock')
                            : 'Out of Stock';
                        
                        let cleanImage = productInfo.image_url || 'images.png';
                        const proxyPrefix = 'https://static2.kapruka.com/product-image/width=330,quality=93,f=auto/';
                        if (cleanImage.startsWith(proxyPrefix)) {
                            cleanImage = cleanImage.substring(proxyPrefix.length);
                        }
                        const nestedUrlIndex = cleanImage.indexOf('http', 1);
                        if (nestedUrlIndex > -1) {
                            cleanImage = cleanImage.substring(nestedUrlIndex);
                        }
                        if (cleanImage && !cleanImage.startsWith('http://') && !cleanImage.startsWith('https://') && !cleanImage.startsWith('//')) {
                            if (cleanImage.startsWith('/')) {
                                cleanImage = 'https://www.kapruka.com' + cleanImage;
                            } else {
                                cleanImage = 'https://www.kapruka.com/' + cleanImage;
                            }
                        }
                        
                        const expandedBlock = `:::product
id: ${productInfo.id}
title: ${productInfo.name}
price: ${priceVal}
availability: ${avail}
image: ${cleanImage}
link: ${productInfo.url || ''}
:::`;
                        productBlocks.push(expandedBlock);
                        const placeholder = `__PRODUCT_BLOCK_${blockIndex}__`;
                        blockIndex++;
                        return placeholder;
                    }
                }
                return ''; // Remove invalid/hallucinated blocks
            });
        }

        // 2. Filter plain text lines to remove raw product IDs and text mentions
        if (finalReply) {
            const productIds = Array.from(validProducts.keys());
            finalReply = finalReply
                .split('\n')
                .filter((line: string) => {
                    const trimmed = line.trim();
                    // Keep placeholders intact
                    if (trimmed.startsWith('__PRODUCT_BLOCK_') && trimmed.endsWith('__')) {
                        return true;
                    }
                    if (/product\s*id/i.test(trimmed)) {
                        return false;
                    }
                    for (const id of productIds) {
                        if (trimmed.includes(id)) {
                            return false;
                        }
                    }
                    return true;
                })
                .join('\n');
        }

        // 3. Clean up excessive blank lines (more than 2 consecutive newlines) to eliminate empty gaps
        finalReply = finalReply.replace(/\n{3,}/g, '\n\n');

        // 4. Restore the product blocks in place of placeholders
        productBlocks.forEach((block, index) => {
            finalReply = finalReply.replace(`__PRODUCT_BLOCK_${index}__`, block);
        });

        return res.json({ reply: finalReply });

    } catch (error: any) {
        console.error('Error handling chat iteration:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.get('/api/cities', async (req: Request, res: Response): Promise<any> => {
    if (!isMcpConnected) {
        return res.status(503).json({ error: 'Kapruka MCP Server not connected' });
    }
    const query = req.query.q ? String(req.query.q) : 'Colombo';
    try {
        const result = await mcpClient.callTool({
            name: 'kapruka_list_delivery_cities',
            arguments: {
                params: {
                    query: query
                }
            }
        });
        
        const contentArray = result.content as any[];
        const rawContent = contentArray && contentArray[0]?.text !== undefined
            ? contentArray[0].text
            : JSON.stringify(result.content);
            
        const cities: string[] = [];
        const cityRegex = /\*\*([^*]+)\*\*/g;
        let match;
        while ((match = cityRegex.exec(rawContent)) !== null) {
            cities.push(match[1].trim());
        }
        
        return res.json({ cities, raw: rawContent });
    } catch (error: any) {
        console.error('Error fetching cities:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.post('/api/tts', async (req: Request, res: Response): Promise<any> => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
        }

        console.log('🗣️ Calling Gemini TTS API...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gemini-3.1-flash-tts-preview",
                input: text,
                response_format: {
                   type: "audio"
                },
                generation_config: {
                  speech_config: [
                    { voice: "Kore" }
                  ]
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Gemini TTS Error:', errBody);
            return res.status(response.status).json({ error: 'Failed to generate speech' });
        }

        const data: any = await response.json();
        
        // Return the base64 audio data from the interaction
        const audioData = data?.steps?.[0]?.content?.[0]?.data;
        if (audioData) {
            return res.json({ audioBase64: audioData });
        } else {
            console.error('Invalid response structure:', JSON.stringify(data).substring(0, 500));
            return res.status(500).json({ error: 'Invalid response from Gemini TTS' });
        }

    } catch (error: any) {
        console.error('Error in /api/tts:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.post('/api/checkout', async (req: Request, res: Response): Promise<any> => {
    if (!isMcpConnected) {
        return res.status(503).json({ error: 'Kapruka MCP Server not connected' });
    }

    const { cart, recipient, delivery, sender, gift_message } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({ error: 'Cart is empty or invalid' });
    }
    if (!recipient || !recipient.name || !recipient.phone) {
        return res.status(400).json({ error: 'Recipient name and phone number are required' });
    }
    if (!delivery || !delivery.address || !delivery.city || !delivery.date) {
        return res.status(400).json({ error: 'Delivery address, city, and delivery date are required' });
    }
    if (!sender || !sender.name) {
        return res.status(400).json({ error: 'Sender name is required' });
    }

    try {
        console.log('📡 Calling kapruka_create_order with body:', JSON.stringify(req.body));
        
        const result = await mcpClient.callTool({
            name: 'kapruka_create_order',
            arguments: {
                params: {
                    cart: cart.map((item: any) => ({
                        product_id: item.product_id,
                        quantity: Number(item.quantity),
                        icing_text: item.icing_text || null
                    })),
                    recipient: {
                        name: recipient.name,
                        phone: recipient.phone
                    },
                    delivery: {
                        address: delivery.address,
                        city: delivery.city,
                        location_type: delivery.location_type || 'house',
                        date: delivery.date,
                        instructions: delivery.instructions || ''
                    },
                    sender: {
                        name: sender.name,
                        anonymous: !!sender.anonymous
                    },
                    gift_message: gift_message || null,
                    currency: 'LKR',
                    response_format: 'json'
                }
            }
        });

        console.log('🔌 kapruka_create_order response:', JSON.stringify(result));

        const contentArray = result.content as any[];
        const rawText = contentArray && contentArray[0]?.text !== undefined
            ? contentArray[0].text
            : JSON.stringify(result.content);
            
        if (rawText.includes('Error (') || rawText.toLowerCase().includes('error')) {
            try {
                const parsed = JSON.parse(rawText);
                if (parsed.error || parsed.errors) {
                    return res.status(400).json({ error: parsed.error || JSON.stringify(parsed.errors) });
                }
            } catch (e) {}
            return res.status(400).json({ error: rawText });
        }

        try {
            const parsed = JSON.parse(rawText);
            return res.json({ success: true, data: parsed, raw: rawText });
        } catch (e) {
            const urlMatch = rawText.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                return res.json({ success: true, redirect_url: urlMatch[0], raw: rawText });
            }
            return res.json({ success: true, raw: rawText });
        }
    } catch (error: any) {
        console.error('Error creating order:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Agent Gateway live on http://localhost:${PORT}`));