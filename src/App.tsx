import React, { useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, sendPasswordResetEmail, type User } from 'firebase/auth';
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    updateDoc,
    serverTimestamp,
    onSnapshot,
    writeBatch,
    Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';


import ReactQuill from 'react-quill';
import DOMPurify from 'dompurify';

import { Modal } from './components/Modal';
import type { UserProfile, Article, ArticleStatus, ArticleType, SuggestedTopic } from './types';
import { ArticleStatus as ArticleStatusEnum } from './types';
import { auth, db, functions } from './firebase';
import { saveArticle, deleteArticle } from './services/articleService';


// --- App-wide Constants ---
const CATEGORIES = [
  'Science & Technology', 'Health & Wellness', 'History & Culture', 'Politics & Society',
  'Digital & Media Literacy', 'Business & Finance', 'Environment & Sustainability',
  'Education & Learning', 'Arts, Media & Creativity'
];
const ARTICLE_TYPES: ArticleType[] = ['Trending Topic', 'Positive News', 'Misinformation'];
const REGIONS = ['Worldwide', 'USA', 'India', 'Europe'];

// --- Authentication Context ---
interface AuthContextType {
  user: User | null;
  userData: UserProfile | null;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });
const useAuth = () => useContext(AuthContext);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const fetchedUserData = { uid: firebaseUser.uid, ...userDocSnap.data() } as UserProfile;
          if (fetchedUserData.status === 'disabled') {
            await signOut(auth);
            setUser(null);
            setUserData(null);
            alert('Your account has been disabled. Please contact an administrator.');
          } else {
            setUser(firebaseUser);
            setUserData(fetchedUserData);
          }
        } else {
          setUserData(null);
          await signOut(auth);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- UI Helper Components ---
const Spinner: React.FC = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-brand-primary"></div>
  </div>
);

const Badge: React.FC<{ status: ArticleStatus | UserProfile['status'] }> = ({ status }) => {
  const statusColors: Record<string, string> = {
    [ArticleStatusEnum.Draft]: 'bg-gray-200 text-gray-800',
    'Queued': 'bg-purple-200 text-purple-800',
    [ArticleStatusEnum.GenerationFailed]: 'bg-pink-200 text-pink-800',
    [ArticleStatusEnum.AwaitingExpertReview]: 'bg-yellow-200 text-yellow-800',
    [ArticleStatusEnum.AwaitingAdminReview]: 'bg-blue-200 text-blue-800',
    [ArticleStatusEnum.NeedsRevision]: 'bg-red-200 text-red-800',
    [ArticleStatusEnum.Published]: 'bg-green-200 text-green-800',
    'active': 'bg-green-200 text-green-800',
    'disabled': 'bg-red-200 text-red-800',
  };
  const statusText = status.replace(/([A-Z])/g, ' $1').trim();
  return (
    <span className={`px-3 py-1 text-sm font-semibold rounded-full capitalize ${statusColors[status]}`}>
      {statusText}
    </span>
  );
};

// --- Page & Feature Components ---

// --- Public Components ---

const PublicHeader: React.FC = () => {
    return (
        <header className="bg-brand-surface shadow-md sticky top-0 z-40">
            <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                <Link to="/" className="text-2xl font-bold text-brand-primary">Lumina</Link>
                <nav>
                    <Link to="/login" className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-indigo-700 transition">
                        Curator Login
                    </Link>
                </nav>
            </div>
        </header>
    );
};

