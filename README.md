<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

#Lumina Content Platform

Lumina is an AI-powered content generation and curation platform. It combines automated topic discovery and article generation using Google's Gemini API with a human-in-the-loop review process. The system is designed to help a content team efficiently create, validate, and publish high-quality articles on trending topics and positive news.

## Architecture Overview

The project is a monorepo containing both the frontend admin portal and the backend cloud functions.

-   **Frontend (`/src`):** A React (Vite) single-page application that serves as the administrative and expert portal. It's designed for managing the content lifecycle.
-   **Backend (`/functions`):** A set of serverless Firebase Cloud Functions that handle automated tasks like content generation and topic discovery.
-   **Database:** Google Firestore is used to store article data, content suggestions, and workflow statuses.
-   **AI Model:** Google Gemini (`gemini-2.5-flash`) is used for its powerful text generation and tool-use capabilities (Google Search).
-   **Deployment:** The frontend is deployed via Netlify, and the backend functions are deployed to Firebase.

---

## Core Components & Programs

### Frontend Application (Admin Portal)

The frontend is a web application that allows users (admins and experts) to interact with the content system.

-   **Purpose:** To provide a user interface for the content creation and review workflow.
-   **Key Features:**
    -   View and manage a list of AI-suggested topics.
    -   Create new article drafts from suggestions or from scratch.
    -   Review, edit, and approve AI-generated article content.
    -   Publish final articles to the platform.

### Backend Cloud Function: `generateArticleContent`

This function automates the creation of article content.

-   **File:** `functions/index.js`
-   **Purpose:** To take a simple article draft (containing just a title and metadata) and generate a full-fledged article using AI.
-   **Trigger:** Fires automatically when a new document is created in the `articles` collection in Firestore.
-   **Workflow:**
    1.  **Reads from Firestore:** Gets the `title`, `categories`, `shortDescription`, and `articleType` from the newly created article document.
    2.  **Validates Input:** Ensures the article's status is `Draft` before proceeding.
    3.  **Generates AI Prompt:** Constructs a detailed, context-aware prompt for the Gemini API. The persona of the AI is adjusted based on the `articleType` (e.g., "optimistic storyteller" for 'Positive News').
    4.  **Calls Gemini API:** Sends the prompt to the `gemini-2.5-flash` model, requesting a structured JSON response.
    5.  **Receives Structured Output:** The AI returns a JSON object containing:
        -   `flashContent`: A short, engaging summary.
        -   `deepDiveContent`: A longer, detailed article body formatted with clean HTML.
        -   `imagePrompt`: A descriptive prompt for an AI image generator.
    6.  **Writes to Firestore:** Updates the article document with the generated content and changes its status to `AwaitingAdminReview` or `AwaitingExpertReview`, pushing it to the next step in the human review process.

### Backend Cloud Function: `discoverTopics`

This function acts as an automated content scout, finding new potential article ideas.

-   **File:** `functions/index.js`
-   **Purpose:** To periodically find new trending topics and positive news stories from across the web.
-   **Trigger:** Runs on a fixed schedule (every 6 hours).
-   **Workflow:**
    1.  **Iterates Discovery Jobs:** Loops through a list of configurations, targeting different regions (Worldwide, USA, India, etc.) and article types.
    2.  **Performs Grounded Search:** For each job, it uses the Gemini API's `googleSearch` tool to find recent, relevant online content. This ensures the suggestions are timely and based on real-world information.
    3.  **Extracts and Structures Data:** A second AI call processes the raw search results, extracting key information and formatting it into a clean JSON structure (title, description, categories, source URL).
    4.  **Prevents Duplicates:** Before saving, it queries the `suggested_topics` collection in Firestore to ensure the same topic has not already been suggested for that region and type.
    5.  **Writes to Firestore:** New, unique topics are saved as documents in the `suggested_topics` collection, where they appear in the admin portal for review.

---

## Setup and Deployment

### Prerequisites

-   **Node.js:** Download & Install Node.js
-   **Firebase CLI:** The command-line tool for Firebase. You'll need this to deploy the backend functions. Install it globally via npm:
    ```bash
    npm install -g firebase-tools
    ```

### Running the Frontend Locally

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Firebase:**
    -   Create a `.env.local` file in the root of the `LuminaProjectAdmin` directory.
    -   Add your Firebase project configuration to this file. You can get this from the Firebase Console (Project settings > General > Your apps > Web app).
    ```
    VITE_FIREBASE_API_KEY="your-api-key"
    VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
    VITE_FIREBASE_PROJECT_ID="your-project-id"
    VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
    VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
    VITE_FIREBASE_APP_ID="your-app-id"
    ```
3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```

### Deploying the Backend Functions

1.  **Log in to Firebase:**
    ```bash
    firebase login
    ```
2.  **Select your Firebase Project:**
    ```bash
    firebase use --add
    ```
    Choose your `lumina-summaries` project from the list.

3.  **Set Gemini API Key Secret:**
    This only needs to be done once. Your key will be stored securely in Google Secret Manager.
    ```bash
    firebase functions:secrets:set GEMINI_API_KEY
    ```
    Paste your Gemini API key when prompted.

4.  **Install Function Dependencies:**
    ```bash
    cd functions && npm install && cd ..
    ```

5.  **Deploy:**
    ```bash
    firebase deploy --only functions
    ```

### Deploying the Frontend

The frontend is configured for deployment via Netlify. Pushing changes to the `main` branch of the connected GitHub repository will automatically trigger a new build and deployment on Netlify.
