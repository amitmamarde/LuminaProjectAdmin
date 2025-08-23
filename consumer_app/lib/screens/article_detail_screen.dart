import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/article_model.dart';
import 'package:intl/intl.dart';

class ArticleDetailScreen extends StatelessWidget {
  final Article article;

  const ArticleDetailScreen({super.key, required this.article});

  Future<void> _launchUrl(String url) async {
    final Uri uri = Uri.parse(url);
    if (!await launchUrl(uri)) {
      // In a real app, you might want to show a snackbar or dialog
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(article.title, style: const TextStyle(color: Colors.black87, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 1,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (article.imageUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12.0),
                  child: Image.network(
                    article.imageUrl!,
                    width: double.infinity,
                    height: 250,
                    fit: BoxFit.cover,
                  ),
                ),
              const SizedBox(height: 16),
              Text(
                article.title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              if (article.publishedAt != null)
                Text(
                  'Published on ${DateFormat.yMMMMd().format(article.publishedAt!.toDate())}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                ),
              const SizedBox(height: 8),
              Text(
                article.categories.join(', '),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).primaryColor, fontWeight: FontWeight.w600),
              ),
              if (article.sourceUrl != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12.0),
                  child: InkWell(
                    onTap: () => _launchUrl(article.sourceUrl!),
                    child: Text(
                      'Source: ${article.sourceTitle ?? 'Read original article'}',
                      style: const TextStyle(color: Colors.blue, decoration: TextDecoration.underline),
                    ),
                  ),
                ),
              const Divider(height: 32),
              Html(
                data: article.deepDiveContent ?? '<p>No content available.</p>',
                onLinkTap: (url, _, __) {
                  if (url != null) {
                    _launchUrl(url);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}