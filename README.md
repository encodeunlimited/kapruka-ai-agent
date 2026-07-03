# 🛍️ Kapruka AI Shopping Assistant

Welcome to the **Kapruka AI Shopping Assistant**, a next-generation conversational e-commerce agent built for a seamless, proactive, and emotionally intelligent shopping experience.

This project was built to revolutionize how users interact with Kapruka's live inventory, blending a state-of-the-art Model Context Protocol (MCP) Node.js backend with a stunning, highly animated glassmorphism frontend.

---

## ✨ Full Feature List

### 🛒 Core E-commerce Capabilities
* **Live Inventory Sync:** Connects directly to Kapruka's live MCP server to search, filter, and retrieve real-time stock and prices.
* **Dynamic Cart Drawer:** A sliding glassmorphism cart drawer to manage items, adjust quantities, and calculate subtotals on the fly.
* **Integrated Checkout:** Seamlessly collects delivery, sender, and recipient details within the chat UI and interfaces directly with the Kapruka Pay gateway.

### 🤖 Advanced Agentic Behaviors (V2.0)
* **The Budget Bundle Architect:** Give the AI a budget (e.g., "15,000 LKR for a birthday"), and it will autonomously run multiple searches in the background to build a perfect, budget-compliant bundle (cake, flowers, card).
* **Panic Mode (Urgency Detection):** Detects frantic keywords ("urgent", "forgot", "today") and automatically filters for fast-delivery items while reassuring the user.
* **Pre-emptive Delivery Intelligence:** Silently checks delivery feasibility to the user's city in the background and proactively confirms delivery timelines before the user even asks.
* **Context Interruption:** Can pause a shopping session, check the status of a past order, and resume shopping without losing context.
* **Comparison Tables:** Autonomously generates Markdown tables to compare prices, stock, and features of multiple products.

### 🚀 Cutting-Edge UX & Conversational Upgrades (V3.0)
* **Full-Duplex Voice Interaction:** 
  * *Voice Input:* Uses the Web Speech API for real-time dictation with visual pulsing feedback. Handles errors gracefully and supports real-time conversational flow.
  * *AI Voice Output (Gemini TTS API):* High-quality text-to-speech powered by the `gemini-3.1-flash-tts-preview` model via the Google Generative Language API. Audio is streamed as raw 16-bit PCM and decoded cleanly via the Web Audio API on the frontend for crisp, low-latency playback. Automatically filters out markdown, emojis, URLs, and UI code blocks.
* **Multimodal "Snap & Search":** Allows users to upload multiple images at once. The AI analyzes the visual context to find visually similar products or read text from images.
* **Cross-Device Checkout (QR Code Handoff) & Auto-Redirect:** Upon successful order creation, the UI automatically opens the Kapruka checkout page in a new tab. Simultaneously, it slides open the cart drawer to reveal a secure, inline QR code. Users can scan it to seamlessly complete payment on their mobile phones.
* **Persistent Client Memory:** Saves previous delivery details to `localStorage` and silently injects them into the AI's system prompt, allowing the agent to say, *"Should I send this to your usual Colombo 03 address?"*
* **Conversion-Driven "FOMO" Animations:** Dynamically scans product metadata. If an item is "Low Stock," its UI card aggressively pulses with a red neon glow to encourage immediate checkout.

### ☁️ Deployment & Infrastructure
* **Dockerized Environment:** Fully dockerized backend using a multi-stage `Dockerfile` and `docker-compose` ready setup.
* **CI/CD with GitHub Actions:** Automated deployment pipeline (`.github/workflows/deploy.yml`) that securely SSHes into a DigitalOcean Droplet, pulls the latest main branch, and triggers a zero-downtime rebuild of the `agentkapruka` Docker container.

---

## 🛠️ Technology Stack

* **Frontend:** Vanilla HTML5, JavaScript (ES6+), Tailwind CSS (Utility Styling), Anime.js (Micro-animations), Web Audio API for PCM decoding.
* **Backend:** Node.js, Express.js.
* **AI & Orchestration:** Model Context Protocol (MCP) SDK, OpenAI API Client (Supports Groq, Gemini, OpenRouter, and NVIDIA NIMs).
* **APIs:** Kapruka Live MCP, QR Server API (`api.qrserver.com`), Web Speech API, Gemini TTS API (`gemini-3.1-flash-tts-preview`).
* **DevOps:** Docker, GitHub Actions, DigitalOcean Droplet.

---

## ⚙️ Installation & Setup

1. **Clone the Repository**
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
* **`.github/workflows/deploy.yml`:** The automated deployment script ensuring any pushes to `main` are immediately reflected on the production Droplet.
