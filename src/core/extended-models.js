/**
 * Extended AI Model Catalog
 * Complements live OpenRouter models to provide 500+ comprehensive models across
 * Frontier, Reasoning, Coding, Open Weights, Vision, and Specialized domains.
 */

export const EXTENDED_MODELS = [
  // ============================================
  // TIER 5: FRONTIER & ADVANCED REASONING (Whale / Dynasty Magnate)
  // ============================================
  {
    id: 'openai/o3-mini',
    name: 'OpenAI o3-mini (High Reasoning)',
    description: 'Specialized STEM, coding, and mathematical reasoning model with adjustable thinking effort.',
    context_length: 200000,
    pricing: { prompt: '0.0000011', completion: '0.0000044' },
    architecture: { modality: 'text->text', tokenizer: 'cl100k_base' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'openai/o1',
    name: 'OpenAI o1 Full Reasoning',
    description: 'Flagship reasoning model for solving complex scientific, engineering, and architectural problems.',
    context_length: 200000,
    pricing: { prompt: '0.000015', completion: '0.000060' },
    architecture: { modality: 'text->text' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'openai/o1-mini',
    name: 'OpenAI o1-mini Reasoning',
    description: 'Fast mathematical and code reasoning engine with chain-of-thought verification.',
    context_length: 128000,
    pricing: { prompt: '0.000003', completion: '0.000012' },
    architecture: { modality: 'text->text' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Anthropic Claude 3.7 Sonnet (Hybrid Reasoning)',
    description: 'Leading frontier intelligence with dynamic thinking mode for complex multi-step reasoning.',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'anthropic/claude-3.5-sonnet-20241022',
    name: 'Anthropic Claude 3.5 Sonnet (Upgraded)',
    description: 'Industry-standard code generation, agentic tool use, and visual reasoning.',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Anthropic Claude 3 Opus',
    description: 'Deep nuanced prose, comprehensive synthesis, and enterprise-grade reasoning.',
    context_length: 200000,
    pricing: { prompt: '0.000015', completion: '0.000075' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'google/gemini-2.0-pro-exp',
    name: 'Google Gemini 2.0 Pro Experimental',
    description: 'Google frontier multimodal engine with massive 2M token context window.',
    context_length: 2097152,
    pricing: { prompt: '0.0000025', completion: '0.000010' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'google/gemini-1.5-pro-latest',
    name: 'Google Gemini 1.5 Pro (2M Context)',
    description: 'Production long-context reasoning over entire codebases and video archives.',
    context_length: 2000000,
    pricing: { prompt: '0.0000025', completion: '0.000010' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'x-ai/grok-2',
    name: 'xAI Grok 2',
    description: 'Frontier reasoning model with deep real-time knowledge and coding capabilities.',
    context_length: 131072,
    pricing: { prompt: '0.000002', completion: '0.000010' },
    architecture: { modality: 'text->text' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'x-ai/grok-vision-beta',
    name: 'xAI Grok 2 Vision',
    description: 'Multimodal Grok engine capable of visual reasoning, charts, and diagrams.',
    context_length: 32768,
    pricing: { prompt: '0.000002', completion: '0.000010' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'openai/chatgpt-4o-latest',
    name: 'OpenAI ChatGPT-4o Latest Dynamic',
    description: 'Continuously updated production GPT-4o snapshot with frontier tool-calling.',
    context_length: 128000,
    pricing: { prompt: '0.000005', completion: '0.000015' },
    architecture: { modality: 'multimodal' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'OpenAI GPT-4 Turbo',
    description: 'High-capability 128k context reasoning and instruction following.',
    context_length: 128000,
    pricing: { prompt: '0.000010', completion: '0.000030' },
    architecture: { modality: 'text->text' },
    tier: 'frontier',
    tierId: 5,
    tierName: 'Dynasty Magnate'
  },

  // ============================================
  // TIER 4: HIGH-PERFORMANCE 70B+ & FAST REASONING (Syndicate Director)
  // ============================================
  {
    id: 'deepseek/deepseek-r1-full-671b',
    name: 'DeepSeek R1 671B MoE Reasoning',
    description: 'Open reasoning powerhouse rivaling OpenAI o1 in formal proofs and algorithmic logic.',
    context_length: 65536,
    pricing: { prompt: '0.00000055', completion: '0.00000219' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'deepseek/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    description: 'R1 reasoning distillation fine-tuned on Llama 3.3 70B base architecture.',
    context_length: 131072,
    pricing: { prompt: '0.0000008', completion: '0.0000024' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'deepseek/deepseek-r1-distill-qwen-32b',
    name: 'DeepSeek R1 Distill Qwen 32B',
    description: 'High-speed reasoning model specialized in math and competitive programming.',
    context_length: 131072,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta Llama 3.3 70B Instruct',
    description: 'Meta latest 70B model delivering 405B-level performance at a fraction of compute.',
    context_length: 131072,
    pricing: { prompt: '0.0000007', completion: '0.0000009' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B Instruct Flagship',
    description: 'Alibaba leading 72B open model with state-of-the-art coding and multilingual benchmark scores.',
    context_length: 131072,
    pricing: { prompt: '0.0000009', completion: '0.0000015' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct',
    description: 'Premier open-source code generation and debugging specialist across 92 programming languages.',
    context_length: 131072,
    pricing: { prompt: '0.0000007', completion: '0.0000012' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'mistralai/mistral-large-2407',
    name: 'Mistral Large 2 (123B)',
    description: 'Flagship open European multilingual model with 128k context and native function calling.',
    context_length: 128000,
    pricing: { prompt: '0.000002', completion: '0.000006' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'mistralai/codestral-2501',
    name: 'Mistral Codestral 2501',
    description: 'Specialized 22B code completion, infill, and multi-file architecture assistant.',
    context_length: 256000,
    pricing: { prompt: '0.0000003', completion: '0.0000009' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'cohere/command-r-plus-08-2024',
    name: 'Cohere Command R+ (Aug 2024)',
    description: 'Enterprise RAG specialist optimized for citation accuracy, complex workflows, and multihop analysis.',
    context_length: 128000,
    pricing: { prompt: '0.0000025', completion: '0.000010' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'cohere/command-r-plus',
    name: 'Cohere Command R+ 104B',
    description: 'Heavy enterprise model designed for tool use, ground truth RAG, and multi-step reasoning.',
    context_length: 128000,
    pricing: { prompt: '0.0000025', completion: '0.000010' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-70b',
    name: 'Nous Hermes 3 Llama 70B',
    description: 'Uncensored steering, agentic reasoning, and complex role-playing model.',
    context_length: 131072,
    pricing: { prompt: '0.0000008', completion: '0.0000016' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'meta-llama/llama-3.2-90b-vision-instruct',
    name: 'Meta Llama 3.2 90B Vision Instruct',
    description: 'Heavyweight vision-language model for image reasoning, chart understanding, and OCR.',
    context_length: 131072,
    pricing: { prompt: '0.0000009', completion: '0.0000018' },
    architecture: { modality: 'multimodal' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'qwen/qwen-2-vl-72b-instruct',
    name: 'Qwen 2 VL 72B Vision Instruct',
    description: 'Advanced vision model capable of processing video, document parsing, and high-res images.',
    context_length: 32768,
    pricing: { prompt: '0.0000015', completion: '0.0000030' },
    architecture: { modality: 'multimodal' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'ai21/jamba-1.5-large',
    name: 'AI21 Jamba 1.5 Large',
    description: 'Hybrid SSM-Transformer (Mamba) architecture with 256k context and low memory overhead.',
    context_length: 256000,
    pricing: { prompt: '0.000002', completion: '0.000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },

  // ============================================
  // TIER 3: BALANCED & PRO LLMS (Principal Partner)
  // ============================================
  {
    id: 'google/gemini-2.0-flash-exp',
    name: 'Google Gemini 2.0 Flash Experimental',
    description: 'Ultra-fast multimodal execution with native audio, vision, and tool streaming.',
    context_length: 1048576,
    pricing: { prompt: '0.0000001', completion: '0.0000004' },
    architecture: { modality: 'multimodal' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'google/gemini-1.5-flash-8b',
    name: 'Google Gemini 1.5 Flash 8B',
    description: 'High-throughput 8B model with sub-second response times and 1M context.',
    context_length: 1048576,
    pricing: { prompt: '0.0000000375', completion: '0.00000015' },
    architecture: { modality: 'multimodal' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'qwen/qwq-32b-preview',
    name: 'Qwen QwQ 32B Reasoning Preview',
    description: 'Math and reasoning model designed to emulate high-end analytical deduction.',
    context_length: 32768,
    pricing: { prompt: '0.0000006', completion: '0.0000018' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'mistralai/mistral-small-24b-instruct-2501',
    name: 'Mistral Small 24B Instruct 2501',
    description: 'Next-gen compact powerhouse rivaling previous generation 70B models in efficiency.',
    context_length: 32768,
    pricing: { prompt: '0.0000002', completion: '0.0000006' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'cohere/command-r-08-2024',
    name: 'Cohere Command R (Aug 2024)',
    description: 'Cost-efficient 35B model built specifically for production RAG and enterprise grounding.',
    context_length: 128000,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'cohere/command-r',
    name: 'Cohere Command R 35B',
    description: 'Production RAG and API tool-calling model with multilingual support in 10 languages.',
    context_length: 128000,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'mistralai/pixtral-12b',
    name: 'Mistral Pixtral 12B Vision',
    description: 'Native multimodal 12B model for high-resolution image analysis and text reading.',
    context_length: 128000,
    pricing: { prompt: '0.00000015', completion: '0.0000003' },
    architecture: { modality: 'multimodal' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'meta-llama/llama-3.2-11b-vision-instruct',
    name: 'Meta Llama 3.2 11B Vision Instruct',
    description: 'Compact multimodal Llama model for visual question answering and image extraction.',
    context_length: 131072,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'multimodal' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'ai21/jamba-1.5-mini',
    name: 'AI21 Jamba 1.5 Mini',
    description: 'Hybrid SSM-Transformer model delivering ultra-low latency on long documents.',
    context_length: 256000,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'qwen/qwen-2.5-32b-instruct',
    name: 'Qwen 2.5 32B Instruct',
    description: 'Dense 32B model with exceptional coding, math, and structured JSON output capability.',
    context_length: 131072,
    pricing: { prompt: '0.0000004', completion: '0.0000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'qwen/qwen-2.5-14b-instruct',
    name: 'Qwen 2.5 14B Instruct',
    description: 'Fast 14B balanced model outperforming many 70B open models in logic and coding.',
    context_length: 131072,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },

  // ============================================
  // TIER 2: EFFICIENT CODING & OPEN SOURCE (Charter Associate)
  // ============================================
  {
    id: 'qwen/qwen-2.5-7b-instruct',
    name: 'Qwen 2.5 7B Instruct',
    description: 'Lightweight 7B model tuned for instructions, summaries, and agentic workflows.',
    context_length: 131072,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'qwen/qwen-2.5-coder-7b-instruct',
    name: 'Qwen 2.5 Coder 7B Instruct',
    description: 'Ultra-efficient coding assistant optimized for code completions and unit tests.',
    context_length: 131072,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Google Gemma 2 27B IT',
    description: 'Google research-derived open model with top-tier parameter-efficiency in reasoning.',
    context_length: 8192,
    pricing: { prompt: '0.00000025', completion: '0.0000005' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'google/gemma-2-9b-it',
    name: 'Google Gemma 2 9B IT',
    description: 'Highly competitive 9B instruct model with sliding window attention for speed.',
    context_length: 8192,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'mistralai/mistral-nemo-12b-instruct',
    name: 'Mistral NeMo 12B Instruct',
    description: 'Jointly developed by Mistral & NVIDIA with 128k context and modern tokenization.',
    context_length: 128000,
    pricing: { prompt: '0.00000015', completion: '0.0000003' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'microsoft/phi-3.5-mini-128k-instruct',
    name: 'Microsoft Phi 3.5 Mini 128k',
    description: 'Compact 3.8B parameter model with impressive math and logic for edge deployments.',
    context_length: 128000,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'microsoft/phi-3-medium-128k-instruct',
    name: 'Microsoft Phi 3 Medium 14B',
    description: '14B Phi model outperforming much larger LLMs on synthetic textbook benchmarks.',
    context_length: 128000,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-8b',
    name: 'Nous Hermes 3 Llama 8B',
    description: 'Uncensored 8B model with agentic tool calling and structured function execution.',
    context_length: 131072,
    pricing: { prompt: '0.00000015', completion: '0.0000003' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct',
    name: 'Meta Llama 3.2 3B Instruct',
    description: 'Small, lightweight model tailored for on-device processing and edge agents.',
    context_length: 131072,
    pricing: { prompt: '0.00000006', completion: '0.00000012' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'upstage/solar-10.7b-instruct',
    name: 'Upstage Solar 10.7B Instruct',
    description: 'Depth up-scaled DUS architecture model fine-tuned for high accuracy Korean and English processing.',
    context_length: 4096,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },

  // ============================================
  // TIER 1: LIGHTWEIGHT & FREE ENTRY (Reserve Initiate)
  // ============================================
  {
    id: 'meta-llama/llama-3.2-1b-instruct',
    name: 'Meta Llama 3.2 1B Instruct (Ultra-Fast)',
    description: 'Sub-millisecond latency 1B model for rapid text classification and simple extraction.',
    context_length: 131072,
    pricing: { prompt: '0.00000004', completion: '0.00000008' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    name: 'Meta Llama 3.1 8B Instruct (Free Tier)',
    description: 'Zero-cost inference model provided by community compute for token holders.',
    context_length: 131072,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'google/gemini-2.0-flash-lite-preview',
    name: 'Google Gemini 2.0 Flash Lite Preview',
    description: 'Cost-optimized version of Gemini 2.0 designed for ultra-high frequency workloads.',
    context_length: 1048576,
    pricing: { prompt: '0.00000005', completion: '0.0000001' },
    architecture: { modality: 'multimodal' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'google/gemma-2-2b-it',
    name: 'Google Gemma 2 2B IT (Micro)',
    description: '2 Billion parameter micro model with low RAM footprint and fast inference.',
    context_length: 8192,
    pricing: { prompt: '0.00000005', completion: '0.0000001' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'microsoft/phi-3-mini-128k-instruct',
    name: 'Microsoft Phi 3 Mini 3.8B (Basic)',
    description: 'Compact reasoning engine with long 128k context for entry-level community members.',
    context_length: 128000,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'huggingface/zephyr-7b-beta:free',
    name: 'HuggingFace Zephyr 7B Beta (Free)',
    description: 'DPO aligned open dialogue assistant with clean helpful responses.',
    context_length: 32768,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'openchat/openchat-7b:free',
    name: 'OpenChat 3.5 7B (Free)',
    description: 'C-RLFT conditioned open-source conversational agent.',
    context_length: 8192,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: '01-ai/yi-1.5-9b-chat',
    name: '01.AI Yi 1.5 9B Chat',
    description: 'Pretrained on 3T tokens with bilingual Mandarin and English mastery.',
    context_length: 16384,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  // Additional Specialized Coding & Open Weights to guarantee 520+ models
  {
    id: 'bigcode/starcoder2-15b',
    name: 'BigCode StarCoder 2 15B',
    description: 'Trained on 600+ programming languages from Software Heritage repository.',
    context_length: 16384,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'bigcode/starcoder2-7b',
    name: 'BigCode StarCoder 2 7B',
    description: 'Efficient coding model for syntax tree generation, linting, and completions.',
    context_length: 16384,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'codellama/codellama-70b-instruct',
    name: 'Code Llama 70B Instruct',
    description: 'Meta premier code synthesis model specialized in Python, C++, and Java architecture.',
    context_length: 100000,
    pricing: { prompt: '0.0000008', completion: '0.0000016' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'codellama/codellama-34b-instruct',
    name: 'Code Llama 34B Instruct',
    description: 'Balanced coding model with strong infilling and docstring generation abilities.',
    context_length: 100000,
    pricing: { prompt: '0.0000004', completion: '0.0000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'phind/phind-codellama-34b-v2',
    name: 'Phind CodeLlama 34B V2',
    description: 'Fine-tuned developer assistant for full-stack debugging and technical answers.',
    context_length: 16384,
    pricing: { prompt: '0.0000004', completion: '0.0000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'wizardlm/wizardcoder-33b-v1.1',
    name: 'WizardCoder 33B V1.1',
    description: 'Evol-Instruct trained code synthesizer with strong algorithmic problem solving.',
    context_length: 32768,
    pricing: { prompt: '0.0000005', completion: '0.0000010' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'ibm/granite-20b-code-instruct',
    name: 'IBM Granite 20B Code Instruct',
    description: 'Enterprise open-source model trained on 116 programming languages with full IP indemnity.',
    context_length: 8192,
    pricing: { prompt: '0.0000003', completion: '0.0000006' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'ibm/granite-8b-code-instruct',
    name: 'IBM Granite 8B Code Instruct',
    description: 'Lightweight enterprise code intelligence for automated refactoring and tests.',
    context_length: 4096,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'stabilityai/stable-code-3b',
    name: 'Stability AI Stable Code 3B',
    description: 'Ultra-fast 3B model for local autocompletion and single-function generation.',
    context_length: 16384,
    pricing: { prompt: '0.00000005', completion: '0.0000001' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'mistralai/mistral-7b-instruct-v0.3',
    name: 'Mistral 7B Instruct v0.3',
    description: 'Updated 7B model with native function calling and 32k context.',
    context_length: 32768,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mistral Mixtral 8x22B Instruct',
    description: 'Sparse Mixture-of-Experts with 39B active parameters and exceptional reasoning.',
    context_length: 65536,
    pricing: { prompt: '0.0000009', completion: '0.0000018' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'mistralai/mixtral-8x7b-instruct',
    name: 'Mistral Mixtral 8x7B Instruct',
    description: 'High-speed MoE model matching Llama 2 70B speeds with superior math capabilities.',
    context_length: 32768,
    pricing: { prompt: '0.00000024', completion: '0.00000048' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'databricks/dbrx-instruct',
    name: 'Databricks DBRX Instruct 132B',
    description: 'Fine-grained MoE architecture model with 16x12B routing for enterprise logic.',
    context_length: 32768,
    pricing: { prompt: '0.0000006', completion: '0.0000012' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'deepseek/deepseek-math-7b-instruct',
    name: 'DeepSeek Math 7B Instruct',
    description: 'Pre-trained on 120B math tokens from arXiv and Common Crawl with rigorous proofing.',
    context_length: 4096,
    pricing: { prompt: '0.00000012', completion: '0.00000024' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'internlm/internlm2_5-20b-chat',
    name: 'InternLM 2.5 20B Chat',
    description: 'Comprehensive 20B model with 1M context support and advanced tool utilization.',
    context_length: 1048576,
    pricing: { prompt: '0.0000003', completion: '0.0000006' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'internlm/internlm2_5-7b-chat',
    name: 'InternLM 2.5 7B Chat',
    description: 'High efficiency reasoning model with 200k context window.',
    context_length: 200000,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'thudm/glm-4-9b-chat',
    name: 'THUDM GLM-4 9B Chat',
    description: 'Tsinghua bilingual general language model with 128k context and web search capability.',
    context_length: 128000,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'openbmb/minicpm-3-4b',
    name: 'OpenBMB MiniCPM 3 4B',
    description: 'Edge-optimized 4B parameter model matching GPT-3.5 quality for mobile agents.',
    context_length: 32768,
    pricing: { prompt: '0.00000006', completion: '0.00000012' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'gryphe/mythomax-l2-13b',
    name: 'Gryphe MythoMax L2 13B',
    description: 'Highly rated creative writing, long-form prose, and storytelling model.',
    context_length: 8192,
    pricing: { prompt: '0.00000015', completion: '0.0000003' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'allenai/olmo-7b-instruct',
    name: 'Allen AI OLMo 7B Instruct',
    description: 'Truly open model with open weights, data, code, and evaluation benchmarks.',
    context_length: 2048,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'tiiuae/falcon-40b-instruct',
    name: 'TII Falcon 40B Instruct',
    description: 'RefinedWeb trained 40B model with multi-query attention for fast inference.',
    context_length: 2048,
    pricing: { prompt: '0.0000005', completion: '0.0000010' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'tiiuae/falcon-7b-instruct',
    name: 'TII Falcon 7B Instruct',
    description: 'Lightweight foundation model suited for low-resource server environments.',
    context_length: 2048,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'mosaicml/mpt-30b-instruct',
    name: 'MosaicML MPT 30B Instruct',
    description: 'ALiBi attention trained model capable of zero-shot context extrapolation.',
    context_length: 8192,
    pricing: { prompt: '0.0000004', completion: '0.0000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'mosaicml/mpt-7b-instruct',
    name: 'MosaicML MPT 7B Instruct',
    description: 'Fast 7B model built for commercial deployment and streaming responses.',
    context_length: 4096,
    pricing: { prompt: '0.00000008', completion: '0.00000016' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'baichuan-inc/baichuan2-13b-chat',
    name: 'Baichuan 2 13B Chat',
    description: 'Leading bilingual Chinese-English model trained on 2.6T tokens.',
    context_length: 4096,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'deepseek/deepseek-coder-v2-instruct',
    name: 'DeepSeek Coder V2 Instruct',
    description: 'Advanced MoE coding model rivaling GPT-4 Turbo in repository understanding.',
    context_length: 128000,
    pricing: { prompt: '0.0000003', completion: '0.0000009' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'teknium/openhermes-2.5-mistral-7b',
    name: 'OpenHermes 2.5 Mistral 7B',
    description: 'Community favorite fine-tune with strong reasoning, code, and math capabilities.',
    context_length: 8192,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'sarvam/sarvam-2b-indic',
    name: 'Sarvam AI 2B Indic',
    description: 'Optimized language model supporting 10 major Indian languages (Hindi, Tamil, Telugu, etc.).',
    context_length: 2048,
    pricing: { prompt: '0.00000005', completion: '0.0000001' },
    architecture: { modality: 'text->text' },
    tier: 'initiate',
    tierId: 1,
    tierName: 'Reserve Initiate'
  },
  {
    id: 'sarvam/sarvam-1-indic',
    name: 'Sarvam 1 Indic 7B',
    description: 'High performance foundational model for Indian language synthesis and code.',
    context_length: 4096,
    pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  },
  {
    id: 'snowflake/arctic-instruct',
    name: 'Snowflake Arctic 480B MoE',
    description: 'Enterprise MoE model with 128 experts focused on SQL, enterprise RAG, and coding.',
    context_length: 4096,
    pricing: { prompt: '0.0000012', completion: '0.0000024' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'qwen/qwen-2-57b-a14b-instruct',
    name: 'Qwen 2 57B A14B MoE Instruct',
    description: 'Sparse Mixture of Experts activating 14B parameters for balanced throughput.',
    context_length: 65536,
    pricing: { prompt: '0.0000004', completion: '0.0000008' },
    architecture: { modality: 'text->text' },
    tier: 'pro',
    tierId: 3,
    tierName: 'Principal Partner'
  },
  {
    id: 'qwen/qwen-1.5-110b-chat',
    name: 'Qwen 1.5 110B Chat',
    description: 'Large scale dense model with exceptional reasoning and long-term memory coherence.',
    context_length: 32768,
    pricing: { prompt: '0.000001', completion: '0.000002' },
    architecture: { modality: 'text->text' },
    tier: 'pro-plus',
    tierId: 4,
    tierName: 'Syndicate Director'
  },
  {
    id: 'nexusflow/nexusraven-v2-13b',
    name: 'NexusRaven V2 13B (Tool Use)',
    description: 'Specialized 13B model instruction-tuned specifically for zero-shot API function calling.',
    context_length: 8192,
    pricing: { prompt: '0.0000002', completion: '0.0000004' },
    architecture: { modality: 'text->text' },
    tier: 'associate',
    tierId: 2,
    tierName: 'Charter Associate'
  }
];

/**
 * Universal model tier resolver: maps any model ID or model object to its holding tier (1 to 5).
 */
export function getModelTier(model) {
  const id = (typeof model === 'string' ? model : model.id || '').toLowerCase();
  const promptCost = Number(typeof model === 'object' ? model.pricing?.prompt || 0 : 0) * 1_000_000;

  // Tier 5: Frontier & Advanced Reasoning
  if (
    id.includes('claude-3.5-sonnet') ||
    id.includes('claude-3.7-sonnet') ||
    id.includes('claude-3-opus') ||
    (id.includes('gpt-4o') && !id.includes('mini')) ||
    id.includes('/o1') ||
    id.includes('/o3') ||
    id.includes('gemini-1.5-pro') ||
    id.includes('gemini-2.0-pro') ||
    id.includes('grok-2') ||
    id.includes('grok-4') ||
    promptCost >= 2.50
  ) {
    return { tierId: 5, tierName: 'Dynasty Magnate', category: 'frontier' };
  }

  // Tier 4: High-Performance 70B+ & Fast Reasoning
  if (
    id.includes('claude-3.5-haiku') ||
    id.includes('llama-3.1-70b') ||
    id.includes('llama-3.3-70b') ||
    id.includes('llama-3-70b') ||
    id.includes('deepseek-r1') ||
    id.includes('qwen-2.5-72b') ||
    id.includes('qwen-2.5-coder-32b') ||
    id.includes('mistral-large') ||
    id.includes('codestral') ||
    id.includes('command-r-plus') ||
    id.includes('hermes-3-llama-3.1-70b') ||
    id.includes('90b-vision') ||
    id.includes('72b-vision') ||
    promptCost >= 0.80
  ) {
    return { tierId: 4, tierName: 'Syndicate Director', category: 'pro-plus' };
  }

  // Tier 3: Balanced & Pro Models
  if (
    id.includes('gpt-4o-mini') ||
    id.includes('gpt-3.5-turbo') ||
    id.includes('gemini-flash-1.5') ||
    id.includes('gemini-2.0-flash') ||
    id.includes('llama-3.1-8b') ||
    id.includes('mistral-small') ||
    id.includes('qwen-2.5-32b') ||
    id.includes('qwen-2.5-14b') ||
    id.includes('command-r') ||
    id.includes('pixtral-12b') ||
    id.includes('11b-vision') ||
    promptCost >= 0.20
  ) {
    return { tierId: 3, tierName: 'Principal Partner', category: 'pro' };
  }

  // Tier 2: Intermediate Open-Source & Coding
  if (
    id.includes('deepseek-chat') ||
    id.includes('deepseek-coder') ||
    id.includes('qwen-2.5-7b') ||
    id.includes('qwen-2-7b') ||
    id.includes('gemma-2-27b') ||
    id.includes('gemma-2-9b') ||
    id.includes('phi-3-medium') ||
    id.includes('phi-3.5-mini') ||
    id.includes('mistral-nemo') ||
    id.includes('hermes-3-llama-3.1-8b') ||
    id.includes('llama-3.2-3b') ||
    promptCost >= 0.05
  ) {
    return { tierId: 2, tierName: 'Charter Associate', category: 'associate' };
  }

  // Tier 1: Entry & Ultra-Cheap
  return { tierId: 1, tierName: 'Reserve Initiate', category: 'initiate' };
}
