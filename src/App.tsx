import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { 
  HashRouter, 
  Routes, 
  Route, 
  Link, 
  useNavigate, 
  useParams, 
  Navigate 
} from 'react-router-dom';
import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  User as FirebaseUser,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  addDoc,
  setDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import type { UserProfile, Article, ArticleStatus } from './types';
import { ArticleStatus as ArticleStatusEnum } from './types';


// --- Firebase Configuration ---
// Securely load configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};


// --- Firebase Initialization ---
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- App-wide Constants ---
const CATEGORIES = [
  'Science & Technology',
  'Health & Wellness',
  'History & Culture',
  'Politics & Society',
  'Digital & Media Literacy',
  'Business & Finance',
  'Environment & Sustainability',
  'Education & Learning',
  'Arts, Media & Creativity'
];


// --- Authentication Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserProfile | null;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });
const useAuth = () => useContext(AuthContext);

const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
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
          // User exists in Auth but not Firestore, log them out.
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

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-brand-text-primary">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// --- Page & Feature Components ---

const Header: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <header className="bg-brand-surface shadow-md sticky top-0 z-40">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-brand-primary">
          Lumina Portal
        </Link>
        {userData && (
          <nav className="flex items-center space-x-4">
             {userData.role === 'Admin' && (
              <Link to="/experts" className="text-brand-text-secondary hover:text-brand-primary font-medium">Manage Experts</Link>
            )}
            <span className="text-brand-text-secondary">
              Welcome, <Link to="/profile" className="font-semibold text-brand-primary hover:underline">{userData.displayName}</Link> ({userData.role})
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
            >
              Logout
            </button>
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
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };
  
  const handlePasswordReset = async () => {
      if(!resetEmail) {
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
      <div className="max-w-md w-full bg-brand-surface p-8 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold text-center text-brand-primary mb-2">Lumina Portal Login</h1>
        <p className="text-center text-brand-text-secondary mb-8">Access for Experts & Admins</p>
        <form onSubmit={handleLogin}>
          {error && <p className="bg-red-100 text-red-700 p-3 rounded-md mb-4">{error}</p>}
          <div className="mb-4">
            <label className="block text-brand-text-secondary mb-2" htmlFor="email">Email</label>
            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary" required />
          </div>
          <div className="mb-6">
            <label className="block text-brand-text-secondary mb-2" htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary" required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-brand-primary text-white py-3 rounded-md hover:bg-indigo-700 transition disabled:bg-indigo-300">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
         <div className="text-center mt-4">
            <button onClick={() => { setResetModalOpen(true); setResetMessage(''); setResetEmail(''); }} className="text-sm text-brand-primary hover:underline">
                Forgot Password?
            </button>
        </div>
      </div>
      <Modal isOpen={isResetModalOpen} onClose={() => setResetModalOpen(false)} title="Reset Password">
          <p className="mb-4 text-brand-text-secondary">Enter your account's email address and we will send you a link to reset your password.</p>
          {resetMessage && <p className={`p-3 rounded-md mb-4 ${resetMessage.startsWith('Success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{resetMessage}</p>}
          <input type="email" placeholder="Email Address" value={resetEmail} onChange={e => setResetEmail(e.target.value)} className="w-full px-4 py-2 border rounded-md mb-4" />
          <button onClick={handlePasswordReset} className="w-full bg-brand-accent text-white py-2 rounded-md hover:bg-amber-600">Send Reset Link</button>
      </Modal>
    </div>
  );
};

const DashboardPage: React.FC = () => {
    const { userData } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState('');

    const fetchArticles = useCallback(async () => {
        if (!userData) return;
        setLoading(true);
        let articlesQuery;

        if (userData.role === 'Admin') {
            articlesQuery = query(collection(db, 'articles'), where('status', '==', ArticleStatusEnum.AwaitingAdminReview), orderBy('createdAt', 'desc'));
        } else { // Expert
            articlesQuery = query(collection(db, 'articles'), where('status', 'in', [ArticleStatusEnum.AwaitingExpertReview, ArticleStatusEnum.NeedsRevision]), orderBy('createdAt', 'desc'));
        }
        
        const querySnapshot = await getDocs(articlesQuery);
        let fetchedArticles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));

        if (userData.role === 'Expert') {
            fetchedArticles = fetchedArticles.filter(art => {
                // Show unclaimed articles in the expert's categories
                if(art.status === ArticleStatusEnum.AwaitingExpertReview && !art.expertId && userData.categories?.includes(art.category)) {
                    return true;
                }
                // Show articles sent back for revision to this specific expert
                if(art.status === ArticleStatusEnum.NeedsRevision && art.expertId === userData.uid) {
                    return true;
                }
                // Show articles claimed by this expert but not yet submitted
                 if(art.status === ArticleStatusEnum.AwaitingExpertReview && art.expertId === userData.uid) {
                    return true;
                }
                return false;
            });
        }
        
        setArticles(fetchedArticles);
        setLoading(false);
    }, [userData]);

    useEffect(() => {
        fetchArticles();
    }, [fetchArticles]);
    
    const handleCreateDraft = async () => {
        if (!newTitle || !newCategory) return alert("Title and Category are required.");;
        try {
            await addDoc(collection(db, 'articles'), {
                title: newTitle,
                category: newCategory,
                status: ArticleStatusEnum.Draft,
                createdAt: serverTimestamp(),
            });
            setNewTitle('');
            setNewCategory('');
            setCreateModalOpen(false);
            alert('Draft created! The AI will now generate content.');
        } catch (error) {
            console.error("Error creating draft:", error);
            alert('Failed to create draft.');
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-brand-text-primary">{userData?.role} Dashboard</h1>
                {userData?.role === 'Admin' && (
                    <button onClick={() => setCreateModalOpen(true)} className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-indigo-700 transition">
                        + Create New Draft
                    </button>
                )}
            </div>

            {articles.length === 0 ? (
                <p className="text-center text-brand-text-secondary mt-12 text-lg">No articles require your attention at this time.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map(article => (
                        <Link to={`/article/${article.id}`} key={article.id} className="block bg-brand-surface rounded-lg shadow hover:shadow-xl transition-shadow duration-300 p-6">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-xl font-bold text-brand-text-primary pr-2">{article.title}</h2>
                                <Badge status={article.status} />
                            </div>
                            <p className="text-brand-text-secondary mb-4">Category: {article.category}</p>
                            {article.status === ArticleStatusEnum.NeedsRevision && (article.expertId === userData?.uid || userData?.role === 'Admin') && (
                               <p className="text-sm text-red-600 font-semibold">Admin sent this back for revision.</p>
                            )}
                             {article.status === ArticleStatusEnum.AwaitingExpertReview && !article.expertId && (
                                <p className="text-sm text-yellow-600 font-semibold">Ready for expert review.</p>
                            )}
                        </Link>
                    ))}
                </div>
            )}
            
            <Modal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Draft">
                <div className="space-y-4">
                    <input type="text" placeholder="Article Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-4 py-2 border rounded-md">
                        <option value="" disabled>Select a category</option>
                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <button onClick={handleCreateDraft} className="w-full bg-brand-primary text-white py-2 rounded-md hover:bg-indigo-700">Create & Trigger AI</button>
                </div>
            </Modal>
        </div>
    );
};

const ArticleEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { userData } = useAuth();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);
    const [flashContent, setFlashContent] = useState('');
    const [deepDiveContent, setDeepDiveContent] = useState('');
    const [isRevisionModalOpen, setRevisionModalOpen] = useState(false);
    const [revisionNotes, setRevisionNotes] = useState('');

    useEffect(() => {
        if (!id) return;
        const fetchArticle = async () => {
            setLoading(true);
            const docRef = doc(db, 'articles', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as Article;
                setArticle(data);
                setFlashContent(data.flashContent || '');
                setDeepDiveContent(data.deepDiveContent || '');
            } else {
                navigate('/');
            }
            setLoading(false);
        };
        fetchArticle();
    }, [id, navigate]);
    
    const handleUpdate = async (updates: Partial<Article>) => {
        if (!id) return;
        try {
            await updateDoc(doc(db, 'articles', id), updates);
            alert('Article updated successfully!');
            navigate('/');
        } catch(e) {
            console.error(e);
            alert('Failed to update article.');
        }
    };
    
    const handleClaim = () => {
        if (!userData) return;
        const newUpdates = {
            expertId: userData.uid,
            expertDisplayName: userData.displayName,
        };
        updateDoc(doc(db, 'articles', id!), newUpdates);
        setArticle(prev => prev ? {...prev, ...newUpdates} : null);
    };

    const handleApprove = () => {
        handleUpdate({
            status: ArticleStatusEnum.AwaitingAdminReview,
            flashContent,
            deepDiveContent
        });
    };

    const handlePublish = () => {
        handleUpdate({
            status: ArticleStatusEnum.Published,
            publishedAt: serverTimestamp()
        });
    };
    
    const handleSendBack = () => {
        if(!revisionNotes) {
            alert('Please provide revision notes.');
            return;
        }
        handleUpdate({
            status: ArticleStatusEnum.NeedsRevision,
            adminRevisionNotes: revisionNotes
        });
        setRevisionModalOpen(false);
    };

    if (loading) return <Spinner />;
    if (!article || !userData) return null;

    const isExpertOwner = userData.role === 'Expert' && article.expertId === userData.uid;
    const canExpertEdit = isExpertOwner && (article.status === ArticleStatusEnum.AwaitingExpertReview || article.status === ArticleStatusEnum.NeedsRevision);

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="bg-brand-surface p-8 rounded-lg shadow-lg">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-4xl font-extrabold text-brand-text-primary">{article.title}</h1>
                        <p className="text-brand-text-secondary mt-1">Category: {article.category}</p>
                    </div>
                    <Badge status={article.status} />
                </div>

                {article.status === ArticleStatusEnum.NeedsRevision && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
                        <p className="font-bold">Revision Required</p>
                        <p>{article.adminRevisionNotes}</p>
                    </div>
                )}
                
                {article.imageUrl && <img src={article.imageUrl} alt={article.title} className="w-full h-64 object-cover rounded-lg mb-6" />}

                <div className="space-y-6">
                    <div>
                        <h3 className="text-2xl font-bold text-brand-text-primary mb-2">Lumina Flash (Summary)</h3>
                        <textarea value={flashContent} onChange={e => setFlashContent(e.target.value)} readOnly={!canExpertEdit && userData.role !== 'Admin'} className="w-full p-3 border rounded-md h-32 resize-y read-only:bg-gray-100" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-brand-text-primary mb-2">Deep Dive (Full Article)</h3>
                        <textarea value={deepDiveContent} onChange={e => setDeepDiveContent(e.target.value)} readOnly={!canExpertEdit && userData.role !== 'Admin'} className="w-full p-3 border rounded-md h-96 resize-y read-only:bg-gray-100" />
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t flex justify-end space-x-4">
                    {userData.role === 'Expert' && article.status === ArticleStatusEnum.AwaitingExpertReview && !article.expertId && userData.categories?.includes(article.category) &&(
                        <button onClick={handleClaim} className="bg-brand-accent text-white px-6 py-2 rounded-md hover:bg-amber-600 transition">Claim Article</button>
                    )}
                    {canExpertEdit && (
                         <button onClick={handleApprove} className="bg-brand-secondary text-white px-6 py-2 rounded-md hover:bg-emerald-600 transition">Save & Approve for Publication</button>
                    )}
                    {userData.role === 'Admin' && article.status === ArticleStatusEnum.AwaitingAdminReview && (
                        <>
                            <button onClick={() => setRevisionModalOpen(true)} className="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600 transition">Send Back for Revision</button>
                            <button onClick={handlePublish} className="bg-brand-primary text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition">Publish</button>
                        </>
                    )}
                    <button onClick={() => navigate(-1)} className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 transition">Back</button>
                </div>
            </div>
            <Modal isOpen={isRevisionModalOpen} onClose={() => setRevisionModalOpen(false)} title="Send for Revision">
                <p className="mb-4">Please provide clear notes for the expert on what needs to be changed.</p>
                <textarea value={revisionNotes} onChange={e => setRevisionNotes(e.target.value)} className="w-full p-2 border rounded-md h-40" />
                <button onClick={handleSendBack} className="w-full mt-4 bg-yellow-500 text-white py-2 rounded-md hover:bg-yellow-600">Submit Revision Notes</button>
            </Modal>
        </div>
    );
};

const ProfilePage: React.FC = () => {
    const { userData, user } = useAuth();
    const [displayName, setDisplayName] = useState('');
    const [showNameToPublic, setShowNameToPublic] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userData) {
            setDisplayName(userData.displayName);
            setShowNameToPublic(userData.showNameToPublic);
            setLoading(false);
        }
    }, [userData]);

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), { displayName, showNameToPublic });
            alert('Profile updated successfully!');
        } catch (error) {
            console.error("Error updating profile:", error);
            alert('Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };
    
    if (loading) return <Spinner />;
    if (!userData) return null;

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="max-w-2xl mx-auto bg-brand-surface p-8 rounded-lg shadow-lg">
                <h1 className="text-3xl font-bold text-brand-text-primary mb-6">Your Profile</h1>
                <div className="space-y-6">
                    <div>
                        <label className="block text-brand-text-secondary mb-2" htmlFor="displayName">Display Name</label>
                        <input type="text" id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                    </div>
                    {userData?.role === 'Expert' && (
                        <>
                        <div className="flex items-center">
                            <input type="checkbox" id="showName" checked={showNameToPublic} onChange={e => setShowNameToPublic(e.target.checked)} className="h-4 w-4 text-brand-primary rounded" />
                            <label htmlFor="showName" className="ml-2 text-brand-text-primary">Allow my name to be publicly displayed on articles I verify.</label>
                        </div>
                        <div>
                            <h3 className="text-brand-text-secondary mb-2">Your Assigned Categories</h3>
                            <div className="flex flex-wrap gap-2">
                                {userData.categories?.map(cat => <span key={cat} className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-200 text-blue-800">{cat}</span>)}
                            </div>
                        </div>
                        </>
                    )}
                </div>
                <div className="mt-8 flex justify-end">
                    <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-brand-primary text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ExpertManagementPage: React.FC = () => {
    const [experts, setExperts] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingExpert, setEditingExpert] = useState<Partial<UserProfile> | null>(null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchExperts = useCallback(async () => {
        setLoading(true);
        const q = query(collection(db, 'users'), where('role', '==', 'Expert'));
        const querySnapshot = await getDocs(q);
        const fetchedExperts = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setExperts(fetchedExperts);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchExperts();
    }, [fetchExperts]);

    const openAddModal = () => {
        setEditingExpert({ role: 'Expert', status: 'active', categories: [] });
        setModalOpen(true);
    };

    const openEditModal = (expert: UserProfile) => {
        setEditingExpert(expert);
        setModalOpen(true);
    };

    const handleModalClose = () => {
        setModalOpen(false);
        setEditingExpert(null);
    };
    
    const handleSaveChanges = async (expertData: Partial<UserProfile>, password?: string) => {
        if (!expertData.displayName || !expertData.email) {
            alert("Display name and email are required.");
            return;
        }

        setLoading(true);
        try {
            if (expertData.uid) { // Editing existing expert
                const { uid, ...dataToUpdate } = expertData;
                await updateDoc(doc(db, 'users', uid), dataToUpdate);
                alert("Expert updated successfully.");
            } else { // Adding new expert
                if (!password) {
                   alert("Password is required for new experts.");
                   setLoading(false);
                   return;
                }
                // Use a temporary app instance to create the user without signing in the current admin
                const tempApp = initializeApp(firebaseConfig, 'temp-user-creation' + Date.now());
                const tempAuth = getAuth(tempApp);
                const userCredential = await createUserWithEmailAndPassword(tempAuth, expertData.email, password);
                const newUid = userCredential.user.uid;
                
                const newUserProfile: Omit<UserProfile, 'uid'> = {
                    email: expertData.email,
                    displayName: expertData.displayName,
                    role: 'Expert',
                    status: 'active',
                    showNameToPublic: false,
                    categories: expertData.categories || []
                };

                await setDoc(doc(db, 'users', newUid), newUserProfile);
                await signOut(tempAuth);
                await deleteApp(tempApp);
                alert("Expert created successfully.");
            }
            handleModalClose();
            fetchExperts();
        } catch (error: any) {
            console.error("Error saving expert:", error);
            alert(`Failed to save expert: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredExperts = experts.filter(expert => {
        const categoryMatch = categoryFilter === 'all' || (expert.categories && expert.categories.includes(categoryFilter));
        const statusMatch = statusFilter === 'all' || expert.status === statusFilter;
        return categoryMatch && statusMatch;
    });

    if (loading && experts.length === 0) return <Spinner />;

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-brand-text-primary">Manage Experts</h1>
                <button onClick={openAddModal} className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-indigo-700 transition">+ Add Expert</button>
            </div>
             <div className="bg-brand-surface rounded-lg shadow p-4 mb-6 flex items-center space-x-4">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full md:w-auto px-4 py-2 border rounded-md">
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full md:w-auto px-4 py-2 border rounded-md">
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                </select>
            </div>
            <div className="bg-brand-surface rounded-lg shadow-lg overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-4 font-semibold">Name</th>
                            <th className="p-4 font-semibold">Email</th>
                            <th className="p-4 font-semibold">Categories</th>
                            <th className="p-4 font-semibold">Status</th>
                            <th className="p-4 font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredExperts.map(expert => (
                            <tr key={expert.uid} className="border-b">
                                <td className="p-4">{expert.displayName}</td>
                                <td className="p-4">{expert.email}</td>
                                <td className="p-4 flex flex-wrap gap-1 max-w-sm">
                                    {expert.categories?.map(c => <span key={c} className="bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">{c}</span>) || 'N/A'}
                                </td>
                                <td className="p-4"><Badge status={expert.status} /></td>
                                <td className="p-4">
                                    <button onClick={() => openEditModal(expert)} className="text-brand-primary hover:underline">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredExperts.length === 0 && (
                    <p className="text-center p-8 text-brand-text-secondary">No experts match the current filters.</p>
                )}
            </div>

            {editingExpert && (
                <ExpertEditModal 
                    isOpen={isModalOpen} 
                    onClose={handleModalClose} 
                    expert={editingExpert} 
                    onSave={handleSaveChanges} 
                />
            )}
        </div>
    );
};

const ExpertEditModal: React.FC<{ isOpen: boolean; onClose: () => void; expert: Partial<UserProfile>; onSave: (expertData: Partial<UserProfile>, password?: string) => void; }> = ({ isOpen, onClose, expert, onSave }) => {
    const [formData, setFormData] = useState(expert);
    const [password, setPassword] = useState('');

    useEffect(() => {
        setFormData(expert);
    }, [expert]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCategoryChange = (category: string) => {
        const currentCategories = formData.categories || [];
        const isCurrentlySelected = currentCategories.includes(category);
        let newCategories;

        if (isCurrentlySelected) {
            newCategories = currentCategories.filter(c => c !== category);
        } else {
            if (currentCategories.length >= 3) {
                alert('An expert can be assigned a maximum of 3 categories.');
                return; // Prevent adding more than 3
            }
            newCategories = [...currentCategories, category];
        }
        setFormData({ ...formData, categories: newCategories });
    };

    const handleSubmit = () => {
        onSave(formData, password);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={expert.uid ? "Edit Expert" : "Add New Expert"}>
            <div className="space-y-4">
                <input type="text" name="displayName" placeholder="Display Name" value={formData.displayName || ''} onChange={handleChange} className="w-full px-4 py-2 border rounded-md" />
                <input type="email" name="email" placeholder="Email Address" value={formData.email || ''} onChange={handleChange} disabled={!!expert.uid} className="w-full px-4 py-2 border rounded-md disabled:bg-gray-100" />
                {!expert.uid && (
                    <input type="password" placeholder="Set Initial Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                )}
                <div>
                    <h4 className="font-semibold mb-2">Categories (Max 3)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {CATEGORIES.map(cat => (
                            <label key={cat} className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100">
                                <input type="checkbox" checked={formData.categories?.includes(cat)} onChange={() => handleCategoryChange(cat)} />
                                <span className="text-sm">{cat}</span>
                            </label>
                        ))}
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Status</h4>
                    <select name="status" value={formData.status || 'active'} onChange={handleChange} className="w-full px-4 py-2 border rounded-md">
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </div>
                <button onClick={handleSubmit} className="w-full bg-brand-primary text-white py-2 rounded-md hover:bg-indigo-700">Save Changes</button>
            </div>
        </Modal>
    );
};


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) return <Spinner />;
    return user ? <>{children}</> : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { userData, loading } = useAuth();
    if (loading) return <Spinner />;
    return userData?.role === 'Admin' ? <>{children}</> : <Navigate to="/" replace />;
};

// --- Main App Component ---
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const AppContent: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
      return (
        <div className="h-screen w-screen flex items-center justify-center">
            <Spinner />
        </div>
      );
    }
    
    return (
        <HashRouter>
            {user && <Header />}
            <main>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/article/:id" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    <Route path="/experts" element={
                        <ProtectedRoute>
                            <AdminRoute><ExpertManagementPage /></AdminRoute>
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </HashRouter>
    );
};


export default App;