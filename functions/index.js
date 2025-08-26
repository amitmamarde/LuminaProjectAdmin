// This file uses the modern ES Module syntax and the v2 Cloud Functions API for a successful deployment.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import { GoogleGenerativeAI, Type } from "@google/genai";
import SOURCE_REGISTRY from "./source-registry.json" with { type: "json" };

// A global system prompt to enforce quality, tone, and sourcing rules across all AI interactions.
const GLOBAL_SYSTEM_PROMPT = `You are a news curation and fact-check assistant for a quality-first news app.

STRICT SOURCE POLICY:
- Only use URLs/domains that appear in the provided SOURCE_REGISTRY or ALLOWED DOMAINS input.
- If a requested source is behind a paywall or lacks open access, SKIP it unless it is marked as "allowed_paywalled": true.
- Do NOT add sources that are not explicitly listed. Do NOT use generic aggregators unless they are allow-listed.
- If a query uses a public search engine, always add site: filters restricted to the allow-listed domains.

GEOGRAPHY AND RELEVANCE:
- Prioritize stories by user_location (e.g., India, Europe, USA, Worldwide). Avoid ultra-local stories that don’t travel across borders.
- Always prefer globally impactful research, solutions journalism, and positive developments.

CONTENT PILLARS:
1) POSITIVE/TRENDING NEWS (flash summary only, link out to original)
2) RESEARCH & BREAKTHROUGHS (flash summary only, link out to original)
3) MISINFORMATION WATCH (draft full explainer/fact-check; route to expert review)

FRESHNESS & QUALITY:
- Prefer items published in the last 72 hours (or newly updated).
- Prefer primary sources (official press releases, university newsrooms, journals) or reputable explainers.
- For misinfo: prefer IFCN signatories and recognized fact-checkers.

ETHICS:
- No clickbait. No sensationalism. Neutral, clear, and helpful tone.
- Cite all sources used with canonical URLs.
- If confidence is low or claims are uncertain, say so explicitly and propose expert review.

OUTPUT:
- Always conform to the OUTPUT_SCHEMA provided per task.`;

//  Initialize Firebase Admin SDK to interact with Firestore

// Centralize the model name for easier updates.
const GEMINI_MODEL = "gemini-2.5-flash-lite";

admin.initializeApp();
const db = admin.firestore();

// A helper function to add a delay between API calls to respect rate limits.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A shared tool definition for getting structured article suggestions.
// This replaces the separate `promptSchema` objects and is used for function calling.
const saveSuggestionsTool = {
    functionDeclarations: [
        {
            name: "save_suggestions",
            description: "Saves a list of discovered article suggestions.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    suggestions: {
                        type: Type.ARRAY,
                        description: "A list of article suggestions found.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING, description: "The title of the article." },
                                shortDescription: { type: Type.STRING, description: "A brief summary of the article." },
                                categories: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Relevant categories for the article." },
                                sourceUrl: { type: Type.STRING, description: "The direct URL to the source article." },
                                sourceTitle: { type: Type.STRING, description: "The title of the source publication or website." },
                            },
                            required: ["title", "shortDescription", "categories", "sourceUrl"]
                        }
                    }
                },
                required: ["suggestions"]
            }
        }
    ]
};
// A centralized list of categories makes it easier to manage and reuse.
const SUPPORTED_CATEGORIES = [
    'Science & Technology', 
    'Health & Wellness', 
    'History & Culture', 
    'Politics & Society', 
    'Digital & Media Literacy', 
    'Business & Finance', 
    'Environment & Sustainability', 
    'Education & Learning', 
    'Arts, Media & Creativity'];

/**
 * Core logic for generating article content using the Gemini API.
 * This function is designed to be called by other Cloud Functions.
 * @param {string} articleId The ID of the article document.
 * @param {object} data The data of the article.
 * @param {string} geminiApiKey The Gemini API key.
 */
