// This file uses the modern ES Module syntax and the v2 Cloud Functions API for a successful deployment.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import { GoogleGenAI, Type } from "@google/genai";

//  Initialize Firebase Admin SDK to interact with Firestore

admin.initializeApp();
const db = admin.firestore();

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
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const { title, categories, shortDescription, articleType, sourceUrl } = data;

    try {
      const categoriesText = categories.join(', ');
      const descriptionText = shortDescription ? `The user has also provided this short description for additional context: "${shortDescription}".` : '';

      let promptPersona, responseSchema, textPrompt;

      // --- Define prompts and schemas based on Article Type ---
      
      // For Trending and Positive news, we only generate a summary as we link to the source.
      if (articleType === 'Trending Topic' || articleType === 'Positive News') {
        console.log(`[${articleId}] Generating summary-only content for a '${articleType}' article.`);
        
        const sourceContext = sourceUrl ? `The original story can be found at ${sourceUrl}.` : '';
        
        promptPersona = articleType === 'Positive News'
          ? `You are an optimistic storyteller for "Lumina Positive News". Your task is to craft an uplifting and inspiring summary (60-100 words) about the topic: "${title}" in the categories "${categoriesText}". ${sourceContext} Focus on the positive aspects, human spirit, and hopeful outcomes.`
          : `You are a neutral, objective journalist for the "Lumina Content Platform". Your task is to validate and summarize the trending topic: "${title}" in the categories "${categoriesText}". ${sourceContext} Your goal is to provide a balanced, factual, and easy-to-understand summary of 60-100 words.`;

        textPrompt = `${promptPersona}
        ${descriptionText}
        Please provide your response in a single, minified JSON object with two specific keys:
          1. "flashContent": The concise, factual summary of 60-100 words. This is the "Lumina Flash".
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
        promptPersona = `You are a neutral, objective fact-checker for the "Lumina Content Platform". Your task is to analyze and debunk the misinformation topic: "${title}" in the categories "${categoriesText}". Your goal is to provide a clear, evidence-based, and easy-to-understand explanation that clarifies the facts without being preachy or condescending.`;

        textPrompt = `${promptPersona}
        ${descriptionText}
        Please provide your response in a single, minified JSON object with three specific keys:
          1. "flashContent": A concise, factual summary of 60-100 words that quickly debunks the misinformation. This is the "Lumina Flash".
          2. "deepDiveContent": A detailed, neutral explanation of 500-700 words that breaks down the misinformation, presents the facts with evidence, and explains the context. This is the "Deep Dive". This content MUST be formatted using simple, clean HTML for readability. Use headings (e.g., <h2>Key Points</h2>), bold text (e.g., <strong>important term</strong>), paragraphs (e.g., <p>text</p>), and unordered lists (e.g., <ul><li>list item</li></ul>) where appropriate. To make the article scannable and visually appealing for web readers, please use shorter paragraphs with clear spacing. Do not use H1 headings. Start with a paragraph, not a heading.
          3. "imagePrompt": A vivid, descriptive text prompt for an AI image generator to create a symbolic, neutral image representing the concept of truth or clarity, avoiding any imagery from the misinformation itself. For example: "A magnifying glass focusing on a single glowing particle of truth amidst a sea of distorted, blurry shapes."
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
      const textResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
          contents: [{ parts: [{ text: textPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const jsonString = textResponse.text.trim();
      const generatedText = JSON.parse(jsonString);
      console.log(`[${articleId}] Successfully generated content from API.`);

      const articleRef = db.collection('articles').doc(articleId);
      
      // Positive News goes straight to Admin review.
      // Trending Topics and Misinformation go to an Expert first.
      const nextStatus = articleType === 'Positive News' ? 'AwaitingAdminReview' : 'AwaitingExpertReview';

      // Build the update payload based on what was generated
      const updatePayload = {
        flashContent: generatedText.flashContent,
        imagePrompt: generatedText.imagePrompt,
        status: nextStatus,
        // Clear any previous revision notes upon successful regeneration
        adminRevisionNotes: admin.firestore.FieldValue.delete(),
      };

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

                // Prepare a batch of writes for Firestore
                const firestoreBatch = db.batch();
                chunk.forEach((doc) => {
                    const docRef = articlesRef.doc(doc.id);
                    firestoreBatch.update(docRef, { status: "Queued", adminRevisionNotes: admin.firestore.FieldValue.delete() });
                });

                // Enqueue tasks sequentially. The "Queue does not exist" error was likely due to
                // name resolution issues under load, which using the full function resource name
                // should have fixed. The bulk enqueue method sends the entire array as a single
                // task's payload, which our 'processArticle' function isn't designed to handle.
                for (const task of tasksToEnqueue) {
                    await queue.enqueue(task);
                }

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
 * @param {GoogleGenAI} ai The GoogleGenAI instance.
 * @param {FirebaseFirestore.Firestore} db The Firestore instance.
 * @param {object} promptSchema The schema for the AI prompt response.
 */
async function processDiscoveryConfig(config, ai, db, promptSchema) {
    console.log(`Discovering ${config.articleType} for ${config.region}...`);
        
    try {
        // STEP 1: Use Google Search to get grounded, up-to-date information.
        let searchPrompt;
        if (config.articleType === 'Positive News') {
            searchPrompt = `Using Google Search, find 5 distinct and recent uplifting, positive news stories from ${config.region}. For each story, provide a brief summary and its source URL.`;
        } else if (config.articleType === 'Misinformation') {
            searchPrompt = `Using Google Search, find 5 distinct and recent examples of widespread misinformation or fake news from ${config.region} that have been debunked by reputable sources. For each, summarize the false claim. Do not include a source URL.`;
        } else { // Trending Topic
            searchPrompt = `Using Google Search, find the top 5 distinct trending news topics in ${config.region} right now. Summarize their significance. Do not include a source URL.`;
        }

        const groundedResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: searchPrompt }] }],
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const groundedText = groundedResponse.text;
        const groundingChunks = groundedResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;

        if (!groundedText) {
            console.log(`No grounded text returned for ${config.articleType} in ${config.region}. Skipping.`);
            return;
        }

        // STEP 2: Use a second call to structure the grounded text into the desired JSON format.
        let jsonExtractionPrompt;
        const categoriesString = "['" + SUPPORTED_CATEGORIES.join("', '") + "']";
        // The Gemini API returns grounding chunks with `web.title` and `web.uri`.
        // We format these into a string to pass as context to the next prompt.
        const sourcesInfo = groundingChunks?.map(chunk => `Title: ${chunk.web.title}\nURL: ${chunk.web.uri}`).join('\n\n') || '';
        
        if (config.articleType === 'Positive News') {
            // For Positive News, we must provide the sources so the AI can attribute them correctly.
            jsonExtractionPrompt = `From the following text and list of sources, extract up to 5 distinct positive news stories. Format them into a JSON object matching the provided schema. For each story, you MUST select the most relevant source URL and title from the 'Sources' list provided below. It is critical that you use the EXACT URL from the sources list. Do not invent, alter, or truncate the URLs. If you cannot find a direct and complete source URL for a story in the provided list, do not include that story in your output.
Categories must be from this list: ${categoriesString}.

Sources:
${sourcesInfo}

Text:
${groundedText}`;
        } else { // Trending Topic or Misinformation
            // For other types, source attribution is not required in the same way.
            jsonExtractionPrompt = `From the following text, extract up to 5 distinct topics. Format them into a JSON object matching the provided schema. The 'sourceUrl' and 'sourceTitle' fields are not required and can be omitted for these types.
Categories must be from this list: ${categoriesString}.

Text:
${groundedText}`;
        }
        
        const jsonResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: jsonExtractionPrompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: promptSchema,
            },
        });

        const jsonString = jsonResponse.text.trim();
        const result = JSON.parse(jsonString);

        if (result.suggestions && result.suggestions.length > 0) {
            const batch = db.batch();
            let newSuggestionCount = 0;
 
            const validSuggestions = result.suggestions.filter(suggestion => 
                suggestion.title && typeof suggestion.title === 'string' && suggestion.title.trim() !== ''
            );

            if (validSuggestions.length > 0) {
                const titles = validSuggestions.map(s => s.title);
                const existingTopicsQuery = db.collection('suggested_topics')
                    .where('title', 'in', titles)
                    .where('region', '==', config.region)
                    .where('articleType', '==', config.articleType);

                const existingTopicsSnapshot = await existingTopicsQuery.get();
                const existingTitles = new Set(existingTopicsSnapshot.docs.map(doc => doc.data().title));

                for (const suggestion of validSuggestions) {
                    if (existingTitles.has(suggestion.title)) continue;

                    const newSuggestionRef = db.collection('suggested_topics').doc();
                    batch.set(newSuggestionRef, { ...suggestion, articleType: config.articleType, region: config.region, createdAt: admin.firestore.FieldValue.serverTimestamp() });
                    newSuggestionCount++;
                }
            }

            if (newSuggestionCount > 0) {
                await batch.commit();
                console.log(`Added ${newSuggestionCount} new suggestions for ${config.articleType} in ${config.region}.`);
            } else {
                console.log(`No new, unique suggestions found for ${config.articleType} in ${config.region}.`);
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
    schedule: "every 6 hours",
    region: "europe-west1",
    secrets: ["GEMINI_API_KEY"],
}, async (event) => {
    console.log("Running scheduled topic discovery...");
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        console.error("Cannot discover topics: Gemini API key is not configured in secrets.");
        return;
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
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

    const promptSchema = {
        type: Type.OBJECT,
        properties: {
            suggestions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        shortDescription: { type: Type.STRING },
                        categories: { type: Type.ARRAY, items: { type: Type.STRING } },
                        sourceUrl: { type: Type.STRING },
                        sourceTitle: { type: Type.STRING },
                    },
                    required: ["title", "shortDescription", "categories"]
                }
            }
        },
        required: ["suggestions"]
    };
    
    // We can process these in parallel to speed up the discovery process.
    const discoveryPromises = discoveryConfigs.map(config => 
        processDiscoveryConfig(config, ai, db, promptSchema)
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