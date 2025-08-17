// Using ES Module syntax, converted to 1st Gen Functions to bypass Eventarc permission issues.
import functions from "firebase-functions";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Firebase Admin SDK to interact with Firestore and Storage
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

/**
 * This Cloud Function automatically triggers when a new document is created in the 'articles' collection.
 * Its purpose is to take a simple 'Draft' article (with a title, category, and type) and use AI
 * to generate a full article with a summary, a deep dive, and a header image.
 */
export const generateArticleContent = functions.region("europe-west1").firestore
  .document("articles/{articleId}")
  .onCreate(async (snapshot, context) => {
    const articleId = context.params.articleId;

    // --- AI and Cloud Services Configuration ---
    const geminiApiKey = functions.config().gemini?.key;

    if (!geminiApiKey) {
      console.error(`[${articleId}] Gemini API key is not configured. Run 'firebase functions:config:set gemini.key=\"YOUR_API_KEY\"' and redeploy.`);
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        status: 'NeedsRevision',
        adminRevisionNotes: 'AI configuration error: The Gemini API key is missing. Please contact an administrator.'
      });
      return;
    }
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    if (!snapshot) {
      console.log("No data associated with the event, exiting.");
      return;
    }

    const data = snapshot.data();
    
    if (data.status !== 'Draft') {
      console.log(`[${articleId}] Ignoring article with status '${data.status}'.`);
      return;
    }
    
    const { title, categories, shortDescription, articleType } = data;
    console.log(`[${articleId}] Processing new draft: "${title}" of type "${articleType}"`);

    try {
      // === STEP 1: Generate Text Content with Gemini (with dynamic prompts) ===
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
      2. "deepDiveContent": A detailed, neutral explanation of 500-700 words. This is the "Deep Dive". This content MUST be formatted using Markdown for readability. Use headings (e.g., ## Key Points), bold text (e.g., **important term**), and bulleted lists (e.g., * list item) where appropriate to structure the article and make it engaging. Do not use H1 headings (#). Start with a paragraph, not a heading.
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

      // === STEP 2 & 3: Image Generation & Upload (Temporarily Disabled) ===
      /* ... (image generation code remains unchanged and disabled) ... */
      
      // === STEP 4: Update Firestore Document ===
      console.log(`[${articleId}] Updating Firestore document with generated content.`);
      const articleRef = db.collection('articles').doc(articleId);

      // ** DUAL-TRACK WORKFLOW LOGIC **
      // Positive news goes straight to admin for a final look, while trending topics need expert validation.
      const nextStatus = articleType === 'Positive News' ? 'AwaitingAdminReview' : 'AwaitingExpertReview';
      
      await articleRef.update({
        flashContent: generatedText.flashContent,
        deepDiveContent: generatedText.deepDiveContent,
        imagePrompt: generatedText.imagePrompt,
        status: nextStatus,
      });

      console.log(`[${articleId}] Process complete (image skipped)! Article is now in status '${nextStatus}'.`);

    } catch (error) {
      console.error(`[${articleId}] An error occurred during content generation:`, error);
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        status: 'NeedsRevision',
        adminRevisionNotes: `AI content generation failed. Error: ${error.message}. Please review the draft, create content manually, or delete and recreate the draft.`
      });
    }
});


/**
 * This scheduled Cloud Function runs every 6 hours to automatically discover trending topics
 * and positive news stories using a search-grounded AI model. It populates a 'suggested_topics'
 * collection for admins to review and approve.
 */
export const discoverTopics = functions.region("europe-west1").pubsub.schedule("every 6 hours").onRun(async (context) => {
    console.log("Running scheduled topic discovery...");
    const geminiApiKey = functions.config().gemini?.key;

    if (!geminiApiKey) {
        console.error("Cannot discover topics: Gemini API key is not configured.");
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

    for (const config of discoveryConfigs) {
        console.log(`Discovering ${config.articleType} for ${config.region}...`);
        
        let prompt;
        if (config.articleType === 'Positive News') {
            prompt = `Using Google Search, find 5 recent, uplifting, and positive news stories from ${config.region}. For each story, provide a concise title, a short 1-2 sentence description, suggest up to 3 relevant categories from the list [Science & Technology, Health & Wellness, History & Culture, Politics & Society, Digital & Media Literacy, Business & Finance, Environment & Sustainability, Education & Learning, Arts, Media & Creativity], and include the source URL and source title.`;
        } else { // Trending Topic
            prompt = `Using Google Search, find the top 5 trending news topics in ${config.region} right now. For each topic, provide a neutral, factual title, a short 1-2 sentence description explaining its significance, and suggest up to 3 relevant categories from the list [Science & Technology, Health & Wellness, History & Culture, Politics & Society, Digital & Media Literacy, Business & Finance, Environment & Sustainability, Education & Learning, Arts, Media & Creativity]. The source URL and title are not needed.`;
        }

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ googleSearch: {} }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: promptSchema,
                },
            });

            const jsonString = response.text.trim();
            const result = JSON.parse(jsonString);

            if (result.suggestions && result.suggestions.length > 0) {
                const batch = db.batch();
                for (const suggestion of result.suggestions) {
                    // Prevent duplicates by checking for existing titles
                    const existingQuery = await db.collection('suggested_topics').where('title', '==', suggestion.title).limit(1).get();
                    if (existingQuery.empty) {
                        const newSuggestionRef = db.collection('suggested_topics').doc();
                        batch.set(newSuggestionRef, {
                            ...suggestion,
                            articleType: config.articleType,
                            region: config.region,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
                await batch.commit();
                console.log(`Added ${result.suggestions.length} new suggestions for ${config.articleType} in ${config.region}.`);
            }
        } catch (error) {
            console.error(`Failed to discover topics for ${config.articleType} in ${config.region}:`, error);
        }
    }
});
