/**
 * KindlePDF - PDF Handler Module
 * Handles PDF loading, text extraction, and navigation using PDF.js
 * With paginated Kindle-style reading experience (no scroll needed)
 */

const PDFHandler = (() => {
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let totalScreenPages = 0; // Virtual pages that fit on screen
    let currentScreenPage = 1;
    let scale = 1.0;
    let readingMode = 'page'; // Default to page mode for no-scroll experience
    let currentBookId = null;
    let extractedText = []; // Array of text per PDF page
    let paginatedContent = []; // Array of content chunks that fit on screen
    let fontSize = 18;
    let lineHeight = 1.8;
    let fontFamily = 'Lora';

    // Initialize PDF.js worker
    function init() {
        // Usar CDN para garantir funcionamento local e online
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Load PDF from ArrayBuffer
    async function loadPDF(arrayBuffer, bookId) {
        currentBookId = bookId;
        extractedText = [];
        paginatedContent = [];
        currentScreenPage = 1;

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;

        return { totalPages };
    }

    // Extract text from all pages
    async function extractAllText() {
        if (!pdfDoc) return [];

        extractedText = [];
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();

            // Process text items to preserve paragraphs
            let pageText = '';
            let lastY = null;

            for (const item of textContent.items) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 12) {
                    // New line detected
                    pageText += '\n';
                }
                pageText += item.str + ' ';
                lastY = item.transform[5];
            }

            // Clean up text
            pageText = pageText
                .replace(/\s+/g, ' ')
                .replace(/\n\s+/g, '\n\n')
                .trim();

            // Only add non-empty pages (skip blank pages)
            if (pageText.length > 10) {
                extractedText.push(pageText);
            }
        }

        return extractedText;
    }

    // Paginate content to fit screen without scrolling
    function paginateContent(container) {
        // Get available height for content (subtract header, toolbar, padding, and page indicator)
        const containerHeight = container.parentElement.clientHeight - 80;
        const containerWidth = Math.min(700, container.parentElement.clientWidth - 100);

        // Calculate approximate characters per page based on font size and container
        const charsPerLine = Math.floor(containerWidth / (fontSize * 0.55));
        const linesPerPage = Math.floor(containerHeight / (fontSize * lineHeight)) - 2; // Reserve 2 lines for safety
        const charsPerPage = charsPerLine * linesPerPage * 0.85; // 85% fill rate

        paginatedContent = [];

        // Combine all text (without separators - continuous text flow)
        let fullText = extractedText.join('\n\n');

        // Split into paragraphs
        const paragraphs = fullText.split('\n\n').filter(p => p.trim());

        // Helper to check if text is a title (mostly uppercase)
        function isTitleText(text) {
            const cleaned = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
            if (cleaned.length < 3) return false;
            const upperCount = (cleaned.match(/[A-ZÀ-Ý]/g) || []).length;
            return upperCount / cleaned.length > 0.7 && text.length < 100;
        }

        let currentPageContent = [];
        let currentCharCount = 0;

        for (const para of paragraphs) {
            const paraLength = para.length;
            const isTitle = isTitleText(para.trim());

            // If this is a title, start a new page (title should be alone or at top)
            if (isTitle && currentPageContent.length > 0) {
                paginatedContent.push(currentPageContent);
                currentPageContent = [];
                currentCharCount = 0;
            }

            // If adding this paragraph exceeds page limit, start new page
            if (currentCharCount + paraLength > charsPerPage && currentPageContent.length > 0) {
                paginatedContent.push(currentPageContent);
                currentPageContent = [];
                currentCharCount = 0;
            }

            // If single paragraph is too long, split it
            if (paraLength > charsPerPage) {
                // Save current content first
                if (currentPageContent.length > 0) {
                    paginatedContent.push(currentPageContent);
                    currentPageContent = [];
                    currentCharCount = 0;
                }

                // Split long paragraph into chunks
                let remaining = para;
                while (remaining.length > 0) {
                    // Find a good break point (end of sentence or word)
                    let breakPoint = Math.min(remaining.length, charsPerPage);
                    if (breakPoint < remaining.length) {
                        // Look for sentence end
                        const sentenceEnd = remaining.lastIndexOf('. ', breakPoint);
                        if (sentenceEnd > charsPerPage * 0.5) {
                            breakPoint = sentenceEnd + 1;
                        } else {
                            // Look for word break
                            const wordBreak = remaining.lastIndexOf(' ', breakPoint);
                            if (wordBreak > charsPerPage * 0.5) {
                                breakPoint = wordBreak;
                            }
                        }
                    }

                    const chunk = remaining.substring(0, breakPoint).trim();
                    if (chunk) {
                        paginatedContent.push([chunk]);
                    }
                    remaining = remaining.substring(breakPoint).trim();
                }
            } else {
                currentPageContent.push(para);
                currentCharCount += paraLength + 50; // Add some for paragraph spacing
            }
        }

        // Don't forget the last page
        if (currentPageContent.length > 0) {
            paginatedContent.push(currentPageContent);
        }

        // Filter out empty pages
        paginatedContent = paginatedContent.filter(page => {
            const content = page.join(' ').trim();
            return content.length > 10;
        });

        totalScreenPages = paginatedContent.length;

        // Ensure current page is valid
        if (currentScreenPage > totalScreenPages) {
            currentScreenPage = totalScreenPages;
        }
        if (currentScreenPage < 1) {
            currentScreenPage = 1;
        }
    }

    // Render text content with Kindle-style formatting
    async function renderTextContent(container) {
        container.innerHTML = '';

        if (extractedText.length === 0) {
            await extractAllText();
        }

        // Always paginate for screen-fit display
        paginateContent(container);

        // Get content for current screen page
        const pageContent = paginatedContent[currentScreenPage - 1] || [];

        const textWrapper = document.createElement('div');
        textWrapper.className = 'kindle-text-wrapper kindle-paginated';
        textWrapper.style.cssText = `
            font-family: '${fontFamily}', Georgia, serif;
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            max-width: 700px;
            margin: 0 auto;
            padding: 20px 50px 10px 50px;
            text-align: justify;
            color: var(--color-text-primary);
            height: calc(100vh - 190px);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        `;

        // Content area for text
        const contentArea = document.createElement('div');
        contentArea.className = 'kindle-content-area';
        contentArea.style.cssText = `
            flex: 1;
            overflow: hidden;
        `;

        // Helper function to detect if text is a title (mostly uppercase)
        function isTitle(text) {
            const cleaned = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
            if (cleaned.length < 3) return false;
            const upperCount = (cleaned.match(/[A-ZÀ-Ý]/g) || []).length;
            return upperCount / cleaned.length > 0.7 && text.length < 100;
        }

        // Add paragraphs to content area
        pageContent.forEach((para, index) => {
            const trimmedPara = para.trim();

            if (isTitle(trimmedPara)) {
                // Format as title/heading
                const h = document.createElement('h2');
                h.style.cssText = `
                    font-family: 'Cormorant Garamond', Georgia, serif;
                    font-size: ${fontSize * 1.4}px;
                    font-weight: 700;
                    text-align: center;
                    margin: 1.2em 0 0.8em 0;
                    letter-spacing: 0.05em;
                    color: var(--color-text-primary);
                    text-transform: uppercase;
                `;
                h.textContent = trimmedPara;
                contentArea.appendChild(h);
            } else {
                // Regular paragraph
                const p = document.createElement('p');
                p.style.cssText = `
                    text-indent: ${index === 0 ? '0' : '2em'};
                    margin-bottom: 0.8em;
                    word-wrap: break-word;
                `;
                p.textContent = trimmedPara;
                contentArea.appendChild(p);
            }
        });

        textWrapper.appendChild(contentArea);

        // Add page number indicator at bottom (fixed position)
        const pageIndicator = document.createElement('div');
        pageIndicator.className = 'kindle-page-indicator';
        pageIndicator.style.cssText = `
            flex-shrink: 0;
            padding-top: 15px;
            margin-top: 10px;
            text-align: center;
            font-family: var(--font-ui);
            font-size: 12px;
            color: var(--color-text-muted);
            border-top: 1px solid var(--color-border);
        `;
        pageIndicator.textContent = `${currentScreenPage} de ${totalScreenPages}`;
        textWrapper.appendChild(pageIndicator);

        container.appendChild(textWrapper);
    }

    // Set font size and re-paginate
    function setFontSize(size) {
        fontSize = Math.max(12, Math.min(32, size));
        paginatedContent = []; // Force re-pagination
        return fontSize;
    }

    // Set line height
    function setLineHeight(height) {
        lineHeight = Math.max(1.2, Math.min(2.5, height));
        paginatedContent = []; // Force re-pagination
        return lineHeight;
    }

    // Set font family
    function setFontFamily(family) {
        fontFamily = family;
        return fontFamily;
    }

    // Navigate to specific screen page
    async function goToPage(pageNum, container) {
        if (pageNum < 1) pageNum = 1;
        if (pageNum > totalScreenPages) pageNum = totalScreenPages;

        currentScreenPage = pageNum;
        await renderTextContent(container);

        // Save progress (map screen page to PDF page approximately)
        if (currentBookId && totalScreenPages > 0) {
            const pdfPage = Math.ceil((currentScreenPage / totalScreenPages) * totalPages);
            currentPage = pdfPage;
            Storage.updateBookProgress(currentBookId, pdfPage).catch(() => { });
        }
    }

    function nextPage(container) {
        if (currentScreenPage < totalScreenPages) {
            goToPage(currentScreenPage + 1, container);
        }
    }

    function prevPage(container) {
        if (currentScreenPage > 1) {
            goToPage(currentScreenPage - 1, container);
        }
    }

    // Set reading mode
    async function setReadingMode(mode, container) {
        readingMode = mode;
        paginatedContent = []; // Force re-pagination
        currentScreenPage = 1;
        await renderTextContent(container);
    }

    // Generate cover image from first page
    async function generateCover(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    // Update current page based on scroll position (not used in paginated mode)
    function updateCurrentPageFromScroll(container) {
        // In paginated mode, we don't need scroll tracking
    }

    // Getters
    function getCurrentPage() { return currentScreenPage; }
    function getTotalPages() { return totalScreenPages || totalPages; }
    function getScale() { return scale; }
    function getFontSize() { return fontSize; }
    function getLineHeight() { return lineHeight; }
    function getFontFamily() { return fontFamily; }
    function getReadingMode() { return readingMode; }
    function isLoaded() { return pdfDoc !== null; }

    return {
        init,
        loadPDF,
        extractAllText,
        renderTextContent,
        setFontSize,
        setLineHeight,
        setFontFamily,
        goToPage,
        nextPage,
        prevPage,
        setReadingMode,
        generateCover,
        updateCurrentPageFromScroll,
        getCurrentPage,
        getTotalPages,
        getScale,
        getFontSize,
        getLineHeight,
        getFontFamily,
        getReadingMode,
        isLoaded
    };
})();
