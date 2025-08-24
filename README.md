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
    -   Review, edit, and approve AI-generated article content in a multi-step workflow.
    -   Publish final articles to the platform.

### Backend Cloud Functions: `generateArticleContent` & `processArticle`

This pair of functions creates a robust, queue-based system for generating article content. This decouples the initial trigger from the long-running AI generation task, improving reliability and scalability.

-   **File:** `functions/index.js`
-   **Purpose:** To take a simple article draft (created via the admin UI) and generate a full-fledged article using AI.

#### `generateArticleContent` (Dispatcher)
-   **Trigger:** `onDocumentCreated` - Fires automatically when a new document is created in the `articles` collection.
-   **Workflow:**
    1.  **Validates Input:** Checks if the new article has a status of `Draft`.
    2.  **Enqueues Task:** Adds a task to a Cloud Tasks queue. The task payload contains the `articleId`.
    3.  **Updates Status:** Changes the article's status to `Queued` to provide immediate UI feedback and prevent duplicate processing.

#### `processArticle` (Worker)
-   **Trigger:** `onTaskDispatched` - Fires when a task is received from the Cloud Tasks queue.
-   **Workflow:**
    1.  **Receives Task:** Gets the `articleId` from the task payload.
    2.  **Fetches Data:** Reads the full article document from Firestore.
    3.  **Calls Core Logic:** Invokes the `performContentGeneration` helper function, which contains the logic for building the AI prompt, calling the Gemini API, and parsing the response.
    4.  **Writes to Firestore:** `performContentGeneration` updates the article document with the generated content and sets its new status (e.g., `Published` or `AwaitingExpertReview`).

### Backend Cloud Function: `discoverTopics`

This function acts as an automated content scout, finding new potential article ideas.

-   **File:** `functions/index.js`
-   **Purpose:** To periodically find new trending topics, positive news, and misinformation claims from vetted sources.
-   **Trigger:** Runs on a fixed schedule (every 24 hours).
-   **Workflow:**
    1.  **Iterates Discovery Jobs:** Loops through a list of configurations, targeting different regions (Worldwide, USA, India, etc.) and article types ('Positive News', 'Misinformation', etc.).
    2.  **Performs Constrained Search:** For each job, it constructs a detailed prompt that instructs the Gemini API to search *only* within a pre-approved list of websites defined in `source-registry.json`. This ensures all discovered content comes from high-quality, vetted sources.
    3.  **Extracts and Structures Data:** The AI uses its `googleSearch` tool with the source constraints and returns a clean JSON structure containing the story title, description, categories, and the exact source URL.
    4.  **Prevents Duplicates:** Before creating a new article, it queries the `articles` collection to ensure an article with the same title, region, and type doesn't already exist.
    5.  **Creates and Generates Article:** For each new, unique topic, it creates a new document in the `articles` collection. It then **directly calls** the `performContentGeneration` logic to write the content in the same execution, fully automating the pipeline from discovery to a draft ready for review or auto-publication. This bypasses the task queue to ensure discovered content is processed immediately.

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

### Running the Consumer App (Flutter) Locally

1.  **Navigate to the app directory:**
    ```bash
    cd consumer_app
    ```
2.  **Install Dependencies:**
    ```bash
    flutter pub get
    ```
3.  **Configure Firebase:**
    -   Ensure you have the `google-services.json` file in `consumer_app/android/app/`.
    -   Ensure you have the `firebase_options.dart` file in `consumer_app/lib/`.
    -   If these files are missing, you can generate them by running `flutterfire configure` from within the `consumer_app` directory.
4.  **Run the App:**
    Connect a device or start an emulator, then run:
    ```bash
    flutter run
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
