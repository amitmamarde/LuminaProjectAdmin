import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article.dart';
import 'package:consumer_app/widgets/article_feed_card.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

class ArticleFeedScreen extends StatefulWidget {
  const ArticleFeedScreen({super.key});

  @override
  State<ArticleFeedScreen> createState() => _ArticleFeedScreenState();
}

class _ArticleFeedScreenState extends State<ArticleFeedScreen> {
  final int _limit = 20;
  List<Article> _articles = [];
  DocumentSnapshot? _lastDocument;
  bool _isLoading = false;
  bool _hasMore = true;

  final _pageController = PageController();

  @override
  void initState() {
    super.initState();
    _fetchArticles();

    // Detect when user scrolls near the end of current list
    _pageController.addListener(() {
      if (_pageController.position.pixels >=
              _pageController.position.maxScrollExtent - 200 &&
          !_isLoading &&
          _hasMore) {
        _fetchArticles();
      }
    });
  }

  Future<void> _fetchArticles() async {
    if (!_hasMore) return;

    setState(() => _isLoading = true);

    Query query = FirebaseFirestore.instance
        .collection('articles')
        .where('status', isEqualTo: 'Published')
        .orderBy('publishedAt', descending: true)
        .limit(_limit);

    if (_lastDocument != null) {
      query = query.startAfterDocument(_lastDocument!);
    }

    final snapshot = await query.get();

    if (snapshot.docs.isNotEmpty) {
      _lastDocument = snapshot.docs.last;
      _articles.addAll(snapshot.docs.map((doc) => Article.fromFirestore(doc)));
      if (snapshot.docs.length < _limit) _hasMore = false;
    } else {
      _hasMore = false;
    }

    setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_articles.isEmpty && _isLoading) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: SpinKitFadingCube(color: Colors.white, size: 50.0),
        ),
      );
    }

    if (_articles.isEmpty && !_isLoading) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Text(
            'No articles found.',
            style: TextStyle(color: Colors.white),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: PageView.builder(
        controller: _pageController,
        scrollDirection: Axis.vertical,
        itemCount: _articles.length,
        itemBuilder: (context, index) {
          return ArticleFeedCard(article: _articles[index]);
        },
      ),
    );
  }
}
