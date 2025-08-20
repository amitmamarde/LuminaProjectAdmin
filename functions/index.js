// This file uses the modern ES Module syntax and the v2 Cloud Functions API for a successful deployment.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
 * This Cloud Function automatically triggers when a new document is created in the 'articles' collection.
 * It generates the main content for the article using the Gemini API.
 */
export const generateArticleContent = onDocumentCreated({
  document: "articles/{articleId}",
  region: "europe-west1",
  secrets: ["GEMINI_API_KEY"],
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
      });

      console.log(`[${articleId}] Process complete! Article is now in status '${nextStatus}'.`);

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
    
    for (const config of discoveryConfigs) {
        console.log(`Discovering ${config.articleType} for ${config.region}...`);
        
        try {
            // STEP 1: Use Google Search to get grounded, up-to-date information.
            // We cannot request JSON directly when using the googleSearch tool.
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
                continue;
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

                for (const suggestion of result.suggestions) {
                    // Sanity check for suggestion title
                    if (!suggestion.title || typeof suggestion.title !== 'string' || suggestion.title.trim() === '') {
                        console.warn('Skipping suggestion with invalid title:', suggestion);
                        continue;
                    }
                
                    const existingQuery = db.collection('suggested_topics')
                        .where('title', '==', suggestion.title)
                        .where('region', '==', config.region)
                        .where('articleType', '==', config.articleType)
                        .limit(1);

                    const existingSnapshot = await existingQuery.get();
                    
                    if (existingSnapshot.empty) {
                        const newSuggestionRef = db.collection('suggested_topics').doc();
                        batch.set(newSuggestionRef, {
                            ...suggestion,
                            articleType: config.articleType,
                            region: config.region,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
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
});
