import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    maxRetries: 5
});

async function callNvidiaWithRetry(params: any, retries = 5, delay = 2000): Promise<any> {
    try {
        return await openai.chat.completions.create(params);
    } catch (error: any) {
        if (error.status === 429 && retries > 0) {
            console.warn(`⚠️ NVIDIA Rate Limit hit (429). Retrying in ${delay / 1000}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callNvidiaWithRetry(params, retries - 1, delay * 1.5);
        }
        throw error;
    }
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
1. Always present items beautifully. When you present one or more products to the user, you MUST format each product using the structured block template below so the UI can render it as a premium product card:
:::product
id: [Product ID from the tool's id property]
title: [Full Product Name]
price: [LKR Price / amount, e.g. LKR 6,850]
availability: [In Stock / Low Stock / Out of Stock]
image: [Image URL from the tool's image_url property]
link: [Product URL/link from the tool's url property]
:::
Ensure that the product ID, image URL, and product link are exactly what the Kapruka tool returned. Do not use standard markdown formatting for products; only use the :::product block template above. You can write friendly conversational text in Tanglish/English before and after these blocks.
2. Support Tanglish (e.g., "machan meka hoda da?") seamlessly. Maintain a warm, friendly Sri Lankan tone.
3. Manage a multi-item cart if the user asks.
4. When users are ready, ask for their address to quote delivery, then generate the checkout link.
5. NEVER call checkout or order creation tools (like 'kapruka_create_order') with placeholder, mock, or hallucinated values. You MUST explicitly ask the user for their address, recipient name, phone number, and delivery date first, and only call 'kapruka_create_order' once they have provided these details.
6. When the user asks to search or see products (e.g. "show me", "pennanna"), you MUST search for the products using 'kapruka_search_products', present the results using the ':::product' block template, and STOP to wait for the user's response. Do NOT call 'kapruka_create_order' or check delivery until the user selects a product and explicitly asks to order it.
7. You MUST call only one tool at a time. Do not make multiple or parallel tool calls.
8. The search query parameter 'q' for 'kapruka_search_products' must contain a valid keyword of at least 3 characters. Never call the search tool with an empty string ('') or generic/meaningless query.
`;

app.post('/api/chat', async (req: Request, res: Response): Promise<any> => {
    const { messages } = req.body;

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
                parameters: resolveRefs(tool.inputSchema),
            },
        }));

        let chatMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        let response = await callNvidiaWithRetry({
            model: 'meta/llama-3.3-70b-instruct',
            messages: chatMessages as any,
            tools: openAiTools.length > 0 ? openAiTools : undefined,
            tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
        });

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

                console.log(`📡 Executing Kapruka tool [${toolName}] with args:`, JSON.stringify(toolArgs));

                const toolResult = await mcpClient.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });

                console.log(`🔌 Tool [${toolName}] returned:`, JSON.stringify(toolResult));

                // Extract raw text block content if available, otherwise stringify the content array
                const contentArray = toolResult.content as any[];
                const rawContent = contentArray && contentArray[0]?.text !== undefined
                    ? contentArray[0].text
                    : JSON.stringify(toolResult.content);

                chatMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: rawContent,
                } as any);
            }

            response = await callNvidiaWithRetry({
                model: 'meta/llama-3.3-70b-instruct',
                messages: chatMessages as any,
                tools: openAiTools,
            });
            responseMessage = response.choices[0].message;
        }

        return res.json({ reply: responseMessage.content });

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