async function performContentGeneration(articleId, data, geminiApiKey) {
    console.log(`[${articleId}] Starting content generation for: "${data.title}" of type "${data.articleType}"`);
    
    if (!geminiApiKey) {
        console.error(`[${articleId}] GEMINI_API_KEY is not provided`);
        throw new Error('GEMINI_API_KEY is required for content generation');
    }
    
    const ai = new GoogleGenerativeAI(geminiApiKey);
    
    if (!ai || typeof ai.getGenerativeModel !== 'function') {
        console.error(`[${articleId}] Failed to initialize GoogleGenerativeAI instance`);
        throw new Error('Failed to initialize AI model');
    }
    
    const { title, categories, shortDescription, articleType, sourceUrl } = data;

    try {
      const categoriesText = categories.join(', ');
      const descriptionText = shortDescription ? `The user has also provided this short description for additional context: "${shortDescription}".` : '';

      let promptPersona, responseSchema, textPrompt;

      // --- Define prompts and schemas based on Article Type ---
      
      // For Trending and Positive news, we only generate a summary as we link to the source.
      if (articleType === 'Trending Topic' || articleType === 'Positive News') {
        console.log(`[${articleId}] Generating summary-only content for a '${articleType}' article.`);

        promptPersona = `You are a helpful summarizer for the "Lumina Content Platform". Your task is to create a flash summary for the topic: "${title}".`;

        textPrompt = `${promptPersona}
        The original article is from: ${sourceUrl}.
        The user has provided this context: "${shortDescription}".

        Based on the article content (which you should access if possible) and the provided context, produce a crisp, neutral summary.

        Please provide your response in a single, minified JSON object with two specific keys:
          1. "flashContent": This should contain three parts, formatted for HTML display:
             - A "Why it matters" sentence (e.g., <p><strong>Why it matters:</strong> This discovery could lead to new treatments...</p>).
             - A concise summary of 70-110 words (e.g., <p>Researchers have announced...</p>).
             - 3 bullet points highlighting key takeaways (e.g., <ul><li>Impact...</li><li>Who/Where...</li><li>What's next...</li></ul>).
          2. "imagePrompt": A vivid, descriptive text prompt for an AI image generator to create a symbolic, non-controversial image representing the topic.
        Do not include any other text or explanations outside of the single JSON object.`;

        responseSchema = {
          type: Type.OBJECT,
          properties: {
            flashContent: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
          },
          required: ["flashContent", "imagePrompt"],
        };

      // For Misinformation, we generate a full deep dive.
      } else if (articleType === 'Misinformation') {
        console.log(`[${articleId}] Generating full deep-dive content for a 'Misinformation' article.`);
        promptPersona = `You are a neutral, objective fact-checker for the "Lumina Content Platform". Your task is to write a fact-check draft for the topic: "${title}".`;

        textPrompt = `${promptPersona}
        ${descriptionText}
        Your goal is to write a balanced, fully sourced explainer that assesses the claim.

        Please provide your response in a single, minified JSON object with three specific keys:
          1. "flashContent": A concise, factual summary of 60-100 words that quickly states the verdict and the main reason. This is the "Lumina Flash".
          2. "deepDiveContent": A detailed, neutral explanation formatted with clean HTML. It MUST include the following sections:
             - A verdict (e.g., <h2>Verdict: Mostly False</h2>).
             - A "What Was Claimed" section (e.g., <h3>What Was Claimed</h3><p>...</p>).
             - An "Analysis" section that breaks down the evidence point-by-point (e.g., <h3>Analysis</h3><p>...</p><ul><li>...</li></ul>).
             - A "Context" section explaining what's missing or how the claim spread (e.g., <h3>Context</h3><p>...</p>).
             Use headings (h2, h3), bold text, paragraphs, and lists. Use shorter paragraphs for readability. Do not use H1 headings.
          3. "imagePrompt": A vivid, descriptive text prompt for an AI image generator to create a symbolic, neutral image representing truth or clarity (e.g., "A clear crystal prism refracting a single beam of light into a rainbow on a dark background.").
        Do not include any other text or explanations outside of the single JSON object.`;

        responseSchema = {
          type: Type.OBJECT,
          properties: {
            flashContent: { type: Type.STRING },
            deepDiveContent: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
          },
          required: ["flashContent", "deepDiveContent", "imagePrompt"],
        };
      } else {
        throw new Error(`Unsupported article type: ${articleType}`);
      }

      console.log(`[${articleId}] Calling Gemini API...`);
      const model = ai.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: { parts: [{ text: GLOBAL_SYSTEM_PROMPT }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });
      const result = await model.generateContent(textPrompt);

      const jsonString = result.response.text().trim();
      const generatedText = JSON.parse(jsonString);
      console.log(`[${articleId}] Successfully generated content from API.`);
 
      const articleRef = db.collection('articles').doc(articleId);
      
      // --- New Status Logic ---
      // Trending/Positive News are auto-published. Misinformation goes to expert review.
      let nextStatus;
      const updatePayload = {
        flashContent: generatedText.flashContent,
        imagePrompt: generatedText.imagePrompt,
        // Clear any previous revision notes upon successful regeneration
        adminRevisionNotes: admin.firestore.FieldValue.delete(),
      };
 
      if (articleType === 'Trending Topic' || articleType === 'Positive News') {
          nextStatus = 'Published';
          updatePayload.status = nextStatus;
          updatePayload.publishedAt = admin.firestore.FieldValue.serverTimestamp();
      } else { // Misinformation
          nextStatus = 'AwaitingExpertReview';
          updatePayload.status = nextStatus;
      }
 
      if (generatedText.deepDiveContent) {
        updatePayload.deepDiveContent = generatedText.deepDiveContent;
      } else {
        // Explicitly remove deepDiveContent if it wasn't generated to keep data clean.
        updatePayload.deepDiveContent = admin.firestore.FieldValue.delete();
      }

      await articleRef.update(updatePayload);
 
      console.log(`[${articleId}] Process complete! Article is now in status '${nextStatus}'.`);
 
    } catch (error) {
      console.error(`[${articleId}] An error occurred during content generation:`, error);
      const articleRef = db.collection('articles').doc(articleId);
      // Use a more specific error message if available, otherwise a generic one.
      const errorMessage = error.message || 'An unknown error occurred.';
      await articleRef.update({
        status: 'GenerationFailed',
        adminRevisionNotes: `AI content generation failed. Error: ${errorMessage}. Please review the draft, create content manually, or delete and recreate the draft.`
      });
      // Re-throw the error so the calling function knows it failed.
      throw error;
    }
}

