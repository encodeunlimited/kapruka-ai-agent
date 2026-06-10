import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function testOrder() {
    const mcpClient = new Client(
        { name: 'kapruka-shopping-agent-test', version: '2.0.0' },
        { capabilities: { tools: {} } } as any
    );

    try {
        const targetUrl = 'https://mcp.kapruka.com/mcp';
        console.log('Connecting...');
        const transport = new StreamableHTTPClientTransport(new URL(targetUrl), {
            requestInit: {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
                }
            }
        });
        await mcpClient.connect(transport);
        console.log('Connected! Creating order...');

        const res = await mcpClient.callTool({
            name: 'kapruka_create_order',
            arguments: {
                params: {
                    cart: [
                        {
                            product_id: 'EF_PC_FASHION0V2033P00034',
                            quantity: 1
                        }
                    ],
                    recipient: {
                        name: 'Nimal Silva',
                        phone: '+94771234567'
                    },
                    delivery: {
                        address: '123 Galle Road',
                        city: 'Colombo',
                        location_type: 'house',
                        date: '2026-06-15',
                        instructions: 'Leave at front gate'
                    },
                    sender: {
                        name: 'Kamal Perera',
                        anonymous: false
                    },
                    gift_message: 'Happy Anniversary!',
                    currency: 'LKR',
                    response_format: 'json'
                }
            }
        });
        console.log('Order Creation Response:', JSON.stringify(res, null, 2));

    } catch (e: any) {
        console.error('Error:', e.message || e);
    }
}

testOrder();
