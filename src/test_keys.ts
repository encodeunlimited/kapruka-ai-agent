import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

async function testOpenRouter() {
    console.log("Testing OpenRouter API Key...");
    try {
        const or = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1'
        });
        const completion = await or.chat.completions.create({
            model: 'z-ai/glm-4.5-air',
            messages: [{ role: 'user', content: 'hello' }]
        });
        console.log("✅ OpenRouter key is VALID!");
        console.log("Response:", completion.choices[0].message.content);
    } catch (e: any) {
        console.log("❌ OpenRouter key is INVALID:", e.message);
    }
}

testOpenRouter();