/**
 * This Cloud Function automatically triggers when a new document is created in the 'articles' collection.
 * It generates the main content for the article using the Gemini API.
 */
export const generateArticleContent = onDocumentCreated({
  document: "articles/{articleId}",
  region: "europe-west1",
  secrets: ["GEMINI_API_KEY"],
  // This function is now a fast dispatcher, so we can allow high concurrency.
  concurrency: 50,
}, async (event) => {
    const articleId = event.params.articleId;
    const snapshot = event.data;

    if (!snapshot) {
      console.log(`[${articleId}] Event is missing data. Exiting.`);
      return;
    }

    const data = snapshot.data();

    // This function now only acts as a dispatcher for new 'Draft' articles.
    if (data.status !== 'Draft') {
      console.log(`[${articleId}] Ignoring article with status '${data.status}'. Not a new draft.`);
      return;
    }

    console.log(`[${articleId}] New draft detected. Queuing for content generation.`);

    try {
      // Enqueue the task for processing by the 'processArticle' worker function.
      // Using the full resource name is more robust and can prevent "Queue does not exist" errors
      // that sometimes occur due to IAM propagation delays or resolution issues.
      const functionName = "projects/lumina-summaries/locations/europe-west1/functions/processArticle";
      const queue = getFunctions().taskQueue(functionName);
      await queue.enqueue({ articleId: articleId });

      // Update the article status to 'Queued' to provide UI feedback and prevent re-triggering.
      await snapshot.ref.update({ status: 'Queued' });

      console.log(`[${articleId}] Successfully queued for generation.`);
    } catch (error) {
      console.error(`[${articleId}] Failed to enqueue article for generation:`, error);
      // If enqueueing fails, set a status that allows for manual re-triggering.
      await snapshot.ref.update({
        status: 'GenerationFailed',
        adminRevisionNotes: `System Error: Failed to queue the article for AI content generation. Error: ${error.message}`
      });
    }
});

/**
 * A callable function that allows an Admin to manually re-queue an article for generation.
 */
export const queueArticleContentGeneration = onCall(
    {
        region: "europe-west1",
        secrets: ["GEMINI_API_KEY"],
        cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
    },
    async (request) => {
        // 1. Check authentication and authorization
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
        }
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'Admin') {
            throw new HttpsError('permission-denied', 'Only admins can re-queue articles.');
        }

        // 2. Extract article data from request
        const { articleId } = request.data;
        if (!articleId || typeof articleId !== 'string') {
            throw new HttpsError('invalid-argument', 'The function must be called with an "articleId" argument.');
        }

        // 3. Enqueue the article generation task
        try {
            // Using the full resource name is more robust and can prevent "Queue does not exist" errors.
            const functionName = "projects/lumina-summaries/locations/europe-west1/functions/processArticle";
            const queue = getFunctions().taskQueue(functionName);
            await queue.enqueue({ articleId: articleId });

            // Update status to Queued
            await db.collection('articles').doc(articleId).update({
                status: 'Queued',
                // Clear any previous revision notes when re-queueing.
                adminRevisionNotes: admin.firestore.FieldValue.delete()
            });

            return { success: true, message: `Successfully queued content generation for ${articleId}.` };
        } catch (error) {
            console.error(`[${articleId}] Failed to enqueue article for regeneration:`, error);
            throw new HttpsError('internal', 'Failed to enqueue the task.', { originalError: error.message });
        }
    }
);

/**
 * A callable function that allows an Admin to re-queue all articles that
 * previously failed during generation.
 */
