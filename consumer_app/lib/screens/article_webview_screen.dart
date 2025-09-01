import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class ArticleWebViewScreen extends StatefulWidget {
  final String url;
  final String title;

  const ArticleWebViewScreen({
    super.key,
    required this.url,
    required this.title,
  });

  @override
  State<ArticleWebViewScreen> createState() => _ArticleWebViewScreenState();
}

class _ArticleWebViewScreenState extends State<ArticleWebViewScreen> {
  InAppWebViewController? _webViewController;
  late String _readabilityJs;
  bool _isLoading = true;
  bool _isReaderMode = false;
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    _loadReadabilityScript();
  }

  Future<void> _loadReadabilityScript() async {
    _readabilityJs = await rootBundle.loadString('assets/js/readability.js');
  }

  void _toggleReaderMode() async {
    if (_webViewController == null || _readabilityJs.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Webview not ready or script not loaded.'),
          ),
        );
      }
      return;
    }

    setState(() {
      _isReaderMode = !_isReaderMode;
    });

    // Determine theme for reader mode styling based on system brightness
    final isDarkMode = MediaQuery.of(context).platformBrightness == Brightness.dark;
    final bgColor = isDarkMode ? "#121212" : "#f9f9f9";
    final textColor = isDarkMode ? "#E0E0E0" : "#212121";
    final linkColor = isDarkMode ? "#BB86FC" : "#007bff";
    final codeBgColor = isDarkMode ? "#333333" : "#eee";

    if (_isReaderMode) {
      // This script injects the Readability library and then uses it to parse the page.
      // The result replaces the body of the page with clean, readable HTML.
      final script =
          """
        $_readabilityJs
        
        try {
          var documentClone = document.cloneNode(true);
          var article = new Readability(documentClone).parse();
          if (article) {
            document.body.innerHTML = `
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; max-width: 800px; margin: 40px auto; padding: 0 20px; color: ${textColor}; background-color: ${bgColor}; }
                h1 { font-size: 2.2em; line-height: 1.2; }
                a { color: ${linkColor}; text-decoration: none; }
                img, video, figure { max-width: 100%; height: auto; margin: 20px 0; border-radius: 8px; }
                pre, code { background-color: ${codeBgColor}; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; }
              </style>
              <h1>\${article.title}</h1>
              <div><em>\${article.byline || ''}</em></div>
              <hr>
              \${article.content}
            `;
          } else {
            alert('Lumina Reader Mode could not parse this article.');
          }
        } catch (e) {
          alert('An error occurred while enabling Reader Mode: ' + e.message);
        }
      """;
      await _webViewController?.evaluateJavascript(source: script);
    } else {
      // Reload the page to exit reader mode.
      await _webViewController?.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: Icon(
              _isReaderMode
                  ? Icons.chrome_reader_mode
                  : Icons.chrome_reader_mode_outlined,
            ),
            tooltip: 'Toggle Reader Mode',
            onPressed: _toggleReaderMode,
          ),
        ],
      ),
      body: Stack(
        children: [
          InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri(widget.url)),
            onWebViewCreated: (controller) => _webViewController = controller,
            onLoadStart: (controller, url) => setState(() => _isLoading = true),
            onLoadStop: (controller, url) => setState(() => _isLoading = false),
            onProgressChanged: (controller, progress) =>
                setState(() => _progress = progress / 100),
          ),
          if (_isLoading) LinearProgressIndicator(value: _progress),
        ],
      ),
    );
  }
}
