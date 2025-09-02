# Lumina Codebase Overview

This document provides a high-level overview of the files and architecture for the Lumina project monorepo. It is intended to be a map for developers to understand the purpose of each part of the application and how they connect.

## Table of Contents
1.  [React Admin Portal (`/src`)](#1-react-admin-portal-src)
2.  Flutter Consumer App (`/consumer_app`)
3.  Backend Cloud Functions (`/functions`)
4.  Review & Cleanup Suggestions

---

## 1. React Admin Portal (`/src`)

This is the web-based administration panel built with React and Vite. It's used by Admins and Experts to manage the entire content lifecycle.

### Key Files & Components

#### `/home/amit_pso/LuminaProjectAdmin/src/App.tsx`

*   **Purpose**: This is currently the **main file for the entire React application**. It contains almost all components, pages, logic, and routing.
*   **Key Components Defined Here**:
    *   `AuthProvider`: Manages user authentication state globally. It checks if a user is logged in and fetches their profile from Firestore.
    *   `Spinner`, `Badge`: Small, reusable UI components for loading states and status labels.
    *   `PublicHeader`, `HomePage`, `ArticleFeedPage`, `PublicArticleView`: These are the **public-facing pages** of the web app. They allow non-logged-in users to see the landing page, a web-based article feed, and a detailed article view.
    *   `Header`, `LoginPage`, `DashboardPage`: The core components for the authenticated "Curation Platform" experience.
    *   `UserProfilePage`: Allows logged-in users to edit their profile details (display name, categories of expertise).
    *   `ArticleListPage`: (Admin only) A page to view, filter, and manage all articles in the system.
    *   `TaskListPage`: A page that shows a user their assigned work queue (e.g., articles awaiting their review).
    *   `ArticleEditorPage`: The main workhorse for content management. This is where users create, edit, review, and publish articles. It handles state changes, saving to Firestore, and workflow actions (e.g., assigning to an expert, publishing).
    *   `ExpertManagementPage`: (Admin only) A page to view and manage expert user accounts.
    *   `AppRouter`: The central routing component that determines which page/component to render based on the URL and user authentication status.
*   **Linkages**:
    *   Connects to Firebase (`/src/firebase.ts`) for authentication, database operations (Firestore), and calling Cloud Functions.
    *   Uses services like `saveArticle` and `deleteArticle` (from `/src/services/articleService.ts`) to interact with Firestore.
    *   Renders all other components based on the route.
*   **Note**: This file is extremely large and is the top candidate for refactoring. See Cleanup Suggestions.

---

## 2. Flutter Consumer App (`/consumer_app`)

This is the mobile application for end-users, built with Flutter. Its primary purpose is to provide a fast, native reading experience on iOS and Android.

### Key Files & Components

#### `/home/amit_pso/LuminaProjectAdmin/consumer_app/pubspec.yaml`

*   **Purpose**: The project's manifest file. It defines project metadata, dependencies, and assets.
*   **Key Dependencies**:
    *   `firebase_core`, `cloud_firestore`: For connecting to and reading data from your Firebase backend.
    *   `flutter_html`: To render the `deepDiveContent` of "Misinformation" articles, which is stored as HTML.
    *   `share_plus`: To enable the native OS sharing functionality.
    *   `url_launcher`: To open external article links in a browser.
    *   `flutter_inappwebview`: Used to display external articles within the app, potentially with a cleaner UI via `readability.js`.
*   **Assets**:
    *   `assets/js/readability.js`: A JavaScript file that can be injected into a webview to strip out ads, navigation, and other clutter from an external article page, providing a "reader mode".

#### `/home/amit_pso/LuminaProjectAdmin/consumer_app/lib/main.dart`

*   **Purpose**: The entry point of the Flutter application.
*   **Key Functions**:
    *   `main()`: The first function that runs. It initializes Flutter bindings and connects to Firebase using the configuration from `firebase_options.dart`.
    *   `MyApp`: The root widget of the application. It sets up the `MaterialApp`, defines the global theme (dark theme), and sets the home screen.
*   **Linkages**:
    *   It launches the `ArticleFeedScreen` as the initial screen.

#### `/home/amit_pso/LuminaProjectAdmin/consumer_app/screens/article_feed_screen.dart`

*   **Purpose**: This is the core screen of the consumer app. It's responsible for fetching and displaying the feed of published articles from Firestore.
*   **Key Functions (Inferred)**:
    *   A `StatefulWidget` that maintains the list of articles.
    *   An `initState()` or similar method that creates a query to the `articles` collection in Firestore, filtering for `status == 'Published'` and ordering by `publishedAt`.
    *   A `ListView` or `PageView` that builds the UI for each article. This is likely where the "TikTok-style" vertical scroll/snap behavior is implemented.
    *   Logic to handle user interactions like tapping "Read Full Story" (which would navigate to a detail view or launch a URL) and sharing.
*   **Linkages**:
    *   Directly interacts with `cloud_firestore` to get live article data.
    *   Likely navigates to a new screen (e.g., `ArticleDetailScreen`) for deep-dive content or uses `url_launcher`/`flutter_inappwebview` for external links.

#### `/home/amit_pso/LuminaProjectAdmin/consumer_app/linux/CMakeLists.txt` & `/home/amit_pso/LuminaProjectAdmin/consumer_app/windows/CMakeLists.txt`

*   **Purpose**: These are platform-specific build configuration files for creating Linux and Windows desktop versions of your Flutter app. They are typically auto-generated by Flutter.
*   **Key Detail**: Both files define the output executable name as `BINARY_NAME "consumer_app"`. This is a source of ambiguity when discussing build files, as they have similar names but are for different platforms.
*   **Note**: You generally do not need to edit these files unless you are doing advanced native desktop integration.

---

## 3. Backend Cloud Functions (`/functions`)

This is the serverless backend of the application, running on Firebase Cloud Functions. It handles all automated processing, AI tasks, and secure operations.

### Key Files & Components

#### `/home/amit_pso/LuminaProjectAdmin/functions/index.js`

*   **Purpose**: Contains the code for all backend Cloud Functions.
*   **Key Functions**:
    *   **Task Queue System**:
        *   `generateArticleContent` (Firestore Trigger): A fast "dispatcher" function. When a new article is created with status `Draft`, this function's only job is to add a task to the Cloud Tasks queue.
        *   `processArticle` (Task Queue Trigger): The "worker" function. It picks up tasks from the queue one at a time. It calls the `performContentGeneration` helper to do the heavy lifting of interacting with the Gemini API. This ensures that API-intensive tasks are processed sequentially and reliably.
    *   **Content Discovery**:
        *   `discoverTopics` (Scheduled Trigger): Runs automatically every 24 hours. It reads the `source-registry.json`, parses RSS feeds from the listed sources, and creates new `Draft` articles in Firestore for any new items it finds.
    *   **Admin Tools (Callable Functions)**: These are functions called directly from the React admin panel to perform privileged actions.
        *   `requeueAllFailedArticles`: Re-queues all articles that are in the `GenerationFailed` state.
        *   `queueArticleContentGeneration`: Manually re-queues a single article for generation.
        *   `test...Sources` functions (`testAllRssFeedsInBatches`, `testSampleSources`, etc.): A suite of tools for admins to test the health and viability of the news sources in `source-registry.json`.
        *   `generateImage`: A placeholder function to generate an image from a text prompt.
*   **Linkages**:
    *   Interacts heavily with Firestore (`db`) to read and write article data.
    *   Uses the `GoogleGenerativeAI` SDK to call the Gemini API for content generation.
    *   Reads from `source-registry.json` to know which news sources to poll.

#### `/home/amit_pso/LuminaProjectAdmin/functions/source-registry.json` (Not provided, but referenced)

*   **Purpose**: A critical configuration file. It's a JSON database of all approved news sources, categorized by topic pillar (e.g., `positive_news`) and region (e.g., `USA`). It contains the domain names and RSS feed URLs used by the `discoverTopics` function.

---

## 4. Review & Cleanup Suggestions

Based on this overview, here are the primary areas for review and potential cleanup.

### 1. Refactor the Monolithic `App.tsx`

*   **Problem**: The file `/home/amit_pso/LuminaProjectAdmin/src/App.tsx` is over 1300 lines long and contains nearly every component for the entire admin application. This makes it very difficult to maintain, debug, and for me (the AI) to reason about. When you ask to "change the dashboard," it's hard to isolate the `DashboardPage` component from the 15 other components in the same file.
*   **Solution**: We should break this file down into a proper React project structure. Each page component should be in its own file within a `/src/pages/` directory. Reusable components like `Spinner` and `Badge` should be in a `/src/components/` directory.

    **Example Structure:**
    ```
    /src
    ├── components/
    │   ├── Badge.tsx
    │   ├── Header.tsx
    │   ├── Spinner.tsx
    │   └── ...
    ├── pages/
    │   ├── ArticleEditorPage.tsx
    │   ├── ArticleListPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── HomePage.tsx
    │   └── ...
    ├── services/
    │   └── articleService.ts
    ├── context/
    │   └── AuthContext.tsx
    ├── App.tsx  // This would now only contain the AppRouter
    └── ...
    ```
*   **Action**: Our next step could be to perform this refactoring. For example, you could ask me to "Refactor the `DashboardPage` component from `App.tsx` into its own file at `/src/pages/DashboardPage.tsx`".

### 2. Clarify File Paths in Requests

*   **Problem**: As we discussed, ambiguity in requests for the Flutter app is high due to generic file names (`main.dart`, `CMakeLists.txt`).
*   **Solution**: With this document as a reference, you can now be more specific. For example: "In the Flutter app, I want to change the `ArticleFeedScreen`. The file is `/home/amit_pso/LuminaProjectAdmin/consumer_app/screens/article_feed_screen.dart`." This will guarantee I target the correct file.

### 3. Duplicate Files

*   **Observation**: There are no actual "duplicate" files that perform the same function on the same platform.
*   **Clarification**:
    *   `ArticleFeedPage` (React) and `ArticleFeedScreen` (Flutter) seem similar, but they serve different platforms (web vs. mobile) and are not redundant.
    *   The various `CMakeLists.txt` files are required for each specific desktop platform (Linux, Windows) and are not duplicates of each other.

By using this document as our shared understanding, our collaboration will become much more efficient.

New Flow

1. Entry Point

main.dart

Initializes the app and sets up Firebase (assumed).

Sets home: to ArticleFeedScreen.

Handles theming and global settings (if any).

Flow: App starts → ArticleFeedScreen loads → Firestore stream fetches articles.

2. Screens
screens/article_feed_screen.dart – Main feed

Stateful widget that listens to Firestore for published articles (status == "Published").

Uses a StreamBuilder<QuerySnapshot> to get real-time updates.

Displays articles in a vertical PageView.builder (full-page swipeable).

Each article page is an ArticleFeedCard.

Responsibilities:

Stream articles from Firestore.

Handle loading/error/empty states.

Pass each Article object to ArticleFeedCard.

Flow:
Firestore stream → StreamBuilder → List of Article → Pass to ArticleFeedCard → User sees feed → Swipe vertically → Tap buttons → ArticleDetailScreen or external URL.

screens/article_detail_screen.dart – Article detail / deep dive

Stateless widget showing full article content (title, flash content, image, deep-dive HTML).

Handles articles with deep-dive content (Misinformation) or external source.

Buttons:

Read Full Story → deep-dive content (in-app).

Read at Source → opens external URL via url_launcher.

Share → shares article link.

Responsibilities:

Display full article content.

Handle deep-dive navigation.

Share article links.

Flow: Tap “Read Full Story” / “Read at Source” → Navigate or open URL.

3. Widgets
widgets/article_feed_card.dart – Article preview card

Stateless widget displaying each article in the vertical feed.

Layout:

Top 35%: Image or placeholder.

Bottom 65%: Title, flash content.

Bottom bar: Source info, Read button, Share button.

Theme-based coloring (articleTypeThemes).

Handles deep-dive detection internally.

Launches external URLs or triggers navigation to ArticleDetailScreen.

Responsibilities:

Visual presentation of each article in feed.

Action buttons: Read / Share.

Theme support for positive/negative/misinformation articles.

Flow: Feed page → Render ArticleFeedCard → Tap button → Detail / URL / Share.

4. Models
models/article.dart

Defines Article class with fields like:

id, title, flashContent, deepDiveContent, imageUrl, sourceUrl, sourceTitle, articleType, categories, publishedAt.

Has fromFirestore() method to parse Firestore document into Article.

Responsibilities:

Represent article data in the app.

Convert Firestore docs to usable objects.

5. Theme
theme/article_themes.dart

Provides ArticleTheme for each article type:

Colors for base, text, secondary text, accent, etc.

Used by ArticleFeedCard to style cards consistently.

Responsibilities:

Centralize UI styling for article types.

6. Third-Party Packages

cloud_firestore → Firestore real-time data.

flutter_spinkit → Loading indicators.

google_fonts → Fonts.

cached_network_image → Efficient image loading & caching.

url_launcher → Open external links.

share_plus → Share articles.

7. Overall Flow

App Launch (main.dart) → ArticleFeedScreen.

Firestore Stream → Get latest 20 published articles.

PageView.builder → Each page = ArticleFeedCard.

ArticleFeedCard Buttons:

Read Full Story (deep-dive) → Navigate to ArticleDetailScreen.

Read at Source → Open external URL.

Share → Share link.

ArticleDetailScreen: Shows full content + deep-dive if available.

Theme applied → Cards colored/styled per article type.

✅ Minimal and clean setup now includes:

main.dart

screens/article_feed_screen.dart

screens/article_detail_screen.dart

widgets/article_feed_card.dart

models/article.dart

theme/article_themes.dart

All previous WebView or public article screens are removed, and all performance improvements like limiting stream and vertical swipe feed are applied.