export const requeueAllFailedArticles = onCall(
    {
        region: "europe-west1",
        secrets: ["GEMINI_API_KEY"],
        cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
    },
    async (request) => {
        // 1. Check authentication and authorization
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
        }
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'Admin') {
            throw new HttpsError('permission-denied', 'Only admins can perform this action.');
        }

        console.log("Starting bulk re-queue for all 'GenerationFailed' articles.");

        try {
            console.log("Starting bulk re-queue process...");
            const articlesRef = db.collection('articles');
            const querySnapshot = await articlesRef.where('status', '==', 'GenerationFailed').get();

            if (querySnapshot.empty) {
                console.log("No articles found with status 'GenerationFailed'.");
                return { success: true, message: "No articles to re-queue.", count: 0 };
            }

            const failedArticles = querySnapshot.docs;
            console.log(`Found ${failedArticles.length} failed articles.`);
            // Using the full resource name is more robust and can prevent "Queue does not exist" errors.
            const functionName = "projects/lumina-summaries/locations/europe-west1/functions/processArticle";
            const queue = getFunctions().taskQueue(functionName);
            let requeuedCount = 0;

            // Process articles in chunks to avoid exceeding Firestore and Task Queue limits.
            // Firestore batch writes are limited to 500 operations.
            // Task Queue bulk enqueue is limited to 100 tasks per call. We'll use 100.
            const chunkSize = 100;
            for (let i = 0; i < failedArticles.length; i += chunkSize) {
                const chunk = failedArticles.slice(i, i + chunkSize);
                console.log(`Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(failedArticles.length / chunkSize)} with ${chunk.length} articles.`);

                // Prepare a batch of tasks for the Task Queue
                const tasksToEnqueue = chunk.map((doc) => ({ articleId: doc.id }));

                // Prepare a batch of writes for Firestore to update statuses
                const firestoreBatch = db.batch();
                chunk.forEach((doc) => {
                    const docRef = articlesRef.doc(doc.id);
                    firestoreBatch.update(docRef, { status: "Queued", adminRevisionNotes: admin.firestore.FieldValue.delete() });
                });

                // Enqueue all tasks for the chunk in a single bulk operation.
                // This is more efficient than enqueueing one by one in a loop.
                // The v2 SDK handles an array of task objects correctly, creating
                // one task for each object in the array.
                await queue.enqueue(tasksToEnqueue);

                // If enqueueing succeeds, then commit the Firestore status updates.
                await firestoreBatch.commit();

                requeuedCount += chunk.length;
                console.log(`Successfully enqueued and updated status for ${chunk.length} articles.`);
            }

            console.log(`Successfully re-queued ${requeuedCount} articles.`);
            return { success: true, message: `Successfully re-queued ${requeuedCount} articles.`, count: requeuedCount };
        } catch (error) {
            console.error("Failed to re-queue all failed articles:", error);
            console.error("Error details:", error.message, error.stack);
            throw new HttpsError('internal', 'An error occurred during the bulk re-queue process.', { originalError: error.message });
        }
    }
);
/**
 * A callable function that allows an Admin to manually trigger content regeneration
 * for an article , typically one that previously failed. This is synchronous and bypasses the queue.
 */
export const regenerateArticleContent = onCall({
  region: "europe-west1",
  secrets: ["GEMINI_API_KEY"],
  cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
}, async (request) => {
    // 1. Check authentication and authorization
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'Admin') {
        throw new HttpsError('permission-denied', 'Only admins can regenerate article content.');
    }

    // 2. Validate input
    const { articleId } = request.data;
    if (!articleId || typeof articleId !== 'string') {
        throw new HttpsError('invalid-argument', 'The function must be called with an "articleId" argument.');
    }

    // 3. Fetch article data
    const articleRef = db.collection('articles').doc(articleId);
    const articleDoc = await articleRef.get();
    if (!articleDoc.exists) {
        throw new HttpsError('not-found', `Article with ID ${articleId} not found.`);
    }

    // 4. Call the core generation logic
    const geminiApiKey = process.env.GEMINI_API_KEY;
    try {
        await performContentGeneration(articleId, articleDoc.data(), geminiApiKey);
        return { success: true, message: `Successfully regenerated content for ${articleId}.` };
    } catch (error) {
        // The helper function handles updating the doc, so we just throw the appropriate HttpsError.
        throw new HttpsError('internal', `Content generation failed for ${articleId}. See article for details.`, { originalError: error.message });
    }
});

/**
 * Processes a single discovery configuration to find and save new topic suggestions.
 * @param {object} config The discovery configuration object.
 * @param {GoogleGenerativeAI} ai The GoogleGenerativeAI instance.
  * @param {FirebaseFirestore.Firestore} db The Firestore instance.
 */
