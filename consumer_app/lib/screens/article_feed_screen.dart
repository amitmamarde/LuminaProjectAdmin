import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article.dart';
import 'package:consumer_app/widgets/article_feed_card.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

class ArticleFeedScreen extends StatefulWidget {
  // Add an optional articleId parameter to handle deep links.
  final String? articleId;
  const ArticleFeedScreen({super.key, this.articleId});

  @override
  State<ArticleFeedScreen> createState() => _ArticleFeedScreenState();
}

class _ArticleFeedScreenState extends State<ArticleFeedScreen> {
  final int _limit = 20;
  List<Article> _articles = [];
  DocumentSnapshot? _lastDocument;
  bool _isLoading = false;
  bool _hasMore = true;

  // PageController is now initialized after the initial article is determined.
  PageController? _pageController;

  @override
  void initState() {
    super.initState();
    // Fetch articles and handle the potential deep link.
    _fetchAndHandleArticles(isInitialLoad: true);
  }

  Future<void> _fetchAndHandleArticles({bool isInitialLoad = false}) async {
    if (_isLoading || (!isInitialLoad && !_hasMore)) return;

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

    // If it's the initial load, we need to set up the PageController.
    if (isInitialLoad) {
      int initialPage = 0;
      // If a deep link articleId was provided...
      if (widget.articleId != null) {
        // ...try to find it in the list we just fetched.
        final index =
            _articles.indexWhere((article) => article.id == widget.articleId);

        if (index != -1) {
          // Found it! Set the initial page to this article's index.
          initialPage = index;
        } else if (_articles.isNotEmpty) {
          // If not found in the first batch, fetch it directly and prepend it.
          // This ensures the user always sees the shared article first.
          try {
            final articleDoc = await FirebaseFirestore.instance
                .collection('articles')
                .doc(widget.articleId)
                .get();
            if (articleDoc.exists && articleDoc.data()?['status'] == 'Published') {
              final deepLinkedArticle = Article.fromFirestore(articleDoc);
              _articles.insert(0, deepLinkedArticle);
              initialPage = 0; // It's now the first item.
            }
          } catch (e) {
            debugPrint("Error fetching deep-linked article: $e");
            // Fallback to showing the feed from the start.
          }
        }
      }
      // Initialize the controller with the correct starting page.
      _pageController = PageController(initialPage: initialPage);

      // Add listener for pagination AFTER the controller is initialized.
      _pageController!.addListener(() {
        if (_pageController!.position.pixels >=
                _pageController!.position.maxScrollExtent - 200 &&
            !_isLoading &&
            _hasMore) {
          _fetchAndHandleArticles();
        }
      });
    }

    // Update the UI.
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _pageController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Show loading spinner if the controller hasn't been initialized yet,
    // which happens on the first load.
    if (_pageController == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: SpinKitFadingCube(color: Colors.white, size: 50.0),
        ),
      );
    }

    if (_articles.isEmpty) {
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
        controller: _pageController!,
        scrollDirection: Axis.vertical,
        itemCount: _articles.length,
        itemBuilder: (context, index) {
          return ArticleFeedCard(article: _articles[index]);
        },
      ),
    );
  }
}
