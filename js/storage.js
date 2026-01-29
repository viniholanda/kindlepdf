/**
 * KindlePDF - Storage Module
 * Handles IndexedDB operations for library, bookmarks, and notes
 */

const Storage = (() => {
    const DB_NAME = 'KindlePDF';
    const DB_VERSION = 1;
    let db = null;

    // Initialize IndexedDB
    async function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Books store
                if (!database.objectStoreNames.contains('books')) {
                    const booksStore = database.createObjectStore('books', { keyPath: 'id' });
                    booksStore.createIndex('title', 'title', { unique: false });
                    booksStore.createIndex('addedAt', 'addedAt', { unique: false });
                }

                // Bookmarks store
                if (!database.objectStoreNames.contains('bookmarks')) {
                    const bookmarksStore = database.createObjectStore('bookmarks', { keyPath: 'id' });
                    bookmarksStore.createIndex('bookId', 'bookId', { unique: false });
                    bookmarksStore.createIndex('page', 'page', { unique: false });
                }

                // Notes store
                if (!database.objectStoreNames.contains('notes')) {
                    const notesStore = database.createObjectStore('notes', { keyPath: 'id' });
                    notesStore.createIndex('bookId', 'bookId', { unique: false });
                    notesStore.createIndex('page', 'page', { unique: false });
                }

                // Settings store
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // Generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // ==========================================
    // Books Operations
    // ==========================================

    async function saveBook(bookData) {
        const book = {
            id: generateId(),
            title: bookData.title,
            data: bookData.data, // ArrayBuffer of PDF
            totalPages: bookData.totalPages,
            currentPage: 1,
            addedAt: new Date().toISOString(),
            lastReadAt: null,
            coverImage: bookData.coverImage || null
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['books'], 'readwrite');
            const store = transaction.objectStore('books');
            const request = store.add(book);

            request.onsuccess = () => resolve(book);
            request.onerror = () => reject(request.error);
        });
    }

    async function getBook(bookId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['books'], 'readonly');
            const store = transaction.objectStore('books');
            const request = store.get(bookId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllBooks() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['books'], 'readonly');
            const store = transaction.objectStore('books');
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by lastReadAt or addedAt
                const books = request.result.sort((a, b) => {
                    const dateA = a.lastReadAt || a.addedAt;
                    const dateB = b.lastReadAt || b.addedAt;
                    return new Date(dateB) - new Date(dateA);
                });
                resolve(books);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function updateBookProgress(bookId, currentPage) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['books'], 'readwrite');
            const store = transaction.objectStore('books');
            const request = store.get(bookId);

            request.onsuccess = () => {
                const book = request.result;
                if (book) {
                    book.currentPage = currentPage;
                    book.lastReadAt = new Date().toISOString();
                    store.put(book);
                    resolve(book);
                } else {
                    reject(new Error('Book not found'));
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteBook(bookId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['books', 'bookmarks', 'notes'], 'readwrite');
            
            // Delete book
            transaction.objectStore('books').delete(bookId);
            
            // Delete associated bookmarks
            const bookmarksStore = transaction.objectStore('bookmarks');
            const bookmarksIndex = bookmarksStore.index('bookId');
            const bookmarksRequest = bookmarksIndex.openCursor(IDBKeyRange.only(bookId));
            
            bookmarksRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            // Delete associated notes
            const notesStore = transaction.objectStore('notes');
            const notesIndex = notesStore.index('bookId');
            const notesRequest = notesIndex.openCursor(IDBKeyRange.only(bookId));
            
            notesRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // ==========================================
    // Bookmarks Operations
    // ==========================================

    async function addBookmark(bookId, page) {
        const bookmark = {
            id: generateId(),
            bookId: bookId,
            page: page,
            createdAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['bookmarks'], 'readwrite');
            const store = transaction.objectStore('bookmarks');
            const request = store.add(bookmark);

            request.onsuccess = () => resolve(bookmark);
            request.onerror = () => reject(request.error);
        });
    }

    async function getBookmarks(bookId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['bookmarks'], 'readonly');
            const store = transaction.objectStore('bookmarks');
            const index = store.index('bookId');
            const request = index.getAll(IDBKeyRange.only(bookId));

            request.onsuccess = () => {
                const bookmarks = request.result.sort((a, b) => a.page - b.page);
                resolve(bookmarks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteBookmark(bookmarkId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['bookmarks'], 'readwrite');
            const store = transaction.objectStore('bookmarks');
            const request = store.delete(bookmarkId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Notes Operations
    // ==========================================

    async function addNote(bookId, page, text) {
        const note = {
            id: generateId(),
            bookId: bookId,
            page: page,
            text: text,
            createdAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            const request = store.add(note);

            request.onsuccess = () => resolve(note);
            request.onerror = () => reject(request.error);
        });
    }

    async function getNotes(bookId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['notes'], 'readonly');
            const store = transaction.objectStore('notes');
            const index = store.index('bookId');
            const request = index.getAll(IDBKeyRange.only(bookId));

            request.onsuccess = () => {
                const notes = request.result.sort((a, b) => a.page - b.page);
                resolve(notes);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteNote(noteId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            const request = store.delete(noteId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Settings Operations
    // ==========================================

    async function getSetting(key) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    async function setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Public API
    return {
        init,
        saveBook,
        getBook,
        getAllBooks,
        updateBookProgress,
        deleteBook,
        addBookmark,
        getBookmarks,
        deleteBookmark,
        addNote,
        getNotes,
        deleteNote,
        getSetting,
        setSetting
    };
})();
