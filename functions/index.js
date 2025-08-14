// Using ES Module syntax, converted to 1st Gen Functions to bypass Eventarc permission issues.
import functions from "firebase-functions";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Firebase Admin SDK to interact with Firestore and Storage
admin.initializeApp();

// --- AI and Cloud Services Configuration ---
// In an ES Module environment, functions.config() is not available directly.
// We manually parse the configuration from the environment variable set by the Firebase CLI.
// Your command `firebase functions:config:set gemini.key="YOUR_API_KEY_HERE"` makes the key available here.
const config = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const geminiApiKey = config.gemini?.key;

const db = admin.firestore();
const storage = admin.storage();

/**
 * This Cloud Function automatically triggers when a new document is created in the 'articles' collection.
 * Its purpose is to take a simple 'Draft' article (with just a title and category) and use AI
 * to generate a full article with a summary, a deep dive, and a header image.
 */
export const generateArticleContent = functions.region("europe-west1").firestore
  .document("articles/{articleId}")
  .onCreate(async (snapshot, context) => {
    const articleId = context.params.articleId;

    // Check if the API key is available. If not, log an error and exit gracefully.
    if (!geminiApiKey) {
      console.error(`[${articleId}] Gemini API key is not configured. Run 'firebase functions:config:set gemini.key=\"YOUR_API_KEY\"' and redeploy.`);
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        status: 'NeedsRevision',
        adminRevisionNotes: 'AI configuration error: The Gemini API key is missing. Please contact an administrator.'
      });
      return;
    }
    
    // The API key is available from the parsed config.
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    if (!snapshot) {
      console.log("No data associated with the event, exiting.");
      return;
    }

    const data = snapshot.data();
    
    // Only run this function on new documents in the 'Draft' state.
    if (data.status !== 'Draft') {
      console.log(`[${articleId}] Ignoring article with status '${data.status}'.`);
      return;
    }
    
    const { title, category } = data;
    console.log(`[${articleId}] Processing new draft: "${title}"`);

    try {
      // === STEP 1: Generate Text Content with Gemini ===
      console.log(`[${articleId}] Calling Gemini API for text content.`);
      const textPrompt = `You are a neutral, fact-based content creator for a misinformation-fighting app called "Lumina". Your task is to generate content for the topic: "${title}" in the category "${category}".
      
      Please provide your response in a single, minified JSON object with three specific keys:
      1. "flashContent": A concise, factual summary of 60-100 words. This is the "Lumina Flash".
      2. "deepDiveContent": A more detailed, neutral explanation of 500-700 words. This is the "Deep Dive".
      3. "imagePrompt": A vivid, descriptive text prompt (not a URL) for an AI image generator to create a symbolic, non-controversial image representing the topic. For example: "A stylized magnifying glass over a digital world map, with glowing data streams."
      
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

      // === STEP 2: Generate Image with Imagen ===
      const imagePrompt = generatedText.imagePrompt;
      console.log(`[${articleId}] Calling Imagen API for image with prompt: "${imagePrompt}"`);
      
      const imageResponse = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "16:9" // A good aspect ratio for article headers
        }
      });
      
      const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
      console.log(`[${articleId}] Successfully generated image.`);

      // === STEP 3: Upload Image to Cloud Storage ===
      console.log(`[${articleId}] Uploading image to Cloud Storage...`);
      const bucket = storage.bucket(); // Uses the default bucket for the project
      const filePath = `articles/${articleId}/header.jpg`;
      const file = bucket.file(filePath);
      const buffer = Buffer.from(base64ImageBytes, 'base64');
      
      await file.save(buffer, { metadata: { contentType: 'image/jpeg' } });
      await file.makePublic(); // Make the file publicly accessible via a URL
      const imageUrl = file.publicUrl();
      console.log(`[${articleId}] Image uploaded to: ${imageUrl}`);
      
      // === STEP 4: Update Firestore Document ===
      console.log(`[${articleId}] Updating Firestore document with generated content.`);
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        flashContent: generatedText.flashContent,
        deepDiveContent: generatedText.deepDiveContent,
        imagePrompt: generatedText.imagePrompt, // Store the prompt for potential future use
        imageUrl: imageUrl,
        status: 'AwaitingExpertReview', // This is the crucial step that sends it to the experts' dashboard
      });

      console.log(`[${articleId}] Process complete! Article is now ready for expert review.`);

    } catch (error) {
      console.error(`[${articleId}] An error occurred during content generation:`, error);
      // If the process fails, update the article with an error state for manual admin intervention.
      const articleRef = db.collection('articles').doc(articleId);
      await articleRef.update({
        status: 'NeedsRevision',
        adminRevisionNotes: `AI content generation failed. Error: ${error.message}. Please review the draft title, create content manually, or delete and recreate the draft.`
      });
    }
});