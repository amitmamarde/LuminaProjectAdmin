import 'package:consumer_app/screens/article_feed_screen.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:consumer_app/models/article.dart'; // Needed for routing if we pass objects

// This assumes you have a firebase_options.dart file from `flutterfire configure`
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lumina Summaries',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
      ),
      debugShowCheckedModeBanner: false,
      // Implement onGenerateRoute to handle deep linking for shared articles.
      onGenerateRoute: (settings) {
        // Example route: /#/view/some_article_id
        // The 'settings.name' will be '/view/some_article_id'
        if (settings.name != null && settings.name!.startsWith('/view/')) {
          // Extract the article ID from the route.
          final articleId = settings.name!.substring('/view/'.length);
          return MaterialPageRoute(
            builder: (context) => ArticleFeedScreen(articleId: articleId),
          );
        }
        // Default route if no specific path matches.
        return MaterialPageRoute(
          builder: (context) => const ArticleFeedScreen(),
        );
      },
      initialRoute: '/', // The entry point for the app.
    );
  }
}
