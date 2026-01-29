/**
 * KindlePDF - Main Application
 * Orchestrates all modules and handles UI interactions
 */

const App = (() => {
    // DOM Elements
    const elements = {};
    let currentBook = null;

    // Initialize application
    async function init() {
        cacheElements();
        await Storage.init();
        await Themes.init();
        PDFHandler.init();
        setupEventListeners();
        await loadLibrary();
    }

    function cacheElements() {
        elements.libraryView = document.getElementById('library-view');
        elements.readerView = document.getElementById('reader-view');
        elements.bookGrid = document.getElementById('book-grid');
        elements.emptyLibrary = document.getElementById('empty-library');
        elements.pdfUpload = document.getElementById('pdf-upload');
        elements.pdfUploadEmpty = document.getElementById('pdf-upload-empty');
        elements.dropZone = document.getElementById('drop-zone');
        elements.loadingOverlay = document.getElementById('loading-overlay');

        // Reader elements
        elements.bookTitle = document.getElementById('book-title');
        elements.pageIndicator = document.getElementById('page-indicator');
        elements.pdfContainer = document.getElementById('pdf-container');
        elements.pdfPages = document.getElementById('pdf-pages');
        elements.progressBar = document.getElementById('progress-bar');
        elements.zoomSlider = document.getElementById('zoom-slider');
        elements.zoomValue = document.getElementById('zoom-value');

        // Sidebar & Modal
        elements.sidebar = document.getElementById('sidebar');
        elements.bookmarksList = document.getElementById('bookmarks-list');
        elements.notesList = document.getElementById('notes-list');
        elements.noteModal = document.getElementById('note-modal');
        elements.noteText = document.getElementById('note-text');
        elements.notePageNum = document.getElementById('note-page-num');
    }

    function setupEventListeners() {
        // File upload
        elements.pdfUpload.addEventListener('change', handleFileUpload);
        elements.pdfUploadEmpty.addEventListener('change', handleFileUpload);

        // Drag and drop
        elements.dropZone.addEventListener('dragover', handleDragOver);
        elements.dropZone.addEventListener('dragleave', handleDragLeave);
        elements.dropZone.addEventListener('drop', handleDrop);

        // Theme toggles
        document.getElementById('theme-toggle-library').addEventListener('click', () => Themes.cycleTheme());
        document.getElementById('theme-toggle-reader').addEventListener('click', () => Themes.cycleTheme());

        // Navigation
        document.getElementById('back-to-library').addEventListener('click', backToLibrary);
        document.getElementById('prev-page').addEventListener('click', () => {
            PDFHandler.prevPage(elements.pdfPages);
            updatePageIndicator();
        });
        document.getElementById('next-page').addEventListener('click', () => {
            PDFHandler.nextPage(elements.pdfPages);
            updatePageIndicator();
        });

        // Reading modes
        document.getElementById('reading-mode-scroll').addEventListener('click', () => setReadingMode('scroll'));
        document.getElementById('reading-mode-page').addEventListener('click', () => setReadingMode('page'));

        // Font size controls (was zoom)
        document.getElementById('zoom-in').addEventListener('click', () => adjustFontSize(2));
        document.getElementById('zoom-out').addEventListener('click', () => adjustFontSize(-2));
        elements.zoomSlider.addEventListener('input', handleFontSlider);
        document.getElementById('fit-width').addEventListener('click', resetFontSize);

        // Sidebar
        document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
        document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Bookmarks & Notes
        document.getElementById('add-bookmark').addEventListener('click', addBookmark);
        document.getElementById('add-note-btn').addEventListener('click', openNoteModal);
        document.getElementById('close-note-modal').addEventListener('click', closeNoteModal);
        document.getElementById('cancel-note').addEventListener('click', closeNoteModal);
        document.getElementById('save-note').addEventListener('click', saveNote);

        // Fullscreen
        document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

        // Scroll tracking
        elements.pdfContainer.addEventListener('scroll', handleScroll);

        // Keyboard navigation
        document.addEventListener('keydown', handleKeyboard);
    }

    // ==========================================
    // Library Functions
    // ==========================================

    async function loadLibrary() {
        const books = await Storage.getAllBooks();
        renderLibrary(books);
    }

    function renderLibrary(books) {
        elements.bookGrid.innerHTML = '';

        if (books.length === 0) {
            elements.emptyLibrary.classList.remove('hidden');
            return;
        }

        elements.emptyLibrary.classList.add('hidden');

        books.forEach(book => {
            const card = createBookCard(book);
            elements.bookGrid.appendChild(card);
        });
    }

    function createBookCard(book) {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.dataset.id = book.id;

        const progress = book.totalPages > 0 ? (book.currentPage / book.totalPages) * 100 : 0;

        card.innerHTML = `
            <div class="book-cover">
                ${book.coverImage
                ? `<img src="${book.coverImage}" alt="${book.title}">`
                : `<div class="book-cover-placeholder">
                        <span class="book-emoji">📖</span>
                        <span class="book-name">${book.title}</span>
                       </div>`
            }
                <button class="book-delete" title="Remover livro">×</button>
            </div>
            <div class="book-info">
                <h4>${book.title}</h4>
                <p>${book.totalPages} páginas</p>
                <div class="book-progress">
                    <div class="book-progress-bar" style="width: ${progress}%"></div>
                </div>
            </div>
        `;

        card.querySelector('.book-cover').addEventListener('click', (e) => {
            if (!e.target.classList.contains('book-delete')) {
                openBook(book.id);
            }
        });

        card.querySelector('.book-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBook(book.id);
        });

        return card;
    }

    // ==========================================
    // File Handling
    // ==========================================

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) await processFile(file);
        e.target.value = '';
    }

    function handleDragOver(e) {
        e.preventDefault();
        elements.dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
    }

    async function handleDrop(e) {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file?.type === 'application/pdf') {
            await processFile(file);
        }
    }

    async function processFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Por favor, selecione um arquivo PDF.');
            return;
        }

        showLoading();

        try {
            console.log('Step 1: Reading file as ArrayBuffer...');
            const arrayBuffer = await file.arrayBuffer();
            console.log('Step 1 OK: ArrayBuffer size:', arrayBuffer.byteLength);

            // Create copies of the ArrayBuffer to prevent detachment issues
            const bufferForCover = arrayBuffer.slice(0);
            const bufferForLoad = arrayBuffer.slice(0);
            const bufferForStorage = arrayBuffer.slice(0);

            console.log('Step 2: Generating cover image...');
            const coverImage = await PDFHandler.generateCover(bufferForCover);
            console.log('Step 2 OK: Cover generated');

            console.log('Step 3: Loading PDF to get total pages...');
            const { totalPages } = await PDFHandler.loadPDF(bufferForLoad, null);
            console.log('Step 3 OK: Total pages:', totalPages);

            const title = file.name.replace('.pdf', '');
            console.log('Step 4: Saving book to storage...');

            const book = await Storage.saveBook({
                title,
                data: bufferForStorage,
                totalPages,
                coverImage
            });
            console.log('Step 4 OK: Book saved with ID:', book.id);

            hideLoading();
            await loadLibrary();
            openBook(book.id);
        } catch (error) {
            hideLoading();
            console.error('Error processing PDF:', error);
            console.error('Error stack:', error.stack);
            alert(`Erro ao processar o PDF: ${error.message || error}`);
        }
    }

    // ==========================================
    // Reader Functions
    // ==========================================

    async function openBook(bookId) {
        showLoading();

        try {
            const book = await Storage.getBook(bookId);
            if (!book) throw new Error('Book not found');

            currentBook = book;

            await PDFHandler.loadPDF(book.data, book.id);
            elements.bookTitle.textContent = book.title;

            elements.pdfContainer.className = 'pdf-container page-mode';
            await PDFHandler.setReadingMode('page', elements.pdfPages);

            if (book.currentPage > 1) {
                setTimeout(() => PDFHandler.goToPage(book.currentPage, elements.pdfPages), 100);
            }

            updatePageIndicator();
            updateZoomDisplay();
            await loadBookmarksAndNotes();

            switchView('reader');
            hideLoading();
        } catch (error) {
            hideLoading();
            console.error('Error opening book:', error);
            alert('Erro ao abrir o livro.');
        }
    }

    function backToLibrary() {
        switchView('library');
        currentBook = null;
        elements.pdfPages.innerHTML = '';
        closeSidebar();
    }

    async function deleteBook(bookId) {
        if (confirm('Tem certeza que deseja remover este livro?')) {
            await Storage.deleteBook(bookId);
            await loadLibrary();
        }
    }

    // ==========================================
    // Reading Mode & Zoom
    // ==========================================

    async function setReadingMode(mode) {
        const scrollBtn = document.getElementById('reading-mode-scroll');
        const pageBtn = document.getElementById('reading-mode-page');

        scrollBtn.classList.toggle('active', mode === 'scroll');
        pageBtn.classList.toggle('active', mode === 'page');
        elements.pdfContainer.className = `pdf-container ${mode}-mode`;

        await PDFHandler.setReadingMode(mode, elements.pdfPages);
        updatePageIndicator();
    }


    async function adjustFontSize(delta) {
        const newSize = PDFHandler.getFontSize() + delta;
        PDFHandler.setFontSize(newSize);
        await PDFHandler.renderTextContent(elements.pdfPages);
        updateFontDisplay();
    }

    async function handleFontSlider() {
        const size = parseInt(elements.zoomSlider.value);
        PDFHandler.setFontSize(size);
        await PDFHandler.renderTextContent(elements.pdfPages);
        updateFontDisplay();
    }

    async function resetFontSize() {
        PDFHandler.setFontSize(18);
        await PDFHandler.renderTextContent(elements.pdfPages);
        updateFontDisplay();
    }

    function updateFontDisplay() {
        const size = PDFHandler.getFontSize();
        elements.zoomSlider.value = size;
        elements.zoomSlider.min = 12;
        elements.zoomSlider.max = 32;
        elements.zoomValue.textContent = `${size}px`;
    }

    function updateZoomDisplay() {
        updateFontDisplay();
    }

    // ==========================================
    // Page Navigation & Progress
    // ==========================================

    function updatePageIndicator() {
        const current = PDFHandler.getCurrentPage();
        const total = PDFHandler.getTotalPages();
        elements.pageIndicator.textContent = `${current} / ${total}`;
        elements.progressBar.style.width = `${(current / total) * 100}%`;
    }

    function handleScroll() {
        PDFHandler.updateCurrentPageFromScroll(elements.pdfContainer);
        updatePageIndicator();
    }

    function handleKeyboard(e) {
        if (!PDFHandler.isLoaded()) return;

        switch (e.key) {
            case 'ArrowRight':
            case 'PageDown':
                PDFHandler.nextPage(elements.pdfPages);
                updatePageIndicator();
                break;
            case 'ArrowLeft':
            case 'PageUp':
                PDFHandler.prevPage(elements.pdfPages);
                updatePageIndicator();
                break;
        }
    }

    // ==========================================
    // Sidebar, Bookmarks & Notes
    // ==========================================

    function toggleSidebar() {
        elements.sidebar.classList.toggle('open');
    }

    function closeSidebar() {
        elements.sidebar.classList.remove('open');
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}-list`);
        });
    }

    async function loadBookmarksAndNotes() {
        if (!currentBook) return;

        const bookmarks = await Storage.getBookmarks(currentBook.id);
        const notes = await Storage.getNotes(currentBook.id);

        renderBookmarks(bookmarks);
        renderNotes(notes);
    }

    function renderBookmarks(bookmarks) {
        if (bookmarks.length === 0) {
            elements.bookmarksList.innerHTML = `
                <div class="empty-sidebar">
                    <p>Nenhum marcador ainda</p>
                    <small>Clique em "Marcar" para adicionar</small>
                </div>`;
            return;
        }

        elements.bookmarksList.innerHTML = bookmarks.map(bm => `
            <div class="bookmark-item" data-id="${bm.id}" data-page="${bm.page}" data-snippet="${(bm.contentSnippet || '').replace(/"/g, '&quot;')}">
                <span class="bookmark-icon">🔖</span>
                <div class="bookmark-info">
                    <span class="bookmark-page">Página ${bm.page}</span>
                    <span class="bookmark-date">${formatDate(bm.createdAt)}</span>
                </div>
                <button class="item-delete">×</button>
            </div>
        `).join('');

        elements.bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('item-delete')) {
                    const snippet = item.dataset.snippet;
                    let targetPage = parseInt(item.dataset.page);

                    if (snippet) {
                        const foundPage = PDFHandler.findPageForContent(snippet);
                        if (foundPage !== -1) targetPage = foundPage;
                    }

                    PDFHandler.goToPage(targetPage, elements.pdfPages);
                    updatePageIndicator();
                }
            });
            item.querySelector('.item-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await Storage.deleteBookmark(item.dataset.id);
                await loadBookmarksAndNotes();
            });
        });
    }

    function renderNotes(notes) {
        if (notes.length === 0) {
            elements.notesList.innerHTML = `
                <div class="empty-sidebar">
                    <p>Nenhuma nota ainda</p>
                </div>`;
            return;
        }

        elements.notesList.innerHTML = notes.map(note => `
            <div class="note-item" data-id="${note.id}" data-page="${note.page}" data-snippet="${(note.contentSnippet || '').replace(/"/g, '&quot;')}">
                <span class="note-icon">📝</span>
                <div class="note-info">
                    <span class="note-page">Página ${note.page}</span>
                    <p class="note-text">${note.text}</p>
                    <span class="note-date">${formatDate(note.createdAt)}</span>
                </div>
                <button class="item-delete">×</button>
            </div>
        `).join('');

        elements.notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('item-delete')) {
                    const snippet = item.dataset.snippet;
                    let targetPage = parseInt(item.dataset.page);

                    if (snippet) {
                        const foundPage = PDFHandler.findPageForContent(snippet);
                        if (foundPage !== -1) targetPage = foundPage;
                    }

                    PDFHandler.goToPage(targetPage, elements.pdfPages);
                    updatePageIndicator();
                }
            });
            item.querySelector('.item-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await Storage.deleteNote(item.dataset.id);
                await loadBookmarksAndNotes();
            });
        });
    }

    async function addBookmark() {
        if (!currentBook) return;
        const page = PDFHandler.getCurrentPage();
        const snippet = PDFHandler.getCurrentPageContentSnippet();
        await Storage.addBookmark(currentBook.id, page, snippet);
        await loadBookmarksAndNotes();
        elements.sidebar.classList.add('open');
        switchTab('bookmarks');
    }

    function openNoteModal() {
        elements.notePageNum.textContent = PDFHandler.getCurrentPage();
        elements.noteText.value = '';
        elements.noteModal.classList.add('open');
        elements.noteText.focus();
    }

    function closeNoteModal() {
        elements.noteModal.classList.remove('open');
    }

    async function saveNote() {
        if (!currentBook) return;
        const text = elements.noteText.value.trim();
        if (!text) return;

        const page = PDFHandler.getCurrentPage();
        const snippet = PDFHandler.getCurrentPageContentSnippet();
        await Storage.addNote(currentBook.id, page, text, snippet);
        closeNoteModal();
        await loadBookmarksAndNotes();
        elements.sidebar.classList.add('open');
        switchTab('notes');
    }

    // ==========================================
    // Utilities
    // ==========================================

    function switchView(view) {
        elements.libraryView.classList.toggle('active', view === 'library');
        elements.readerView.classList.toggle('active', view === 'reader');
    }

    function showLoading() {
        elements.loadingOverlay.classList.add('visible');
    }

    function hideLoading() {
        elements.loadingOverlay.classList.remove('visible');
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    return { init };
})();