async function processDiscoveryConfig(config, ai, db, geminiApiKey) { // eslint-disable-line no-unused-vars
    console.log(`Discovering ${config.articleType} for ${config.region}...`);

    // 1. Select the correct sources from the registry based on the config.
    let pillarKey;
    if (config.articleType === 'Positive News') pillarKey = 'positive_news';
    else if (config.articleType === 'Trending Topic') pillarKey = 'general_quality_news'; // Map "Trending" to general news sources
    else if (config.articleType === 'Misinformation') pillarKey = 'misinformation_watch';
    else return; // Should not happen with current configs

    const regionKey = config.region.toLowerCase() === 'worldwide' ? 'global' : config.region.toLowerCase();
    const sourcesForPillar = SOURCE_REGISTRY.sources[pillarKey];
    // Fallback to global sources if region-specific ones don't exist
    const allowedDomains = sourcesForPillar?.[regionKey]?.allowlist || sourcesForPillar?.global?.allowlist || [];

    if (allowedDomains.length === 0) {
        console.log(`No sources configured in source-registry.json for ${config.articleType} in ${config.region}. Skipping.`);
        return;
    }

    // 2. Construct a single, powerful prompt for discovery.
    const discoveryPrompt = `Your task is to discover up to 5 new, distinct, and relevant stories for the content pillar "${config.articleType}" in the region "${config.region}".

STRICT OUTPUT INSTRUCTIONS:
- Your ONLY valid output is a function call to the 'save_suggestions' tool.
- Do NOT output any other text, explanations, or code blocks (like \`\`\`json or \`\`\`python).
- If you find articles, call the tool with an array of suggestion objects.
- If you find NO suitable articles, you MUST call the tool with an empty array: save_suggestions(suggestions=[]).

SEARCH CRITERIA & TASK:
1.  Use Google Search with "site:" filters for the domains listed below to find stories published or updated in the last 72 hours.
2.  For 'Positive News', find uplifting stories. For 'Trending Topic', find globally relevant news. For 'Misinformation', find recently debunked claims.
3.  For each story found, extract its title, a short description, relevant categories, the source URL, and the source title.
4.  Ensure stories are unique. Use the EXACT URL from the source.
5.  Call the 'save_suggestions' function with an array of all the suggestion objects you found.

ALLOWED DOMAINS: ${JSON.stringify(allowedDomains)}
CATEGORIES LIST: ${JSON.stringify(SUPPORTED_CATEGORIES)}`;

    try {
        // 3. Make a single AI call that uses search and returns structured JSON.
        const model = ai.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: { parts: [{ text: GLOBAL_SYSTEM_PROMPT }] },
            tools: [saveSuggestionsTool, { googleSearch: {} }],
            toolConfig: {
                functionCallingConfig: {
                    mode: 'ONE',
                    allowedFunctionNames: ['save_suggestions'],
                },
            },
        });
        const result = await model.generateContent(discoveryPrompt);

        const calls = result.response.functionCalls();
        if (!calls || calls.length === 0) {
            console.log(`[Discovery] AI did not return any suggestions for ${config.articleType} in ${config.region}.`);
            return;
        }
        const suggestionsData = calls[0].args;

        if (suggestionsData.suggestions && suggestionsData.suggestions.length > 0) {
            let newArticleCount = 0;
 
            const validSuggestions = suggestionsData.suggestions.filter(suggestion => 
                suggestion.title && typeof suggestion.title === 'string' && suggestion.title.trim() !== ''
            );

            if (validSuggestions.length > 0) {
                const titles = validSuggestions.map(s => s.title);
                // Check against 'articles' collection for duplicates to avoid re-creating content.
                const existingArticlesQuery = db.collection('articles')
                    .where('title', 'in', titles)
                    .where('region', '==', config.region)
                    .where('articleType', '==', config.articleType);

                const existingArticlesSnapshot = await existingArticlesQuery.get();
                const existingTitles = new Set(existingArticlesSnapshot.docs.map(doc => doc.data().title));

                for (const suggestion of validSuggestions) {
                    if (existingTitles.has(suggestion.title)) {
                        console.log(`[Discovery] Skipping duplicate article: "${suggestion.title}"`);
                        continue;
                    }

                    // Create a new article document and immediately trigger its generation.
                    const newArticleRef = db.collection('articles').doc();
                    const articleData = {
                        title: suggestion.title,
                        articleType: config.articleType,
                        categories: suggestion.categories || [],
                        region: config.region,
                        shortDescription: suggestion.shortDescription,
                        // Set status to 'Draft'. The onDocumentCreated trigger
                        // will automatically queue it for generation.
                        status: 'Draft',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        discoveredAt: admin.firestore.FieldValue.serverTimestamp(),
                        sourceUrl: suggestion.sourceUrl || null,
                        sourceTitle: suggestion.sourceTitle || null,
                    };

                    // By setting the document with status 'Draft', we allow the
                    // `generateArticleContent` trigger to handle the queueing.
                    await newArticleRef.set(articleData);
                    console.log(`[${newArticleRef.id}] Created new article draft for "${suggestion.title}". It will be queued for generation.`);
                    newArticleCount++;
                }
            }

            if (newArticleCount > 0) {
                console.log(`Successfully discovered and generated content for ${newArticleCount} new articles for ${config.articleType} in ${config.region}.`);
            } else {
                console.log(`No new, unique articles were generated for ${config.articleType} in ${config.region}.`);
            }
        }
    } catch (error) {
        console.error(`Failed to discover topics for ${config.articleType} in ${config.region}:`, error);
        // Re-throw the error so that Promise.allSettled can capture the failure.
        throw error;
    }
}

/**
 * This scheduled Cloud Function runs every 6 hours to automatically discover trending topics
  * and positive news stories using a search-grounded AI model.
 */
