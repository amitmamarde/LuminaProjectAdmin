// This file uses the modern ES Module syntax and the v2 Cloud Functions API for a successful deployment.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
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
    console.log(`[${articleId}] Starting content generation for: "${data.title}"`);
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const { title, categories, shortDescription, articleType } = data;

    try {
      console.log(`[${articleId}] Calling Gemini API for text content.`);
      
      const categoriesText = categories.join(', ');
      const descriptionText = shortDescription ? `The user has also provided this short description for additional context: "${shortDescription}".` : '';

      let promptPersona;
      if (articleType === 'Positive News') {
          promptPersona = `You are an optimistic storyteller for "Lumina Positive News". Your task is to craft an uplifting and inspiring narrative about the topic: "${title}" in the categories "${categoriesText}". Focus on the positive aspects, human spirit, and hopeful outcomes.`;
      } else { // Default to 'Trending Topic'
          promptPersona = `You are a neutral, objective journalist for the "Lumina Content Platform". Your task is to validate and explain the trending topic: "${title}" in the categories "${categoriesText}". Your goal is to provide a balanced, factual, and easy-to-understand overview.`;
      }

      const textPrompt = `${promptPersona}
      ${descriptionText}
      
      Please provide your response in a single, minified JSON object with three specific keys:
      1. "flashContent": A concise, factual summary of 60-100 words. This is the "Lumina Flash". For "Positive News", make this summary engaging and uplifting.
      2. "deepDiveContent": A detailed, neutral explanation of 500-700 words. This is the "Deep Dive". This content MUST be formatted using simple, clean HTML for readability. Use headings (e.g., <h2>Key Points</h2>), bold text (e.g., <strong>important term</strong>), paragraphs (e.g., <p>text</p>), and unordered lists (e.g., <ul><li>list item</li></ul>) where appropriate. To make the article scannable and visually appealing for web readers, please use shorter paragraphs with clear spacing. Do not use H1 headings. Start with a paragraph, not a heading.
      3. "imagePrompt": A vivid, descriptive text prompt (not a URL) for an AI image generator to create a symbolic, non-controversial image representing the topic. For "Positive News", this should be an inspiring and positive image prompt. For example: "A diverse group of people planting a vibrant, glowing tree on a hill overlooking a sunrise."
      
      Do not include any other text or explanations outside of the single JSON object.`;

      const textResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: textPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flashContent: { type: Type.STRING },
              deepDiveContent: { type: Type.STRING },
              imagePrompt: { type: Type.STRING },
            },
            required: ["flashContent", "deepDiveContent", "imagePrompt"],
          },
        },
      });

      const jsonString = textResponse.text.trim();
      const generatedText = JSON.parse(jsonString);
      console.log(`[${articleId}] Successfully generated text content.`);
      
      const articleRef = db.collection('articles').doc(articleId);
      const nextStatus = articleType === 'Positive News' ? 'AwaitingAdminReview' : 'AwaitingExpertReview';
      
      await articleRef.update({
        flashContent: generatedText.flashContent,
        deepDiveContent: generatedText.deepDiveContent,
        imagePrompt: generatedText.imagePrompt,
        status: nextStatus,
        // Clear any previous revision notes upon successful regeneration
        adminRevisionNotes: admin.firestore.FieldValue.delete(),
      });

      console.log(`[${articleId}] Process complete! Article is now in status '${nextStatus}'.`);

    } catch (error) {
      console.error(`[${articleId}] An error occurred during content generation:`, error);
      const articleRef = db.collection('articles').doc(articleId);
      // Use a more specific error message if available, otherwise a generic one.
      const errorMessage = error.message || 'An unknown error occurred.';
      await articleRef.update({
        status: 'NeedsRevision',
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
  // This is the key change. It ensures that a maximum of 10 instances of this
  // function will run at once, throttling the calls to the Gemini API to
  // stay within the free tier's rate limit (10 RPM).
  concurrency: 10,
}, async (event) => {
    const articleId = event.params.articleId;
    const snapshot = event.data;

    if (!snapshot) {
      console.log(`[${articleId}] Event is missing data snapshot. Exiting.`);
      return;
    }
    
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      console.error(`[${articleId}] Gemini API key is not configured in secrets. Please run 'firebase functions:secrets:set GEMINI_API_KEY' and redeploy.`);
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        status: 'NeedsRevision',
        adminRevisionNotes: 'AI configuration error: The Gemini API key is missing. Please contact an administrator.'
      });
      return;
    }
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const data = snapshot.data();
    
    if (!data || data.status !== 'Draft') {
      console.log(`[${articleId}] Ignoring article with status '${data?.status}'.`);
      return;
    }
    
    const { title, categories, shortDescription, articleType } = data;
    console.log(`[${articleId}] Processing new draft: "${title}" of type "${articleType}"`);
    
    try {
      await performContentGeneration(articleId, data, geminiApiKey);
    } catch (error) {
      // The helper function already updated the document with an error state.
      // We just log that the process concluded with a failure.
      console.error(`[${articleId}] Generation process failed. The document has been updated with error details.`);
    }
});

/**
 * A callable function that allows an Admin to manually trigger content regeneration
 * for an article, typically one that previously failed.
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
            searchPrompt = `Using Google Search, find 5 recent, uplifting, and positive news stories from ${config.region}. Summarize them and include their sources.`;
        } else { // Trending Topic
            searchPrompt = `Using Google Search, find the top 5 trending news topics in ${config.region} right now. Summarize their significance.`;
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
        const sourcesInfo = groundingChunks?.map(chunk => `Title: "${chunk.web.title}", URL: "${chunk.web.uri}"`).join('\n') || 'No sources provided.';
        const categoriesString = "['" + SUPPORTED_CATEGORIES.join("', '") + "']";
        
        if (config.articleType === 'Positive News') {
            jsonExtractionPrompt = `From the following text and list of sources, extract up to 5 distinct positive news stories. Format them into a JSON object matching the provided schema. For each story, you MUST select the most relevant source URL and title from the 'Sources' list provided below. It is critical that you use the EXACT URL from the sources list. Do not invent, alter, or truncate the URLs. If you cannot find a direct and complete source URL for a story in the provided list, do not include that story in your output.
Categories must be from this list: ${categoriesString}.

Sources:
${sourcesInfo}

Text:
${groundedText}`;
        } else { // Trending Topic
            jsonExtractionPrompt = `From the following text, extract up to 5 distinct trending topics. Format them into a JSON object matching the provided schema. The 'sourceUrl' and 'sourceTitle' fields are not required and can be omitted.
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

    await Promise.all(discoveryPromises);
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
