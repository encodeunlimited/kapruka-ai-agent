# 🛍️ Kapruka AI Shopping Assistant

Welcome to the **Kapruka AI Shopping Assistant**, a next-generation conversational e-commerce agent built for a seamless, proactive, and emotionally intelligent shopping experience.

This project was built to revolutionize how users interact with Kapruka's live inventory, blending a state-of-the-art Model Context Protocol (MCP) Node.js backend with a stunning, highly animated glassmorphism frontend.

---

## ✨ Full Feature List

### 🌍 Native & Multilingual Conversational AI
* **Local Language Support:** Fluently understands and responds in **Sinhala**, **Singlish** (Sinhala written in English letters), and **English**. The AI perfectly grasps local Sri Lankan slang and cultural nuances (e.g., calling the user "machan", understanding specific festive requirements like Avurudu or Valentine's Day in Sri Lanka).

### 🎙️ Full-Duplex Voice Interaction & TTS
* **Seamless Voice Input (Web Speech API):** Speak directly to the AI! Features real-time dictation with visual pulsing microphone feedback. It handles speech recognition errors gracefully and supports a natural, real-time conversational flow without needing to type.
* **AI Voice Output (Gemini TTS API):** High-quality, emotionally aware text-to-speech powered by the `gemini-3.1-flash-tts-preview` model via the Google Generative Language API. 
* **Raw PCM Audio Streaming:** Audio is streamed as raw 16-bit PCM and decoded cleanly via the Web Audio API directly on the frontend for crisp, low-latency playback. 
* **Intelligent Output Filtering:** The TTS system automatically strips out markdown, emojis, URLs, and UI code blocks, ensuring the voice output sounds entirely natural and human-like.

### 🛒 Core E-commerce Capabilities
* **Live Inventory Sync:** Connects directly to Kapruka's live MCP server to search, filter, and retrieve real-time stock and prices.
* **Intelligent Product Comparisons:** Ask the AI to compare items (e.g., "Compare the top 3 chocolate cakes"), and it autonomously generates detailed side-by-side comparisons highlighting prices, stock levels, delivery speeds, and unique features, allowing you to make quick decisions.
* **Dynamic Cart Drawer:** A sliding glassmorphism cart drawer to manage items, adjust quantities, and calculate subtotals on the fly.
* **Integrated Checkout:** Seamlessly collects delivery, sender, and recipient details within the chat UI and interfaces directly with the Kapruka Pay gateway.
* **Robust JSON Parsing & Fallbacks:** Seamlessly handles MCP tool output arrays, gracefully failing over to RegEx-based parsing to ensure UI product cards always render reliably without breaking the chat interface.

### 🤖 Advanced Agentic Behaviors
* **The Budget Bundle Architect:** Give the AI a budget (e.g., "15,000 LKR for a birthday"), and it will autonomously run multiple searches in the background to build a perfect, budget-compliant bundle (cake, flowers, card).
* **Panic Mode (Urgency Detection):** Detects frantic keywords ("urgent", "forgot", "today") and automatically filters for fast-delivery items while reassuring the user.
* **Pre-emptive Delivery Intelligence:** Silently checks delivery feasibility to the user's city in the background and proactively confirms delivery timelines before the user even asks.
* **Context Interruption:** Can pause a shopping session, check the status of a past order, and resume shopping without losing context.

### 🚀 Cutting-Edge UX Upgrades
* **Multimodal "Snap & Search":** Allows users to upload multiple images at once. The AI analyzes the visual context to find visually similar products or read text from images.
* **Cross-Device Checkout (QR Code Handoff) & Auto-Redirect:** Upon successful order creation, the UI automatically opens the Kapruka checkout page in a new tab. Simultaneously, it slides open the cart drawer to reveal a secure, inline QR code. Users can scan it to seamlessly complete payment on their mobile phones.
* **Persistent Client Memory:** Saves previous delivery details to `localStorage` and silently injects them into the AI's system prompt, allowing the agent to say, *"Should I send this to your usual Colombo 03 address?"*
* **Conversion-Driven "FOMO" Animations:** Dynamically scans product metadata. If an item is "Low Stock," its UI card aggressively pulses with a red neon glow to encourage immediate checkout.
* **Real-time City Autocomplete & Search:** Native Kapruka city listing and autocomplete during the checkout phase for precise delivery targeting.

### ☁️ Deployment & Infrastructure
* **Dockerized Environment:** Fully dockerized backend using a multi-stage `Dockerfile` and `docker-compose` ready setup.
* **CI/CD with GitHub Actions:** Automated deployment pipeline (`.github/workflows/deploy.yml`) that securely SSHes into a DigitalOcean Droplet, pulls the latest main branch, and triggers a zero-downtime rebuild of the `agentkapruka` Docker container.

---

## 🛠️ Technology Stack

### Frontend
* **Vanilla HTML5 & JavaScript (ES6+)** - Lightning fast, no heavy framework overhead.
* **Tailwind CSS (Utility Styling)** - Used for rapid UI development and responsive design.
* **Anime.js** - Smooth micro-animations for interactions like FOMO pulses and voice ripples.
* **Web Audio API** - Handles raw 16-bit PCM decoding for fast AI voice responses.

### Backend
* **Node.js & Express.js** - High-performance backend routing.
* **Model Context Protocol (MCP) SDK** - Used to standardize Kapruka live inventory interactions.
* **OpenAI SDK Integration** - Supports Groq, Gemini, OpenRouter, and NVIDIA NIMs for versatile LLM selection.
* **CORS & Dotenv** - Secure API communication and environment management.

### Integrations
* **Kapruka Live MCP API** (`https://mcp.kapruka.com/mcp`)
* **QR Server API** (`api.qrserver.com`)
* **Web Speech API & Gemini TTS API**

---

## ⚙️ Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone <repository_url>
   cd kapruka-ai-agent
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add your LLM API keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ```

3. **Run Locally (Development):**
   ```bash
   npm install
   npx tsx src/server.ts
   ```

4. **Run via Docker:**
   ```bash
   docker build -t kapruka-agent .
   docker run -p 5000:5000 --env-file .env kapruka-agent
   ```

5. **Launch the App:**
   Open your browser and navigate to **[http://localhost:5000](http://localhost:5000)**.
   *(Note: You must access it via localhost or HTTPS for the microphone features to bypass browser security blocks).*

---

## 🧑‍💻 Architecture Notes

* **`index.html`:** Contains the entire presentation layer. Handles the chat UI loop, animations, Web Audio PCM decoding for voice synthesis, image uploads, dynamic cart rendering, auto-redirect logic, and QR code handoff.
* **`src/server.ts`:** The gateway server. It initializes the Kapruka MCP connection, constructs the dynamic `SYSTEM_PROMPT` (injecting local memory), processes tool calls sequentially to prevent API rate limits, proxies requests to the Gemini TTS API, and serves the frontend statically.
* **Testing Scripts (`test_actual_order.ts`, `list_cities.ts`):** Included standalone scripts to independently test the Model Context Protocol queries (e.g., fetching lists of cities and testing live Kapruka order endpoints).
* **`.github/workflows/deploy.yml`:** The automated deployment script ensuring any pushes to `main` are immediately reflected on the production Droplet.