export const discoverTopics = onSchedule({
    schedule: "every 24 hours",
    region: "europe-west1",
    secrets: ["GEMINI_API_KEY"],
}, async (event) => {
    console.log("Running scheduled topic discovery...");
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        console.error("Cannot discover topics: Gemini API key is not configured in secrets.");
        return;
    }

    const ai = new GoogleGenerativeAI(geminiApiKey);
    
    if (!ai || typeof ai.getGenerativeModel !== 'function') {
        console.error('Failed to initialize GoogleGenerativeAI instance for topic discovery');
        return;
    }
    const discoveryConfigs = [
        { articleType: 'Trending Topic', region: 'Worldwide' },
        { articleType: 'Trending Topic', region: 'USA' },
        { articleType: 'Trending Topic', region: 'India' },
        { articleType: 'Trending Topic', region: 'Europe' },
        { articleType: 'Positive News', region: 'Worldwide' },
        { articleType: 'Positive News', region: 'USA' },
        { articleType: 'Positive News', region: 'India' },
        { articleType: 'Positive News', region: 'Europe' },
        { articleType: 'Misinformation', region: 'Worldwide' },
    ];

    // We can process these in parallel to speed up the discovery process.
    // Note: This runs discovery jobs in parallel, but the source tests run sequentially.
    const discoveryPromises = discoveryConfigs.map(config => 
        processDiscoveryConfig(config, ai, db, geminiApiKey)
    );

    const results = await Promise.allSettled(discoveryPromises);

    console.log("Scheduled topic discovery complete. Summary:");
    results.forEach((result, index) => {
        const config = discoveryConfigs[index];
        if (result.status === 'fulfilled') {
            console.log(`  [SUCCESS] ${config.articleType} in ${config.region}`);
        } else {
            console.error(`  [FAILED]  ${config.articleType} in ${config.region}:`, result.reason.message);
        }
    });
});

/**
 * Processes a single source domain to test its viability and fetch one article.
 * Logs the result to a source test report in Firestore.
 * @param {object} source - The source object { domain, pillar, region }.
 * @param {admin.firestore.DocumentReference} reportRef - The reference to the main report document.
 * @param {GoogleGenerativeAI} ai - The GoogleGenerativeAI instance.
 */
