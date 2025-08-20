import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

class Article {
  final String id;
  final String title;
  final String flashContent;
  final String deepDiveContent;
  final String? imageUrl;
  final String articleType;
  final List<dynamic> categories;
  final String sourceTitle;
  final String sourceUrl;
  final String status;

  Article({
    required this.id,
    required this.title,
    required this.flashContent,
    required this.deepDiveContent,
    this.imageUrl,
    required this.articleType,
    required this.categories,
    required this.sourceTitle,
    required this.sourceUrl,
    required this.status,
  });

  factory Article.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Article(
      id: doc.id,
      title: data['title'] ?? 'No Title',
      flashContent: data['flashContent'] ?? '',
      deepDiveContent: data['deepDiveContent'] ?? '',
      imageUrl: data['imageUrl'],
      articleType: data['articleType'] ?? 'Normal',
      categories: data['categories'] ?? [],
      sourceTitle: data['sourceTitle'] ?? '',
      sourceUrl: data['sourceUrl'] ?? '',
      status: data['status'] ?? '',
    );
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lumina Consumer App',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
      ),
      home: const ArticleSwipePage(),
    );
  }
}

class ArticleSwipePage extends StatefulWidget {
  const ArticleSwipePage({super.key});

  @override
  State<ArticleSwipePage> createState() => _ArticleSwipePageState();
}

class _ArticleSwipePageState extends State<ArticleSwipePage> {
  final Stream<QuerySnapshot> _articlesStream = FirebaseFirestore.instance
      .collection('articles')
      .where('status', isEqualTo: 'Published')
      .orderBy('publishedAt', descending: true)
      .snapshots();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        stream: _articlesStream,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('No published articles.'));
          }

          List<Article> articles = snapshot.data!.docs
              .map((doc) => Article.fromFirestore(doc))
              .toList();

          return PageView.builder(
            scrollDirection: Axis.vertical,
            itemCount: articles.length,
            itemBuilder: (context, index) {
              final article = articles[index];
              Color backgroundColor =
                  article.articleType == 'Positive News'
                      ? Colors.green[50]!
                      : Colors.orange[50]!;

              return Container(
                color: backgroundColor,
                child: Column(
                  children: [
                    // Placeholder image
                    Container(
                      height: 250,
                      width: double.infinity,
                      color: Colors.grey[300],
                      child: const Center(
                        child: Text(
                          'Image Feature Coming Soon',
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16.0, vertical: 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              article.title,
                              style: const TextStyle(
                                  fontSize: 22, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 16),
                            Expanded(
                              child: SingleChildScrollView(
                                child: Text(
                                  article.flashContent,
                                  style: const TextStyle(fontSize: 16),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                ElevatedButton(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) =>
                                              DeepDivePage(article: article)),
                                    );
                                  },
                                  child: const Text('Read More'),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.share),
                                  onPressed: () {
                                    Share.share(
                                        '${article.title}\nRead more: ${article.sourceUrl}');
                                  },
                                ),
                              ],
                            )
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class DeepDivePage extends StatelessWidget {
  final Article article;
  const DeepDivePage({super.key, required this.article});

  // Open URL using url_launcher
  void _launchURL(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw 'Could not launch $url';
    }
  }

  @override
  Widget build(BuildContext context) {
    Color backgroundColor =
        article.articleType == 'Positive News' ? Colors.green[50]! : Colors.orange[50]!;

    return Scaffold(
      appBar: AppBar(
        title: Text(article.title),
      ),
      body: Container(
        color: backgroundColor,
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (article.imageUrl != null)
                Image.network(
                  article.imageUrl!,
                  height: 200,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      const Icon(Icons.image_not_supported, size: 100),
                  loadingBuilder: (context, child, progress) {
                    if (progress == null) return child;
                    return const SizedBox(
                        height: 200,
                        child: Center(child: CircularProgressIndicator()));
                  },
                ),
              const SizedBox(height: 16),
              Text(
                article.title,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8.0,
                children: article.categories
                    .map((c) => Chip(label: Text(c)))
                    .toList(),
              ),
              const SizedBox(height: 12),
              Html(data: article.deepDiveContent),
              const SizedBox(height: 12),
              Text(
                'Source: ${article.sourceTitle}',
                style: const TextStyle(fontStyle: FontStyle.italic),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: () {
                  _launchURL(article.sourceUrl);
                },
                child: Text(
                  article.sourceUrl,
                  style: const TextStyle(
                      color: Colors.blue,
                      decoration: TextDecoration.underline),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