const HomePage: React.FC = () => {
    const { user, loading } = useAuth();
    const [latestArticles, setLatestArticles] = useState<Article[]>([]);
    const [contentLoading, setContentLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, loading, navigate]);

    useEffect(() => {
        const fetchLatest = async () => {
            setContentLoading(true);
            const articlesRef = collection(db, 'articles');
            const q = query(articlesRef,
                where('status', '==', ArticleStatusEnum.Published),
                orderBy('publishedAt', 'desc'),
                limit(3)
            );
            const querySnapshot = await getDocs(q);
            const fetchedArticles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
            setLatestArticles(fetchedArticles);
            setContentLoading(false);
        };
        fetchLatest();
    }, []);

    if (loading || user) {
        return <div className="h-screen w-screen flex items-center justify-center"><Spinner /></div>;
    }
    
    return (
        <div className="bg-brand-background">
            <PublicHeader />
            <main>
                <section className="bg-brand-primary text-white text-center py-20 px-6">
                    <h1 className="text-5xl font-extrabold mb-4">Clarity in a Complex World</h1>
                    <p className="text-xl max-w-3xl mx-auto mb-8 text-indigo-100">Verified, unbiased news and uplifting stories, curated by AI and validated by human experts. Get the flash summary or the deep dive—the choice is yours.</p>
                    <Link to="/feed" className="bg-brand-accent text-white font-bold py-3 px-8 rounded-full hover:bg-amber-500 transition-transform transform hover:scale-105 text-lg">
                        Start Reading
                    </Link>
                </section>
                <section className="container mx-auto px-6 py-16">
                    <h2 className="text-3xl font-bold text-center text-brand-text-primary mb-10">Latest from Lumina</h2>
                    {contentLoading ? <Spinner /> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {latestArticles.map(article => (
                                <a href={(article.articleType === 'Misinformation' && article.deepDiveContent) ? `#/view/${article.id}` : (article.sourceUrl || `#/view/${article.id}`)}
                                   target={(article.articleType === 'Misinformation' && article.deepDiveContent) ? '_self' : (article.sourceUrl ? '_blank' : '_self')}
                                   rel="noopener noreferrer"
                                   key={article.id}
                                   className="block bg-brand-surface rounded-lg shadow-md hover:shadow-2xl transition-shadow duration-300 overflow-hidden group">
                                    {article.imageUrl && <img src={article.imageUrl} alt={article.title} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"/>}
                                    <div className="p-6">
                                        <p className="text-sm text-brand-primary font-semibold mb-2">{article.categories.join(', ')}</p>
                                        <h3 className="text-xl font-bold text-brand-text-primary mb-3">{article.title}</h3>
                                        <p className="text-brand-text-secondary text-sm">{article.flashContent?.substring(0, 100)}...</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3z" />
    </svg>
);

const handleShare = async (article: Article) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/view/${article.id}`;
    const shareData = {
        title: article.title,
        text: `Read on Lumina: ${article.title}`,
        url: shareUrl,
    };

    if (navigator.share) {
        await navigator.share(shareData).catch(err => console.error('Share failed:', err));
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied to clipboard!'));
    }
};

const ArticleFeedPage: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchArticles = async () => {
            setLoading(true);
            const articlesRef = collection(db, 'articles');
            const q = query(articlesRef, where('status', '==', ArticleStatusEnum.Published), orderBy('publishedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            setArticles(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article)));
            setLoading(false);
        };
        fetchArticles();
    }, []);

    if (loading) return <div className="h-screen w-screen flex items-center justify-center"><Spinner /></div>;
    
    return (
        <div className="h-screen w-screen overflow-y-scroll snap-y snap-mandatory bg-black">
            <PublicHeader />
            {articles.map(article => {
                const hasDeepDive = article.articleType === 'Misinformation' && article.deepDiveContent;
                const readLink = hasDeepDive ? `#/view/${article.id}` : article.sourceUrl!;
                const readTarget = hasDeepDive ? '_self' : '_blank';
                const readButtonText = hasDeepDive ? 'Read Full Story' : `Read at ${article.sourceTitle || 'Source'}`;

                return (
                    <section key={article.id} className="h-screen w-full snap-start flex flex-col relative text-white bg-gray-900">
                        {/* Layer 1: Background Image */}
                        {article.imageUrl && (
                            <div
                                className="absolute inset-0 bg-cover bg-center"
                                style={{ backgroundImage: `url(${article.imageUrl})` }}
                            />
                        )}
                        {/* Layer 2: Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />

                        {/* Layer 3: Content */}
                        <div className="relative z-10 flex flex-col h-full p-6 md:p-8">
                            <div className="flex-grow" /> {/* Spacer */}
                            <div className="max-w-3xl mx-auto w-full">
                                <h1 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.7)' }}>
                                    {article.title}
                                </h1>
                                <p className="text-base md:text-lg mb-8 leading-relaxed max-h-40 overflow-y-auto">
                                    {article.flashContent}
                                </p>
                                <div className="flex justify-between items-center text-sm">
                                    {/* Left: Source */}
                                    <div className="flex-1 text-left">
                                        <p className="text-gray-400 text-xs">Source</p>
                                        <p className="font-semibold">{article.sourceTitle || 'N/A'}</p>
                                    </div>
                                    {/* Middle: Read Button */}
                                    <div className="flex-1 text-center">
                                        <a href={readLink} target={readTarget} rel="noopener noreferrer" className="bg-white text-black font-bold py-3 px-6 rounded-full hover:bg-gray-200 transition-transform transform hover:scale-105 inline-block">
                                            {readButtonText}
                                        </a>
                                    </div>
                                    {/* Right: Share Button */}
                                    <div className="flex-1 text-right">
                                        <button onClick={() => handleShare(article)} className="p-3 rounded-full hover:bg-white/20 transition">
                                            <ShareIcon className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )
            })}
        </div>
    );
};

const PublicArticleView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        const fetchArticle = async () => {
            setLoading(true);
            const docRef = doc(db, 'articles', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data()?.status === ArticleStatusEnum.Published) {
                const articleData = { id: docSnap.id, ...docSnap.data() } as Article;
                setArticle(articleData);
            } else {
                setArticle(null); // Or redirect to a 404 page
            }
            setLoading(false);
        };
        fetchArticle();
    }, [id]);

    if (loading) return <div className="h-screen w-screen flex items-center justify-center"><Spinner /></div>;
    if (!article) return <div className="text-center py-20"><h1>Article not found or not published.</h1><Link to="/" className="text-brand-primary hover:underline">Go Home</Link></div>;

    // For non-misinformation articles, the deep dive is not on our site.
    // This view primarily serves to display the full content of "Misinformation" articles.
    // For other types, we show the summary and a clear link to the source.
    const hasDeepDive = article.articleType === 'Misinformation' && article.deepDiveContent;
    const sourceLinkText = article.sourceTitle || 'Read original article';
    const sourceLink = article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-primary hover:underline">{sourceLinkText}</a> : null;

    return (
        <div className="bg-brand-background min-h-screen">
             <PublicHeader />
             <article className="max-w-4xl mx-auto py-12 px-6">
                {article.imageUrl && <img src={article.imageUrl} alt={article.title} className="w-full h-auto max-h-96 object-cover rounded-xl mb-8 shadow-lg" />}
                <div className="bg-brand-surface p-8 sm:p-12 rounded-lg shadow-lg">
                    <p className="text-brand-primary font-bold mb-2">{article.categories?.join(', ')}</p>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-brand-text-primary mb-4">{article.title}</h1>
                    <div className="text-brand-text-secondary border-b pb-4 mb-6 text-sm">
                        Published on {article.publishedAt?.toDate().toLocaleDateString()}
                        {article.expertShowNameToPublic && article.expertDisplayName && ` • Verified by ${article.expertDisplayName}`}
                    </div>

                    {hasDeepDive ? (
                        <div
                            className="prose prose-lg max-w-none prose-h2:text-brand-text-primary prose-h2:border-b prose-h2:pb-2 prose-strong:text-brand-text-primary"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.deepDiveContent || '') }}
                        />
                    ) : (
                        <div className="mb-6 bg-gray-100 p-4 rounded-lg border border-gray-200">
                             <h2 className="text-2xl font-bold text-brand-text-primary mb-4">Lumina Flash</h2>
                             {/* Using whitespace-pre-wrap to respect newlines in plain text flashContent */}
                             <p className="text-lg text-brand-text-secondary mb-4 whitespace-pre-wrap">{article.flashContent}</p>
                             {sourceLink && (
                                <p className="text-brand-text-secondary">
                                    This is a summary of a story from an external source.
                                    <br />
                                    <strong>Source:</strong> {sourceLink}
                                </p>
                             )}
                        </div>
                    )}
                </div>
             </article>
        </div>
    );
};