async function processSingleSourceTest(source, reportRef, ai) {
    const { domain, pillar, region } = source;
    const reportResultsRef = reportRef.collection('results');
    const docId = domain.replace(/[^a-zA-Z0-9.-]/g, '_');

    let articleType;
    if (pillar === 'positive_news') articleType = 'Positive News';
    else if (pillar === 'general_quality_news') articleType = 'Trending Topic';
    else if (pillar === 'research_breakthroughs') articleType = 'Trending Topic';
    else if (pillar === 'misinformation_watch') articleType = 'Misinformation';
    else {
        await reportResultsRef.doc(docId).set({
            ...source,
            status: 'Failure',
            error: `Unsupported pillar type: ${pillar}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await reportRef.update({ failureCount: admin.firestore.FieldValue.increment(1) });
        return;
    }

    const testPrompt = `
Find ONE recent article from site:${domain} that is relevant to "${articleType}" in the "${region}" region.

Respond ONLY by calling the "save_suggestions" function. Do not return plain text.
The function must be called with JSON like:

{
  "suggestions": [
    {
      "title": "Article title",
      "sourceUrl": "https://...",
      "sourceTitle": "${domain}",
      "categories": ["SomeCategory"],
      "shortDescription": "One-sentence summary."
    }
  ]
}

If no article is found, call it with { "suggestions": [] }.
`;

    try {
        // Validate ai parameter before using it
        if (!ai || typeof ai.getGenerativeModel !== 'function') {
            throw new Error(`Invalid AI instance passed to processSingleSourceTest for ${domain}. AI instance: ${typeof ai}`);
        }
        
        const model = ai.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: { parts: [{ text: GLOBAL_SYSTEM_PROMPT }] },
            tools: [saveSuggestionsTool, { googleSearch: {} }],
            toolConfig: {
                functionCallingConfig: {
                    mode: "ONE",
                    allowedFunctionNames: ["save_suggestions"],
                },
            },
        });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: testPrompt }] }],
        });

        const call = result.response.functionCalls()?.[0];

        if (!call) {
            const rawText = result.response.text() || "No response text.";
            throw new Error(`AI did not call the required function. Raw response: ${rawText}`);
        }

        const suggestionsData = call.args;

        // same handling logic for no articles / already exists / new draft...
        if (suggestionsData.suggestions.length === 0) {
            await reportResultsRef.doc(docId).set({
                ...source,
                status: "Success",
                message: "No recent articles found.",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            await reportRef.update({ successCount: admin.firestore.FieldValue.increment(1) });
            return;
        }

        const suggestion = suggestionsData.suggestions[0];
        if (!suggestion.title || !suggestion.sourceUrl) {
            throw new Error(`Suggestion missing fields: ${JSON.stringify(suggestion)}`);
        }

        // continue with saving article...
        const existingArticle = await db.collection("articles")
            .where("sourceUrl", "==", suggestion.sourceUrl)
            .limit(1).get();

        if (!existingArticle.empty) {
            await reportResultsRef.doc(docId).set({
                ...source,
                status: "Success",
                message: "Article already exists.",
                fetchedArticleTitle: suggestion.title,
                fetchedArticleUrl: suggestion.sourceUrl,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            await reportRef.update({ successCount: admin.firestore.FieldValue.increment(1) });
            return;
        }

        const newArticleRef = db.collection("articles").doc();
        await newArticleRef.set({
            title: suggestion.title,
            articleType,
            categories: suggestion.categories || [],
            region,
            shortDescription: suggestion.shortDescription || "Discovered via source test.",
            status: "Draft",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            discoveredAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceUrl: suggestion.sourceUrl,
            sourceTitle: suggestion.sourceTitle || domain,
            discoveryMethod: "SourceTest",
            sourceTestReportId: reportRef.id,
        });

        await reportResultsRef.doc(docId).set({
            ...source,
            status: "Success",
            message: "Created new article draft.",
            fetchedArticleTitle: suggestion.title,
            fetchedArticleUrl: suggestion.sourceUrl,
            createdArticleId: newArticleRef.id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await reportRef.update({ successCount: admin.firestore.FieldValue.increment(1) });

    } catch (err) {
        console.error(`[Source Test] FAILED for ${domain}:`, err);
        await reportResultsRef.doc(docId).set({
            ...source,
            status: "Failure",
            error: err.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await reportRef.update({ failureCount: admin.firestore.FieldValue.increment(1) });
    }
}


/**
 * A callable function for admins to test every source in source-registry.json.
 * It generates a report in Firestore under the `sourceTestReports` collection.
 */
export const testAllSources = onCall({
    region: "europe-west1",
    secrets: ["GEMINI_API_KEY"],
    cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
    timeoutSeconds: 540, // Allow up to 9 minutes for all sources to be tested.
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'Admin') {
        throw new HttpsError('permission-denied', 'Only admins can run this source test.');
    }

    console.log(`[Source Test] Starting test run, initiated by ${userDoc.data().email}.`);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
        console.error('[Source Test] GEMINI_API_KEY environment variable is not set');
        throw new HttpsError('internal', 'GEMINI_API_KEY environment variable is not configured');
    }
    
    const ai = new GoogleGenerativeAI(geminiApiKey);
    
    if (!ai || typeof ai.getGenerativeModel !== 'function') {
        console.error('[Source Test] Failed to initialize GoogleGenerativeAI instance');
        throw new HttpsError('internal', 'Failed to initialize AI model');
    }

    const reportRef = db.collection('sourceTestReports').doc();
    await reportRef.set({
        status: 'Running',
        testType: 'Full', // Differentiate from the sample test
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalSources: 0,
        successCount: 0,
        failureCount: 0,
        triggeredBy: userDoc.data().email,
    });

    const sourcesToTest = [];
    const pillars = Object.keys(SOURCE_REGISTRY.sources);
    for (const pillar of pillars) {
        const pillarData = SOURCE_REGISTRY.sources[pillar];
        const regions = Object.keys(pillarData);
        for (const region of regions) {
            if (region === 'notes') continue;
            const regionData = pillarData[region];
            if (regionData.allowlist && Array.isArray(regionData.allowlist)) {
                for (const domain of regionData.allowlist) {
                    sourcesToTest.push({ domain, pillar, region });
                }
            }
        }
    }

    await reportRef.update({ totalSources: sourcesToTest.length });

    // Process each source sequentially to avoid overwhelming APIs.
    for (const source of sourcesToTest) {
        await processSingleSourceTest(source, reportRef, ai);
        await delay(1200); // Wait 1.2 seconds to stay safely under 60 RPM limit.
    }

    const finalReportSnap = await reportRef.get();
    const finalData = finalReportSnap.data();
    await reportRef.update({
        status: 'Completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const summary = `Source test completed. Report ID: ${reportRef.id}. Success: ${finalData.successCount}, Failure: ${finalData.failureCount}`;
    console.log(`[Source Test] ${summary}`);
    return { success: true, message: summary, reportId: reportRef.id };
});

/**
 * A callable function for admins to test a small sample of sources from source-registry.json.
 * It selects one source per pillar/region combination to provide a quick, low-cost health check.
 * It generates a report in Firestore under the `sourceTestReports` collection.
 */
export const testSampleSources = onCall({
    region: "europe-west1",
    secrets: ["GEMINI_API_KEY"],
    cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
    timeoutSeconds: 180, // Shorter timeout for a smaller sample.
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'Admin') {
        throw new HttpsError('permission-denied', 'Only admins can run this source test.');
    }

    console.log("[Source Sample Test] Request received:", request);

    console.log(`[Source Sample Test] Starting test run, initiated by ${userDoc.data().email}.`);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
        console.error('[Source Sample Test] GEMINI_API_KEY environment variable is not set');
        throw new HttpsError('internal', 'GEMINI_API_KEY environment variable is not configured');
    }
    
    const ai = new GoogleGenerativeAI(geminiApiKey);
    
    if (!ai || typeof ai.getGenerativeModel !== 'function') {
        console.error('[Source Sample Test] Failed to initialize GoogleGenerativeAI instance');
        throw new HttpsError('internal', 'Failed to initialize AI model');
    }

    const reportRef = db.collection('sourceTestReports').doc();
    await reportRef.set({
        status: 'Running',
        testType: 'Sample', // Differentiate from the full test
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalSources: 0,
        successCount: 0,
        failureCount: 0,
        triggeredBy: userDoc.data().email,
    });

    let sourcesToTest = [];
    const pillars = Object.keys(SOURCE_REGISTRY.sources);
    for (const pillar of pillars) {
        const pillarData = SOURCE_REGISTRY.sources[pillar];
        const regions = Object.keys(pillarData);
        for (const region of regions) {
            if (region === 'notes') continue;
            const regionData = pillarData[region];
            if (regionData.allowlist && Array.isArray(regionData.allowlist) && regionData.allowlist.length > 0) {
                // Take the first source from each list as a sample.
                const sampleDomain = regionData.allowlist[0];
                sourcesToTest.push({ domain: sampleDomain, pillar, region });
            }
        }
    }

    await reportRef.update({ totalSources: sourcesToTest.length });

    // Process each source sequentially to avoid overwhelming APIs.
    for (const source of sourcesToTest) {
        await processSingleSourceTest(source, reportRef, ai);
        await delay(1200); // Wait 1.2 seconds to stay safely under 60 RPM limit.
    }

    const finalReportSnap = await reportRef.get();
    const finalData = finalReportSnap.data();
    await reportRef.update({
        status: 'Completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const summary = `Source sample test completed. Report ID: ${reportRef.id}. Success: ${finalData.successCount}, Failure: ${finalData.failureCount}`;
    console.log(`[Source Sample Test] ${summary}`);
    return { success: true, message: summary, reportId: reportRef.id };
});
/**
 * Generates an image using an external API and returns its URL.
 * This is a callable function, which handles CORS automatically for allowed origins.
 * NOTE: This is a placeholder implementation. You will need to replace the
 * placeholder logic with a real call to an image generation service (like
 * Gemini, DALL-E, etc.) and upload the result to Firebase Storage.
 */
export const generateImage = onCall({
  // Note: Your other functions are in europe-west1. The error showed us-central1.
  // Ensure you use the region that is geographically closer to your users.
  region: "europe-west1",
  secrets: ["GEMINI_API_KEY"], // Add any other secrets if needed
  // This is the crucial part that fixes the CORS error.
  // It allows your Netlify app and local development server to call the function.
  cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
}, async (request) => {
    // 1. Check authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { prompt } = request.data;
    if (!prompt || typeof prompt !== 'string') {
        throw new HttpsError('invalid-argument', 'The function must be called with a "prompt" argument.');
    }

    console.log(`Generating image for prompt: "${prompt}"`);

    try {
        // --- Placeholder for actual image generation logic ---
        // Replace this with your actual image generation and upload logic.
        // This example returns a placeholder image from picsum.photos.
        const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/768`;
        console.log(`Successfully "generated" image: ${imageUrl}`);
        
        return { success: true, imageUrl: imageUrl };

    } catch (error) {
        console.error("Error during image generation:", error);
        throw new HttpsError('internal', 'Failed to generate image.', error.message);
    }
});



export const processArticle = onTaskDispatched(
    {
        region: "europe-west1",
        secrets: ["GEMINI_API_KEY"],
        retryConfig: {
            maxAttempts: 3,
            minBackoffSeconds: 60,
        },
        rateLimits: {
            // This is the key for rate-limiting. It ensures only one article is
            // generated at a time, respecting the Gemini API limits.
            maxConcurrentDispatches: 1,
        }
    },
    async (req) => {
        const { articleId } = req.data;
        if (!articleId) {
            console.error("Task received without an articleId. Aborting.", req.data);
            return; // Acknowledge the task to prevent retries for a malformed request.
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            console.error(`[${articleId}] Gemini API key is not configured. Cannot process task.`);
            await db.collection('articles').doc(articleId).update({
                status: 'NeedsRevision',
                adminRevisionNotes: 'AI configuration error: The Gemini API key is missing. Please contact an administrator.'
            });
            return;
        }

        const articleRef = db.collection('articles').doc(articleId);
        const articleDoc = await articleRef.get();

        if (!articleDoc.exists) {
            console.error(`[${articleId}] Article document not found in Firestore. Aborting task.`);
            return;
        }
        const articleData = articleDoc.data();

        try {
            await performContentGeneration(articleId, articleData, geminiApiKey);
        } catch (error) {
            // performContentGeneration already updates the document status on failure.
            // We log the error here, but we don't re-throw it, as this would cause a retry for a permanent failure.
            console.error(`[${articleId}] Content generation failed for queued task. The article has been marked for revision. Error:`, error.message);
        }
    }
);