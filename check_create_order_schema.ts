import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function checkSchema() {
    const mcpClient = new Client(
        { name: 'kapruka-shopping-agent-test', version: '2.0.0' },
        { capabilities: { tools: {} } } as any
    );

    try {
        const targetUrl = 'https://mcp.kapruka.com/mcp';
        const transport = new StreamableHTTPClientTransport(new URL(targetUrl), {
            requestInit: {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
                }
            }
        });
        await mcpClient.connect(transport);
        const tools = await mcpClient.listTools();
        const createOrderTool = tools.tools.find(t => t.name === 'kapruka_create_order');
        console.log('kapruka_create_order Schema:', JSON.stringify(createOrderTool?.inputSchema, null, 2));
    } catch (e: any) {
        console.error('Error:', e.message || e);
    }
}

checkSchema();