// --- Curation Platform Components ---
const Header: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <header className="bg-brand-surface shadow-md sticky top-0 z-40">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/dashboard" className="text-2xl font-bold text-brand-primary">Lumina Platform</Link>
        {userData && (
          <nav className="flex items-center space-x-6">
            <Link to="/dashboard" className="text-brand-text-secondary hover:text-brand-primary font-medium">Dashboard</Link>
            {userData.role === 'Admin' && (
              <>
                <Link to="/experts" className="text-brand-text-secondary hover:text-brand-primary font-medium">Manage Experts</Link>
              </>
            )}
            <span className="text-brand-text-secondary">
              Welcome, <Link to="/profile" className="font-semibold text-brand-primary hover:underline">{userData.displayName}</Link> ({userData.role})
            </span>
            <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition">Logout</button>
          </nav>
        )}
      </div>
    </header>
  );
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      setResetMessage("Please enter your email address.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage("Success! If an account with that email exists, a password reset link has been sent.");
    } catch (error: any) {
      setResetMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-background">
      <div className="max-w-md w-full bg-brand-surface shadow-lg rounded-lg p-8">
        <h2 className="text-3xl font-extrabold text-center text-brand-text-primary mb-6">Lumina Platform Login</h2>
        {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-4 text-center">{error}</p>}
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-brand-text-secondary mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
              required
              aria-label="Email"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" aria-label="Password" className="block text-sm font-medium text-brand-text-secondary mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition disabled:bg-indigo-300"
          >
            {loading ? <span className="animate-pulse">Signing In...</span> : 'Sign In'}
          </button>
        </form>
        <div className="text-center mt-4">
          <button onClick={() => setResetModalOpen(true)} className="text-sm text-brand-primary hover:underline">
            Forgot Password?
          </button>
        </div>
      </div>

      <Modal isOpen={isResetModalOpen} onClose={() => setResetModalOpen(false)} title="Reset Password">
        <p className="mb-4 text-brand-text-secondary">Enter your email address and we'll send you a link to reset your password.</p>
        {resetMessage && <p className={`p-3 rounded mb-4 text-center ${resetMessage.startsWith('Success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{resetMessage}</p>}
        <div className="mb-4">
            <label htmlFor="reset-email" className="block text-sm font-medium text-brand-text-secondary mb-1">Email</label>
            <input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
              placeholder="you@example.com"
              aria-label="Reset Email"
            />
          </div>
        <button
          onClick={handlePasswordReset}
          className="w-full bg-brand-secondary text-white py-2 px-4 rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-secondary"
        >
          Send Reset Link
        </button>
      </Modal>
    </div>
  );
};

const DashboardPage: React.FC = () => {
    const { userData } = useAuth();
    const [isRequeuing, setIsRequeuing] = useState(false);
    const [isTestingSources, setIsTestingSources] = useState(false);
    const [testFeedback, setTestFeedback] = useState('');
    const [feedback, setFeedback] = useState('');

    if (!userData) return <Navigate to="/login" />;

    const handleRequeueAll = async () => {
        if (!window.confirm('Are you sure you want to re-queue all failed articles for generation?')) {
            return;
        }
        setIsRequeuing(true);
        setFeedback('');
        try {
            const requeueFunction = httpsCallable(functions, 'requeueAllFailedArticles');
            const result = await requeueFunction({});
            const data = result.data as { success: boolean; message: string; count: number };
            setFeedback(data.message || 'An unknown error occurred.');
        } catch (error: any) {
            console.error("Error re-queuing articles:", error);
            setFeedback(`Error: ${error.message || 'Failed to re-queue articles.'}`);
        } finally {
            setIsRequeuing(false);
            setTimeout(() => setFeedback(''), 5000);
        }
    };

    const handleTestSource = async () => {
        if (!window.confirm('This will trigger a test to fetch one article from every source in the registry (~100 sources). This may take several minutes and will incur costs. Continue?')) {
            return;
        }
        setIsTestingSources(true);
        setTestFeedback('');
        try {
            const testFunction = httpsCallable(functions, 'testAllSources');
            const result = await testFunction({});
            const data = result.data as { success: boolean; message: string; reportId: string };
            setTestFeedback(data.message || 'Test completed. Check Firestore for the report.');
        } catch (error: any) {
            console.error("Error testing sources:", error);
            setTestFeedback(`Error: ${error.message || 'Failed to start source test.'}`);
        } finally {
            setIsTestingSources(false);
            setTimeout(() => setTestFeedback(''), 10000);
        }
    };

    const handleSampleTestSource = async () => {
        if (!window.confirm('This will test one source from each category/region combination to check for major issues. This is a low-cost test. Continue?')) {
            return;
        }
        setIsTestingSources(true);
        setTestFeedback('');
        try {
            const testFunction = httpsCallable(functions, 'testSampleSources');
            const result = await testFunction({});
            const data = result.data as { success: boolean; message: string; reportId: string };
            setTestFeedback(data.message || 'Sample test completed. Check Firestore for the report.');
        } catch (error: any) {
            console.error("Error testing sample sources:", error);
            setTestFeedback(`Error: ${error.message || 'Failed to start sample source test.'}`);
        } finally {
            setIsTestingSources(false);
            setTimeout(() => setTestFeedback(''), 10000);
        }
    };

    const handleMicroSampleTestSource = async () => {
        if (!window.confirm('This will test 2 hardcoded sources (2 articles each) to debug the generation pipeline. This is a very low-cost test. Continue?')) {
            return;
        }
        setIsTestingSources(true);
        setTestFeedback('');
        try {
            const testFunction = httpsCallable(functions, 'testMicroSampleSources');
            const result = await testFunction({});
            const data = result.data as { success: boolean; message: string; reportId: string };
            setTestFeedback(data.message || 'Micro sample test completed. Check Firestore for the report.');
        } catch (error: any) {
            console.error("Error testing micro sample sources:", error);
            setTestFeedback(`Error: ${error.message || 'Failed to start micro sample source test.'}`);
        } finally {
            setIsTestingSources(false);
            setTimeout(() => setTestFeedback(''), 10000);
        }
    };

    return (
        <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-brand-text-primary">Dashboard</h1>
                    {userData.role === 'Admin' && (
                        <div className="flex flex-wrap gap-2">
                            <button onClick={handleMicroSampleTestSource} disabled={isTestingSources} className="bg-orange-500 text-white py-2 px-4 rounded-md hover:bg-orange-600 disabled:bg-orange-300 transition">
                                {isTestingSources ? 'Testing...' : 'Micro Test (4 Articles)'}
                            </button>
                            <button onClick={handleSampleTestSource} disabled={isTestingSources} className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition">
                                {isTestingSources ? 'Testing...' : 'Test Sample Sources (RSS)'}
                            </button>
                            {/* <button onClick={handleTestSource} disabled={isTestingSources} className="bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 disabled:bg-teal-300 transition">
                                {isTestingSources ? 'Testing All...' : 'Test All Sources'}
                            </button> */}
                            <button onClick={handleRequeueAll} disabled={isRequeuing || isTestingSources} className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-purple-300 transition">
                                {isRequeuing ? 'Re-queueing...' : 'Re-queue All Failed'}
                            </button>
                        </div>
                    )}
                </div>
                {feedback && <div className={`p-3 rounded mb-4 text-center ${feedback.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{feedback}</div>}
                {testFeedback && <div className={`p-3 rounded mb-4 text-center ${testFeedback.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{testFeedback}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <DashboardCard title="My Work Queue" link="/my-tasks" description="View articles assigned to you for review or revision." />
                    {userData.role === 'Admin' && <DashboardCard title="Review Submissions" link="/admin-review" description="Review articles submitted by experts." />}
                    {userData.role === 'Admin' && <DashboardCard title="Manage Articles" link="/articles" description="View and manage all content in the system." />}
                    {userData.role === 'Admin' && <DashboardCard title="Create New Article" link="/create" description="Manually create a new article draft." />}
                </div>
            </main>
        </div>
    );
};

const DashboardCard: React.FC<{ title: string; link: string; description: string }> = ({ title, link, description }) => (
    <Link to={link} className="block p-6 bg-brand-surface rounded-lg shadow-md hover:shadow-lg transition-shadow hover:border-brand-primary border-2 border-transparent">
        <h2 className="text-xl font-bold text-brand-primary mb-2">{title}</h2>
        <p className="text-brand-text-secondary">{description}</p>
    </Link>
);

const UserProfilePage: React.FC = () => {
    const { userData, user } = useAuth();
    const [displayName, setDisplayName] = useState(userData?.displayName || '');
    const [showNameToPublic, setShowNameToPublic] = useState(userData?.showNameToPublic || false);
    const [categories, setCategories] = useState<string[]>(userData?.categories || []);
    const [feedback, setFeedback] = useState('');
    const [loading, setLoading] =useState(false);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                displayName,
                showNameToPublic,
                categories,
            });
            setFeedback('Profile updated successfully!');
            setTimeout(() => setFeedback(''), 3000);
        } catch (error: any) {
            setFeedback(`Error updating profile: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryChange = (category: string) => {
        setCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    if (!userData) return <Spinner />;

    return (
         <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6 max-w-2xl">
                <div className="bg-brand-surface p-8 rounded-lg shadow-md">
                    <h1 className="text-3xl font-bold text-brand-text-primary mb-6">My Profile</h1>
                    {feedback && (
                        <p className={`p-3 rounded mb-4 text-center ${feedback.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {feedback}
                        </p>
                    )}
                    <form onSubmit={handleUpdateProfile}>
                         <div className="mb-4">
                            <label htmlFor="displayName" className="block text-sm font-medium text-brand-text-secondary mb-1">Display Name</label>
                            <input
                                id="displayName"
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
                                required
                            />
                        </div>
                        <div className="mb-6 flex items-center">
                            <input
                                id="showName"
                                type="checkbox"
                                checked={showNameToPublic}
                                onChange={e => setShowNameToPublic(e.target.checked)}
                                className="h-4 w-4 text-brand-primary focus:ring-brand-primary border-gray-300 rounded"
                            />
                            <label htmlFor="showName" className="ml-2 block text-sm text-brand-text-secondary">Show my name on published articles</label>
                        </div>
                        {userData.role === 'Expert' && (
                             <div className="mb-6">
                                <label className="block text-sm font-medium text-brand-text-secondary mb-2">My Categories of Expertise</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {CATEGORIES.map(category => (
                                    <div key={category} className="flex items-center">
                                    <input
                                        id={`cat-${category}`}
                                        type="checkbox"
                                        checked={categories.includes(category)}
                                        onChange={() => handleCategoryChange(category)}
                                        className="h-4 w-4 text-brand-primary focus:ring-brand-primary border-gray-300 rounded"
                                    />
                                    <label htmlFor={`cat-${category}`} className="ml-2 text-sm text-brand-text-primary">{category}</label>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                         <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-brand-primary text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition disabled:bg-indigo-300"
                          >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
};

const ArticleListPage: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');

    useEffect(() => {
        setLoading(true);
        const articlesRef = collection(db, 'articles');
        let q: ReturnType<typeof query>; 

        // When filtering for 'Published' articles, it's better to sort by the publication date.
        // For all other statuses (or 'all'), sorting by creation date is more appropriate.
        if (filterStatus === ArticleStatusEnum.Published) {
            // This query is supported by the (status, publishedAt) index.
            q = query(articlesRef, where('status', '==', filterStatus), orderBy('publishedAt', 'desc'));
        } else if (filterStatus !== 'all') {
            // This query is supported by the (status, createdAt) index.
            q = query(articlesRef, where('status', '==', filterStatus), orderBy('createdAt', 'desc'));
        } else {
            q = query(articlesRef, orderBy('createdAt', 'desc'));
        }
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedArticles = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data()) as Article));
            setArticles(fetchedArticles);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching articles:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [filterStatus]);

    const filteredArticles = useMemo(() => {
        return articles.filter(article => {
            return filterType === 'all' || article.articleType === filterType;
        });
    }, [articles, filterType]);

    return (
        <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6">
                <h1 className="text-3xl font-bold text-brand-text-primary mb-6">Manage All Articles</h1>

                <div className="bg-brand-surface p-4 rounded-lg shadow-md mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-brand-text-secondary mb-1">Filter by Status</label>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary">
                                <option value="all">All Statuses</option>
                                {Object.values(ArticleStatusEnum).map(status => (
                                    <option key={status} value={status}>{status.replace(/([A-Z])/g, ' $1').trim()}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-brand-text-secondary mb-1">Filter by Type</label>
                            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary">
                                <option value="all">All Types</option>
                                {ARTICLE_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {loading ? <Spinner /> : (
                    filteredArticles.length > 0 ? (
                        <div className="bg-brand-surface shadow-md rounded-lg overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                               <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created On</th>
                                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
                                    </tr>
                                </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredArticles.map(article => (
                                        <tr key={article.id}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{article.title}</div>
                                                <div className="text-sm text-gray-500">{article.categories.join(', ')}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{article.articleType}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><Badge status={article.status} /></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{article.createdAt.toDate().toLocaleDateString()}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <Link to={`/edit/${article.id}`} className="text-brand-primary hover:text-indigo-900">Edit</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                     ) : (
                        <div className="text-center py-10 bg-brand-surface rounded-lg shadow-md">
                            <p className="text-brand-text-secondary">No articles match the current filters.</p>
                        </div>
                     )
                )}
            </main>
        </div>
    );
};

const TaskListPage: React.FC<{ mode: 'my-tasks' | 'admin-review' }> = ({ mode }) => {
    const { userData } = useAuth();
    const [tasks, setTasks] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');

    const pageTitle = mode === 'my-tasks' ? 'My Work Queue' : 'Admin Review Queue';
    const noTasksMessage = mode === 'my-tasks' ? 'You have no assigned tasks.' : 'There are no articles awaiting admin review.';

    useEffect(() => {
        if (!userData) return;
        setLoading(true);

        const articlesRef = collection(db, 'articles');
        let q: ReturnType<typeof query>;

        if (mode === 'my-tasks') {
            if (userData.role === 'Expert') {
                q = query(articlesRef, 
                    where('expertId', '==', userData.uid),
                    where('status', 'in', [ArticleStatusEnum.AwaitingExpertReview, ArticleStatusEnum.NeedsRevision]),
                    orderBy('status'),
                    orderBy('createdAt', 'desc')
                );
            } else { // Admin's "my-tasks" includes their own drafts or items they are working on
                 q = query(articlesRef, 
                    where('status', '==', ArticleStatusEnum.Draft),
                    orderBy('createdAt', 'desc')
                );
            }
        } else { // Admin Review
            q = query(articlesRef,
                where('status', '==', ArticleStatusEnum.AwaitingAdminReview),
                orderBy('createdAt', 'desc')
            );
        }

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedTasks = querySnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data()) as Article));
            setTasks(fetchedTasks);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tasks:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userData, mode]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            return filterType === 'all' || task.articleType === filterType;
        });
    }, [tasks, filterType]);

    if (loading) return <Spinner />;

    return (
        <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6">
                 <h1 className="text-3xl font-bold text-brand-text-primary mb-6">{pageTitle}</h1>

                <div className="bg-brand-surface p-4 rounded-lg shadow-md mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-brand-text-secondary mb-1">Filter by Type</label>
                            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary">
                                <option value="all">All Types</option>
                                {ARTICLE_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                 {filteredTasks.length > 0 ? (
                    <div className="bg-brand-surface shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                           <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
                                    <th scope="col" className="relative px-6 py-3"><span className="sr-only">Open</span></th>
                                </tr>
                            </thead>
                             <tbody className="bg-white divide-y divide-gray-200">
                                {filteredTasks.map(task => (
                                    <tr key={task.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{task.title}</div>
                                            <div className="text-sm text-gray-500">{task.categories.join(', ')}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.articleType}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><Badge status={task.status} /></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.createdAt.toDate().toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Link to={`/edit/${task.id}`} className="text-brand-primary hover:text-indigo-900">Open Task</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 ) : (
                    <div className="text-center py-10 bg-brand-surface rounded-lg shadow-md">
                        <p className="text-brand-text-secondary">{tasks.length === 0 ? noTasksMessage : 'No tasks match the current filters.'}</p>
                    </div>
                 )}
            </main>
        </div>
    );
};

const ArticleEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { userData } = useAuth();
    const navigate = useNavigate();
    
    const [article, setArticle] = useState<Partial<Article>>({
        title: '',
        articleType: 'Trending Topic',
        categories: [],
        region: 'Worldwide',
        shortDescription: '',
        status: ArticleStatusEnum.Draft,
    });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [experts, setExperts] = useState<UserProfile[]>([]);
    const [selectedExpertId, setSelectedExpertId] = useState('');
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);


    const isNewArticle = id === undefined;

    const quillModules = useMemo(() => ({
        toolbar: [
            [{ 'header': [2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
            ['link'],
            ['clean']
        ],
    }), []);

    useEffect(() => {
        if (userData?.role === 'Admin') {
            const fetchExperts = async () => {
                const expertsQuery = query(collection(db, 'users'), where('role', '==', 'Expert'));
                const querySnapshot = await getDocs(expertsQuery);
                setExperts(querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
            };
            fetchExperts();
        }
    }, [userData]);
    
    useEffect(() => {
        if (isNewArticle) {
            setLoading(false);
            return;
        }
        if (!id) return;

        // Use onSnapshot for real-time updates. This will automatically refresh the
        // UI when the backend function updates the article's status or content.
        const docRef = doc(db, 'articles', id);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const fetchedArticle = { id: docSnap.id, ...docSnap.data() } as Article;
                setArticle(fetchedArticle);
                setSelectedExpertId(fetchedArticle.expertId || '');
                setError(''); // Clear previous errors on successful fetch
            } else {
                setError('Article not found.');
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching article:", err);
            setError("Failed to load article data.");
            setLoading(false);
        });

        // Clean up the listener when the component unmounts or the id changes.
        return () => unsubscribe();
    }, [id, isNewArticle]);

    const showSuccessMessage = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    const handleSave = async (newStatus?: ArticleStatus) => {
        if (!userData) return;
        setIsSaving(true);
        setError('');

        const dataToSave: Partial<Article> = {
            ...article,
            status: newStatus || article.status,
        };

       try {
            const savedId = await saveArticle(id, dataToSave);
            setArticle(prev => ({...prev, ...dataToSave}));
            if (isNewArticle) {
                navigate(`/edit/${savedId}`, { replace: true });
            }
            showSuccessMessage('Changes saved successfully!');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleSubmitForReview = async () => {
        if (!userData || !id) return;

        if (userData.role === 'Admin' && article.articleType === 'Trending Topic') {
            if (!selectedExpertId) {
                setError('Please assign an expert before submitting.');
                return;
            }
            const expert = experts.find(e => e.uid === selectedExpertId);
            if (!expert) {
                setError('Selected expert not found.');
                return;
            }
            const dataToUpdate = {
                expertId: selectedExpertId,
                expertDisplayName: expert.displayName,
                expertShowNameToPublic: expert.showNameToPublic,
                status: ArticleStatusEnum.AwaitingExpertReview,
            };
            await saveArticle(id, dataToUpdate);
        } else if (userData.role === 'Expert') {
            const dataToUpdate = { status: ArticleStatusEnum.AwaitingAdminReview };
            const docRef = doc(db, 'articles', id);
            await updateDoc(docRef, dataToUpdate);
            setArticle(prev => ({...prev, ...dataToUpdate}));
        }
        navigate('/dashboard');
    };

    const handlePublish = async () => {
        if (userData?.role !== 'Admin' || !id) return;

        // --- IMAGE GENERATION ---
        // As requested, we are skipping the image generation step for now.
        // The article will be published without an image.
        // const imageUrl = article.imageUrl || await generateAndUploadImage();
        // if(!imageUrl) return;

        const dataToUpdate = {
            status: ArticleStatusEnum.Published,
            publishedAt: serverTimestamp(),
            // imageUrl, // This is commented out to skip adding an image.
        };

        await saveArticle(id, dataToUpdate as Partial<Article>);
        setArticle(prev => ({...prev, status: ArticleStatusEnum.Published, publishedAt: Timestamp.now()}));
        navigate('/articles');
    };
    
    const generateAndUploadImage = async (): Promise<string | null> => {
        if (!id || !article.imagePrompt) {
            setError("Image prompt is missing.");
            return null;
        }
        setIsSaving(true);
        try {
            const generateImageFunction = httpsCallable(functions, 'generateImage');
            const result = await generateImageFunction({ prompt: article.imagePrompt });
            const imageData = result.data as { success: boolean; imageUrl?: string; error?: string };

            if (!imageData.success || !imageData.imageUrl) {
                 setError(imageData.error || "Failed to generate image.");
                 return null;
            }
            setArticle(prev => ({ ...prev, imageUrl: imageData.imageUrl }));
            return imageData.imageUrl;
        } catch (e: any) {
            setError(`Image generation failed: ${e.message}`);
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    const handleRegenerate = async () => {
        if (!id || userData?.role !== 'Admin') return;
        setIsRegenerating(true);
        setError('');
        setSuccessMessage('');

        try {
            // This button should queue the article, not regenerate it synchronously.
            // Calling 'queueArticleContentGeneration' correctly uses the task queue.
            const queueFunction = httpsCallable(functions, 'queueArticleContentGeneration');
            await queueFunction({ articleId: id });
            // The onSnapshot listener will automatically update the UI.
            showSuccessMessage('Article has been successfully queued for regeneration. The status will update shortly.');
        } catch (e: any) {
            setError(`Queueing for regeneration failed: ${e.message}`);
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleDelete = async () => {
        if (isNewArticle || !id) return;
        setIsDeleting(true);
        try {
            await deleteArticle(id);
            navigate('/articles');
        } catch (error: any) {
            setError(`Failed to delete: ${error.message}`);
            setIsDeleting(false);
        }
    };
    
    const handleCategoryChange = (category: string) => {
        const currentCategories = article.categories || [];
        const newCategories = currentCategories.includes(category)
            ? currentCategories.filter(c => c !== category)
            : [...currentCategories, category];
        setArticle(prev => ({ ...prev, categories: newCategories }));
    };
    
    if (loading) return <Spinner />;
    if (error && !successMessage) return <div className="text-center py-10 text-red-600">{error}</div>;

    const canEditCore = userData?.role === 'Admin' && (article.status === ArticleStatusEnum.Draft || article.status === ArticleStatusEnum.NeedsRevision);
    const canEditContent = !([ArticleStatusEnum.Published, ArticleStatusEnum.AwaitingExpertReview].includes(article.status as ArticleStatus) && userData?.role !== 'Admin');
    
    return (
        <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6">
                <div className="bg-brand-surface p-8 rounded-lg shadow-md">
                     <div className="flex justify-between items-start mb-2">
                        <h1 className="text-3xl font-bold text-brand-text-primary">{isNewArticle ? 'Create Article' : 'Edit Article'}</h1>
                        {article.status && <Badge status={article.status} />}
                    </div>

                    {error && <p className="bg-red-100 text-red-700 p-3 rounded my-4 text-center">{error}</p>}
                    {successMessage && <p className="bg-green-100 text-green-700 p-3 rounded my-4 text-center">{successMessage}</p>}

                    {/* Core Details Section (mostly for Admins) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label htmlFor="title" className="block text-sm font-medium text-brand-text-secondary mb-1">Title</label>
                            <input id="title" type="text" value={article.title} onChange={e => setArticle(p => ({...p, title: e.target.value}))} disabled={!canEditCore} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100" />
                        </div>
                        <div>
                            <label htmlFor="articleType" className="block text-sm font-medium text-brand-text-secondary mb-1">Article Type</label>
                            <select id="articleType" value={article.articleType} onChange={e => setArticle(p => ({...p, articleType: e.target.value as ArticleType}))} disabled={!canEditCore} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100">
                                {ARTICLE_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="region" className="block text-sm font-medium text-brand-text-secondary mb-1">Region</label>
                            <select id="region" value={article.region} onChange={e => setArticle(p => ({...p, region: e.target.value}))} disabled={!canEditCore} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100">
                                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-sm font-medium text-brand-text-secondary mb-2">Categories</label>
                             <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {CATEGORIES.map(category => (
                                    <div key={category} className="flex items-center">
                                    <input id={`cat-${category}`} type="checkbox" checked={article.categories?.includes(category)} onChange={() => handleCategoryChange(category)} disabled={!canEditCore} className="h-4 w-4 text-brand-primary focus:ring-brand-primary border-gray-300 rounded disabled:bg-gray-100" />
                                    <label htmlFor={`cat-${category}`} className="ml-2 text-sm text-brand-text-primary">{category}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="shortDescription" className="block text-sm font-medium text-brand-text-secondary mb-1">Short Description (Internal)</label>
                            <textarea id="shortDescription" value={article.shortDescription} onChange={e => setArticle(p => ({...p, shortDescription: e.target.value}))} disabled={!canEditCore} rows={2} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100" />
                        </div>
                    </div>
                    
                    {/* Save Draft Button for Admins */}
                    {canEditCore && (
                        <div className="text-right mb-6">
                            <button onClick={() => handleSave()} disabled={isSaving} className="bg-brand-secondary text-white py-2 px-5 rounded-md hover:bg-emerald-600 disabled:bg-emerald-300 transition">
                                {isSaving ? 'Saving...' : 'Save Draft Details'}
                            </button>
                        </div>
                    )}
                    
                    {/* Content Section (Editable by Admins/Experts) */}
                    {!isNewArticle && (
                    <div className="space-y-6">
                        {article.status === ArticleStatusEnum.GenerationFailed && userData?.role === 'Admin' && (
                            <div className="p-4 bg-pink-100 border-l-4 border-pink-500 text-pink-800 rounded-r-lg">
                                <div className="flex justify-between items-center gap-4">
                                    <div>
                                        <h4 className="font-bold">Automatic Generation Failed</h4>
                                        <p>{article.adminRevisionNotes || 'An unknown error occurred. You can try regenerating the content now.'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button onClick={handleRegenerate} disabled={isRegenerating} className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-purple-300 transition text-sm">
                                            {isRegenerating ? 'Queueing...' : 'Queue for Regeneration'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {article.status === ArticleStatusEnum.NeedsRevision && (
                            <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded-r-lg">
                                <div>
                                    <h4 className="font-bold">Revision Notes from Admin</h4>
                                    <p>{article.adminRevisionNotes || 'No specific notes provided.'}</p>
                                </div>
                            </div>
                        )}
                        <div>
                            <label htmlFor="flashContent" className="block text-sm font-bold text-brand-text-secondary mb-1">Lumina Flash (Summary)</label>
                            <textarea id="flashContent" value={article.flashContent || ''} onChange={e => setArticle(p => ({ ...p, flashContent: e.target.value }))} disabled={!canEditContent} rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100" />
                        </div>
                        {article.articleType === 'Misinformation' && (
                            <div>
                                <label className="block text-sm font-bold text-brand-text-secondary mb-1">Deep Dive (Full Article)</label>
                                <ReactQuill theme="snow" value={article.deepDiveContent || ''} onChange={value => setArticle(p => ({ ...p, deepDiveContent: value }))} readOnly={!canEditContent} modules={quillModules} />
                            </div>
                        )}
                         {/* Action Buttons */}
                        <div className="pt-6 border-t mt-6 flex flex-wrap gap-4 justify-end items-center">
                            {canEditContent && (
                                <button onClick={() => handleSave(article.status)} disabled={isSaving} className="bg-brand-primary text-white py-2 px-5 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                                    {isSaving ? 'Saving...' : 'Save Content Changes'}
                                </button>
                            )}

                             {/* Expert Actions */}
                            {userData?.role === 'Expert' && [ArticleStatusEnum.AwaitingExpertReview, ArticleStatusEnum.NeedsRevision].includes(article.status as ArticleStatus) && (
                                <button onClick={handleSubmitForReview} className="bg-brand-secondary text-white font-bold py-2 px-5 rounded-md hover:bg-emerald-600">
                                    Submit for Admin Review
                                </button>
                            )}

                            {/* Admin Actions */}
                             {userData?.role === 'Admin' && (
                                <>
                                {article.status === ArticleStatusEnum.Draft && article.articleType === 'Trending Topic' && (
                                    <div className="flex items-center gap-2">
                                        <select value={selectedExpertId} onChange={e => setSelectedExpertId(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary">
                                            <option value="">Assign to Expert...</option>
                                            {experts.map(e => <option key={e.uid} value={e.uid}>{e.displayName}</option>)}
                                        </select>
                                        <button onClick={handleSubmitForReview} disabled={!selectedExpertId} className="bg-brand-secondary text-white font-bold py-2 px-5 rounded-md hover:bg-emerald-600 disabled:bg-emerald-300">
                                            Send to Expert
                                        </button>
                                    </div>
                                )}

                                {article.status === ArticleStatusEnum.AwaitingAdminReview && (
                                    <div className="flex items-center gap-4">
                                        <button onClick={handlePublish} className="bg-green-600 text-white font-bold py-2 px-5 rounded-md hover:bg-green-700">
                                            Publish Article
                                        </button>
                                        <button onClick={() => (document.getElementById('revision-modal') as HTMLDialogElement)?.showModal()} className="bg-yellow-500 text-white font-bold py-2 px-5 rounded-md hover:bg-yellow-600">
                                            Request Revision
                                        </button>
                                    </div>
                                )}
                                </>
                            )}

                             {userData?.role === 'Admin' && !isNewArticle && (
                                <button onClick={() => setDeleteModalOpen(true)} disabled={isDeleting} className="bg-red-600 text-white py-2 px-5 rounded-md hover:bg-red-700 disabled:bg-red-300">
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                </button>
                            )}
                        </div>
                    </div>
                    )}
                </div>
            </main>
            
            {/* Revision Notes Modal (for Admin) */}
            <dialog id="revision-modal" className="modal">
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Request Revision</h3>
                    <p className="py-4">Please provide clear notes for the expert on what needs to be changed.</p>
                    <textarea value={article.adminRevisionNotes || ''} onChange={e => setArticle(p => ({ ...p, adminRevisionNotes: e.target.value }))} className="w-full textarea textarea-bordered" rows={4}></textarea>
                    <div className="modal-action">
                    <form method="dialog" className="flex gap-4">
                        <button className="btn">Cancel</button>
                        <button onClick={() => handleSave(ArticleStatusEnum.NeedsRevision)} className="btn btn-warning">Send Revision Request</button>
                    </form>
                    </div>
                </div>
            </dialog>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Deletion">
                <p>Are you sure you want to permanently delete this article? This action cannot be undone.</p>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">{isDeleting ? 'Deleting...' : 'Confirm Delete'}</button>
                </div>
            </Modal>
        </div>
    );
};

const ExpertManagementPage: React.FC = () => {
    const { userData } = useAuth();
    const [experts, setExperts] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setModalOpen] = useState(false);
    const [newExpertEmail, setNewExpertEmail] = useState('');
    const [newExpertName, setNewExpertName] = useState('');
    
    const fetchExperts = useCallback(async () => {
        setLoading(true);
        const expertsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'Expert')
        );
        const snapshot = await getDocs(expertsQuery);
        setExperts(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
        setLoading(false);
    }, []);

    useEffect(() => {
        if (userData?.role === 'Admin') {
            fetchExperts();
        }
    }, [userData, fetchExperts]);
    
    const handleInviteExpert = async (e: React.FormEvent) => {
        e.preventDefault();
        // Firebase Cloud Function would handle the actual user creation and email invitation
        // For now, this is a placeholder for the UI
        console.log(`Inviting expert: ${newExpertName} <${newExpertEmail}>`);
        // In a real app, call a cloud function:
        // const inviteFunction = firebase.functions().httpsCallable('inviteExpert');
        // await inviteFunction({ email: newExpertEmail, displayName: newExpertName });
        setNewExpertEmail('');
        setNewExpertName('');
        setModalOpen(false);
        // fetchExperts(); // Refresh list
        alert("In a real application, a Cloud Function would process this invitation.");
    };

    const toggleExpertStatus = async (expert: UserProfile) => {
        const newStatus = expert.status === 'active' ? 'disabled' : 'active';
        const expertDocRef = doc(db, 'users', expert.uid);
        await updateDoc(expertDocRef, { status: newStatus });
        fetchExperts(); // Refresh list
    };


    if (!userData || userData.role !== 'Admin') return <Navigate to="/dashboard" />;

    return (
        <div className="bg-brand-background min-h-screen">
            <Header />
            <main className="container mx-auto p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-brand-text-primary">Manage Experts</h1>
                    <button onClick={() => setModalOpen(true)} className="bg-brand-primary text-white py-2 px-4 rounded-md hover:bg-indigo-700">
                        Invite New Expert
                    </button>
                </div>
                 {loading ? <Spinner /> : (
                    <div className="bg-brand-surface shadow-md rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {experts.map(expert => (
                                    <tr key={expert.uid}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{expert.displayName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expert.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><Badge status={expert.status} /></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button onClick={() => toggleExpertStatus(expert)} className={`px-3 py-1 rounded-full text-xs ${expert.status === 'active' ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                                                {expert.status === 'active' ? 'Disable' : 'Enable'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
            <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Invite New Expert">
                <form onSubmit={handleInviteExpert}>
                    <div className="mb-4">
                        <label htmlFor="expert-name" className="block text-sm font-medium text-brand-text-secondary mb-1">Full Name</label>
                        <input id="expert-name" type="text" value={newExpertName} onChange={(e) => setNewExpertName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary" required />
                    </div>
                     <div className="mb-6">
                        <label htmlFor="expert-email" className="block text-sm font-medium text-brand-text-secondary mb-1">Email</label>
                        <input id="expert-email" type="email" value={newExpertEmail} onChange={(e) => setNewExpertEmail(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary" required />
                    </div>
                    <button type="submit" className="w-full bg-brand-primary text-white py-2 px-4 rounded-md hover:bg-indigo-700">Send Invitation</button>
                </form>
            </Modal>
        </div>
    );
};


// --- Main App Router ---
const App: React.FC = () => {
  return (
    <AuthProvider>
        <AppRouter />
    </AuthProvider>
  );
};

const AppRouter: React.FC = () => {
    const { user, userData, loading } = useAuth();
    
    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center"><Spinner /></div>;
    }

    return (
        <HashRouter>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/feed" element={<ArticleFeedPage />} />
                <Route path="/view/:id" element={<PublicArticleView />} />
                
                {/* Auth Route */}
                <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
                
                {/* Protected Routes */}
                <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/login" />} />
                <Route path="/profile" element={user ? <UserProfilePage /> : <Navigate to="/login" />} />
                <Route path="/my-tasks" element={user ? <TaskListPage mode="my-tasks" /> : <Navigate to="/login" />} />
                <Route path="/edit/:id" element={user ? <ArticleEditorPage /> : <Navigate to="/login" />} />
                <Route path="/create" element={user && userData?.role === 'Admin' ? <ArticleEditorPage /> : <Navigate to="/dashboard" />} />
                <Route path="/articles" element={user && userData?.role === 'Admin' ? <ArticleListPage /> : <Navigate to="/dashboard" />} />
                <Route path="/admin-review" element={user && userData?.role === 'Admin' ? <TaskListPage mode="admin-review" /> : <Navigate to="/dashboard" />} />
                <Route path="/experts" element={user && userData?.role === 'Admin' ? <ExpertManagementPage /> : <Navigate to="/dashboard" />} />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </HashRouter>
    );
};

export default App;
