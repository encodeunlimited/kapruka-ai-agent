async function testKaprukaConnection() {
    console.log("🔍 Pinging Kapruka MCP Server directly...");
    
    try {
        const response = await fetch('https://mcp.kapruka.com/mcp', {
            method: 'GET',
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                "Accept": "text/event-stream"
            }
        });

        console.log(`📡 Status Code: ${response.status}`);
        
        const bodyText = await response.text();
        console.log(`🛑 Server Reply: \n${bodyText}`);
        
    } catch (err) {
        console.error("❌ Network failure:", err);
    }
}

testKaprukaConnection();