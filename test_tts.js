require('dotenv').config();
async function test() {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    console.log("Calling Gemini TTS API...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello from Kapruka!" }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
            }
        })
    });
    if (!response.ok) {
        console.error("Error:", await response.text());
    } else {
        const data = await response.json();
        console.log("Success! Audio data length:", data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data?.length);
    }
}
test();
