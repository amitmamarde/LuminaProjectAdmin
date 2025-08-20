import {
    doc,
    updateDoc,
    serverTimestamp,
    addDoc,
    deleteDoc,
    collection,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Article } from '../types';

/**
 * Saves an article to Firestore, either creating a new one or updating an existing one.
 * @param id The ID of the article to update, or undefined to create a new one.
 * @param dataToSave The partial article data to save.
 * @returns The ID of the saved article.
 */
export const saveArticle = async (id: string | undefined, dataToSave: Partial<Article>): Promise<string> => {
    if (id) {
        const docRef = doc(db, 'articles', id);
        await updateDoc(docRef, { ...dataToSave, updatedAt: serverTimestamp() });
        return id;
    } else {
        const dataWithTimestamp = { ...dataToSave, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        const docRef = await addDoc(collection(db, 'articles'), dataWithTimestamp);
        return docRef.id;
    }
};

export const deleteArticle = async (id: string): Promise<void> => {
    const docRef = doc(db, 'articles', id);
    await deleteDoc(docRef);
};