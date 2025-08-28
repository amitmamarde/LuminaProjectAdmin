// This file uses the modern ES Module syntax and the v2 Cloud Functions API for a successful deployment.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import { GoogleGenerativeAI, Type } from "@google/genai";
import Parser from "rss-parser";
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
const rssParser = new Parser();

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

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const articleRef = db.collection('articles').doc(articleId);
    let { title, categories, shortDescription, articleType, sourceUrl } = data;

    // --- Verify 'Positive News' classification before proceeding ---
    if (articleType === 'Positive News') {
        console.log(`[${articleId}] Verifying 'Positive News' classification.`);
        try {
            const classificationModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
            const classificationPrompt = `Based on the title and summary below, is the story primarily positive, uplifting, or about a constructive solution? Answer only with "Yes" or "No".\n\nTitle: "${title}"\nSummary: "${shortDescription}"`;
            const result = await classificationModel.generateContent(classificationPrompt);
            const answer = result.response.text().trim();

            if (answer.toLowerCase().includes('no')) {
                console.log(`[${articleId}] AI classified this as NOT positive news. Changing type to 'Trending Topic'.`);
                articleType = 'Trending Topic'; // Update local variable for this run
                // Update the document in the background. No need to await.
                articleRef.update({ articleType: 'Trending Topic' });
            } else {
                console.log(`[${articleId}] AI confirmed this is positive news.`);
            }
        } catch (e) {
            console.warn(`[${articleId}] Failed to verify article type, proceeding with original type. Error: ${e.message}`);
        }
    }

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
          1. "flashContent": A professional, engaging summary of approximately 60 words. It should be a single paragraph of plain text. Start with a "Why it matters" concept, followed by the core summary, and incorporate key takeaways. Do NOT use any HTML tags (like <p>, <ul>, <li>) or markdown.
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
          1. "flashContent": A concise, factual summary of approximately 60 words that quickly states the verdict and the main reason. This is the "Lumina Flash". It should be plain text without HTML.
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
      const model = genAI.getGenerativeModel({
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
 * Extracts suggestion data from a Gemini API response, handling both
 * direct function calls and JSON embedded in text.
 * @param {object} response The `response` object from the Gemini API call.
 * @param {string} context A string for logging (e.g., the domain being tested).
 * @returns {object|null} The suggestions data object or null if not found.
 */
function getSuggestionsFromApiResponse(response, context) {
    const calls = response?.functionCalls();
    if (calls && calls.length > 0) {
        console.log(`[Parser] Extracted suggestions for "${context}" via direct function call.`);
        return calls[0].args;
    }

    const textResponse = response?.text();
    if (!textResponse) {
        console.log(`[Parser] No function call or text response for "${context}".`);
        return null;
    }

    // Regex to find a JSON block inside ```json ... ``` or a raw JSON array/object
    const jsonRegex = /```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\]|\{[\s\S]*\s*\})/;
    const match = textResponse.match(jsonRegex);
    let jsonString = match ? (match[1] || match[2])?.trim() : null;

    if (jsonString) {
        try {
            // Handle if the model includes the function call name
            const functionCallRegex = /^\s*save_suggestions\(([\s\S]*)\)\s*$/;
            const functionMatch = jsonString.match(functionCallRegex);
            if (functionMatch && functionMatch[1]) {
                jsonString = functionMatch[1];
            }

            const parsed = JSON.parse(jsonString);

            if (Array.isArray(parsed)) {
                console.log(`[Parser] Extracted suggestions for "${context}" by parsing a JSON array from text.`);
                return { suggestions: parsed };
            } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                console.log(`[Parser] Extracted suggestions for "${context}" by parsing a suggestions object from text.`);
                return parsed;
            }
        } catch (e) {
            console.warn(`[Parser] Could not parse extracted JSON-like string for "${context}". Error: ${e.message}`);
        }
    }
    return null;
}

/**
 * Processes a single RSS feed to find and create new article drafts.
 * @param {object} source The source object from the registry, including rssUrl.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.limit=5] - The number of recent articles to process from the feed.
 * @param {string} [options.initialStatus='Draft'] - The status to set for new articles.
 */
async function processRssFeed(source, options = {}) {
    const { initialStatus = 'Draft', limit = 5 } = options;
    const { rssUrl, pillar, region, domain } = source;
    console.log(`[RSS] Processing feed for ${domain} in ${region}`);

    try {
        const feed = await rssParser.parseURL(rssUrl);
        if (!feed.items || feed.items.length === 0) {
            console.log(`[RSS] No items found in feed for ${domain}`);
            return;
        }

        let newArticleCount = 0;
        // Limit to the 5 most recent articles from the feed to avoid large writes
        const recentItems = feed.items.slice(0, limit);

        for (const item of recentItems) {
            const sourceUrl = item.link;
            if (!sourceUrl) {
                console.warn(`[RSS] Skipping item with no link from ${domain}: "${item.title}"`);
                continue;
            }

            // Check for duplicates based on the source URL
            const existingArticleQuery = db.collection('articles').where('sourceUrl', '==', sourceUrl).limit(1);
            const existingSnapshot = await existingArticleQuery.get();

            if (!existingSnapshot.empty) {
                // console.log(`[RSS] Skipping duplicate article from ${domain}: "${item.title}"`);
                continue;
            }

            // --- Category processing logic ---
            const sourceCategories = item.categories || [];
            const validCategories = sourceCategories
                .map(cat => typeof cat === 'string' ? cat.trim() : (cat.name || '')) // Handle different category formats from rss-parser
                .filter(cat => cat && SUPPORTED_CATEGORIES.includes(cat));
            const finalCategories = validCategories.slice(0, 3);

            // Map pillar to ArticleType
            let articleType;
            if (pillar === 'positive_news') articleType = 'Positive News';
            else if (pillar === 'general_quality_news' || pillar === 'research_breakthroughs') articleType = 'Trending Topic';
            else if (pillar === 'misinformation_watch') articleType = 'Misinformation';
            else continue; // Skip unknown pillars

            // Create new article draft
            const newArticleRef = db.collection('articles').doc();
            const articleData = {
                title: item.title || 'Untitled',
                articleType: articleType,
                categories: finalCategories, // Use the cleaned and limited categories
                region: region,
                // Use contentSnippet or description, fallback to empty string
                shortDescription: item.contentSnippet || item.content || '',
                status: initialStatus,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                discoveredAt: item.isoDate ? new Date(item.isoDate) : admin.firestore.FieldValue.serverTimestamp(),
                sourceUrl: sourceUrl,
                sourceTitle: feed.title || domain,
                discoveryMethod: 'RSS',
            };

            // If publishing directly, set publishedAt and a basic flashContent from the RSS snippet.
            if (initialStatus === 'Published') {
                articleData.publishedAt = admin.firestore.FieldValue.serverTimestamp();
                articleData.flashContent = `<p>${item.contentSnippet || item.content || 'Summary not available.'}</p>`;
            }

            await newArticleRef.set(articleData);
            console.log(`[${newArticleRef.id}] Created new draft from RSS feed for "${item.title}"`);
            newArticleCount++;
        }

        if (newArticleCount > 0) {
            console.log(`[RSS] Successfully created ${newArticleCount} new drafts from ${domain}.`);
        }

    } catch (error) {
        console.error(`[RSS] Failed to process feed for ${domain} at ${rssUrl}:`, error.message);
        throw error;
    }
}

/**
 * This scheduled Cloud Function runs periodically to discover new articles
 * by polling RSS feeds from the source registry.
 */
export const discoverTopics = onSchedule({
    schedule: "every 24 hours",
    region: "europe-west1",
}, async (event) => {
    console.log("Running scheduled RSS topic discovery...");

    const allSources = [];
    // 1. Flatten all sources from the registry into a single list
    for (const pillar in SOURCE_REGISTRY.sources) {
        if (!Object.prototype.hasOwnProperty.call(SOURCE_REGISTRY.sources, pillar)) continue;
        for (const region in SOURCE_REGISTRY.sources[pillar]) {
            if (!Object.prototype.hasOwnProperty.call(SOURCE_REGISTRY.sources[pillar], region) || region === 'notes') continue;
            
            const allowlist = SOURCE_REGISTRY.sources[pillar][region].allowlist || [];
            for (const source of allowlist) {
                if (source.rssUrl) {
                    allSources.push({
                        ...source, // contains domain and rssUrl
                        pillar,
                        region,
                    });
                }
            }
        }
    }

    // 2. Process each source feed in parallel.
    const discoveryPromises = allSources.map(source => processRssFeed(source));

    const results = await Promise.allSettled(discoveryPromises);

    console.log("Scheduled topic discovery complete. Summary:");
    results.forEach((result, index) => {
        const source = allSources[index];
        if (result.status === 'fulfilled') {
            console.log(`  [SUCCESS] ${source.domain} in ${source.region}`);
        } else {
            console.error(`  [FAILED]  ${source.domain} in ${source.region}:`, result.reason.message);
        }
    });
});

/**
 * Processes a single source domain to test its viability and fetch one article.
 * Logs the result to a source test report in Firestore.
 * @param {object} source - The source object { domain, pillar, region }.
 * @param {admin.firestore.DocumentReference} reportRef - The reference to the main report document.
 * @param {GoogleGenerativeAI} genAI - The GoogleGenerativeAI instance.
 */
async function processSingleSourceTest(source, reportRef, genAI) {
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

        const model = genAI.getGenerativeModel({
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

        const result = await model.generateContent(testPrompt);

        const suggestionsData = getSuggestionsFromApiResponse(result.response, domain);

        if (!suggestionsData) {
            throw new Error("AI did not return a function call or parsable JSON. Result: " + JSON.stringify(result.response));
        }

        // This is a valid success case: the source is working but has no new articles.
        if (!suggestionsData.suggestions || suggestionsData.suggestions.length === 0) {
            await reportResultsRef.doc(docId).set({
                ...source,
                status: 'Success',
                fetchedArticleTitle: 'No new articles found',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            await reportRef.update({ successCount: admin.firestore.FieldValue.increment(1) });
            console.log(`[Source Test] SUCCESS for ${domain}: No new articles found, which is a valid outcome.`);
            return;
        }

        const suggestion = suggestionsData.suggestions[0];

        const existingArticle = await db.collection('articles').where('sourceUrl', '==', suggestion.sourceUrl).limit(1).get();
        if (!existingArticle.empty) {
            console.log(`[Source Test] SUCCESS for ${domain}, but article already exists: ${suggestion.sourceUrl}`);
            await reportResultsRef.doc(docId).set({ ...source, status: 'Success (Duplicate)', fetchedArticleTitle: suggestion.title, fetchedArticleUrl: suggestion.sourceUrl, createdArticleId: existingArticle.docs[0].id, timestamp: admin.firestore.FieldValue.serverTimestamp() });
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
        console.log(`[Source Test] SUCCESS for ${domain}: ${suggestion.title}`);

    } catch (error) {
        console.error(`[Source Test] FAILED for ${domain}:`, error);
        await reportResultsRef.doc(docId).set({
            ...source,
            status: 'Failure',
            error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await reportRef.update({ failureCount: admin.firestore.FieldValue.increment(1) });
    }
}

/**
 * Processes a single RSS feed as a test and logs the result to a report.
 * @param {object} source - The source object { domain, rssUrl, pillar, region }.
 * @param {admin.firestore.DocumentReference} reportRef - The reference to the main report document.
 * @param {object} [options] - Optional parameters to pass to processRssFeed.
 */
async function processSingleRssFeedTest(source, reportRef, options = {}) {
    const { domain } = source;
    const reportResultsRef = reportRef.collection('results');
    // Sanitize domain for a valid Firestore document ID and add suffix to avoid collisions.
    const docId = domain.replace(/[^a-zA-Z0-9.-]/g, '_') + '_rss';

    try {
        // Pass options to processRssFeed. This allows us to control status and item limits for tests.
        await processRssFeed(source, options);

        // If processRssFeed completes without throwing an error, it's a success.
        await reportResultsRef.doc(docId).set({
            ...source,
            status: 'Success',
            testMethod: 'RSS',
            details: 'Feed processed successfully. Check server logs for details on articles created.',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await reportRef.update({ successCount: admin.firestore.FieldValue.increment(1) });
        console.log(`[RSS Test] SUCCESS for ${source.domain}`);

    } catch (error) {
        console.error(`[RSS Test] FAILED for ${source.domain}:`, error);
        await reportResultsRef.doc(docId).set({
            ...source,
            status: 'Failure',
            testMethod: 'RSS',
            error: error.message,
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
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    if (!genAI) {
        console.error("[Source Test] Failed to initialize GoogleGenerativeAI. Gemini API key might be missing or invalid.");
        throw new Error("Failed to initialize GoogleGenerativeAI.");
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
                for (const source of regionData.allowlist) {
                    sourcesToTest.push({ domain: source.domain, pillar, region });
                }
            }
        }
    }

    await reportRef.update({ totalSources: sourcesToTest.length });

    // Process each source sequentially to avoid overwhelming APIs.
    for (const source of sourcesToTest) {
        await processSingleSourceTest(source, reportRef, genAI);
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

    console.log(`[Source Sample Test] Starting test run, initiated by ${userDoc.data().email}.`);

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
            // Find the first source from each list that has an rssUrl.
            const sampleSourceWithRss = regionData.allowlist.find(s => s.rssUrl);
            if (sampleSourceWithRss) {
                sourcesToTest.push({ ...sampleSourceWithRss, pillar, region });
            }
        }
    }

    await reportRef.update({ totalSources: sourcesToTest.length });

    // Process each source sequentially.
    for (const source of sourcesToTest) {
        // By calling processSingleRssFeedTest without an options object, it will default
        // to using processRssFeed with an initialStatus of 'Draft'. This correctly
        // simulates the behavior of the main `discoverTopics` function, creating drafts
        // that will be automatically queued for content generation.
        await processSingleRssFeedTest(source, reportRef);
        await delay(200); // Small delay between requests.
    }

    const finalReportSnap = await reportRef.get();
    const finalData = finalReportSnap.data();
    await reportRef.update({ status: 'Completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
    
    const summary = `Source sample test completed. Report ID: ${reportRef.id}. Success: ${finalData.successCount}, Failure: ${finalData.failureCount}`;
    console.log(`[Source Sample Test] ${summary}`);
    return { success: true, message: summary, reportId: reportRef.id };
});

/**
 * A callable function for admins to test a "micro" sample of sources.
 * This is a low-cost, quick test for debugging the end-to-end generation flow.
 */
export const testMicroSampleSources = onCall({
    region: "europe-west1",
    cors: [/luminaprojectadmin\.netlify\.app$/, "http://localhost:5173"],
    timeoutSeconds: 120,
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'Admin') {
        throw new HttpsError('permission-denied', 'Only admins can run this source test.');
    }

    console.log(`[Micro Source Test] Starting test run, initiated by ${userDoc.data().email}.`);

    const reportRef = db.collection('sourceTestReports').doc();
    await reportRef.set({
        status: 'Running',
        testType: 'Micro',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalSources: 0,
        successCount: 0,
        failureCount: 0,
        triggeredBy: userDoc.data().email,
    });

    // Hardcode a very small number of sources for a quick, low-cost test.
    // This uses the structure from source-registry.json
    const sourcesToTest = [
        {
            "domain": "apnews.com",
            "rssUrl": "https://apnews.com/hub/ap-top-news/rss",
            "pillar": "general_quality_news",
            "region": "Worldwide"
        },
        {
            "domain": "techcrunch.com",
            "rssUrl": "https://techcrunch.com/feed/",
            "pillar": "research_breakthroughs",
            "region": "USA"
        }
    ];

    await reportRef.update({ totalSources: sourcesToTest.length });

    // Process each source sequentially.
    for (const source of sourcesToTest) {
        // We want 2 articles from each source.
        await processSingleRssFeedTest(source, reportRef, { limit: 2 });
        await delay(200); // Small delay between requests.
    }

    const finalReportSnap = await reportRef.get();
    const finalData = finalReportSnap.data();
    await reportRef.update({ status: 'Completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
    
    const summary = `Micro source test completed. Report ID: ${reportRef.id}. Success: ${finalData.successCount}, Failure: ${finalData.failureCount}`;
    console.log(`[Micro Source Test] ${summary}`);
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