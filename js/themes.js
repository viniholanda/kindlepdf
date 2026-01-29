/**
 * KindlePDF - Themes Module
 * Handles theme switching and persistence
 */

const Themes = (() => {
    const THEMES = ['light', 'dark', 'sepia'];
    let currentTheme = 'light';

    async function init() {
        try {
            const savedTheme = await Storage.getSetting('theme');
            if (savedTheme && THEMES.includes(savedTheme)) {
                currentTheme = savedTheme;
            } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
                currentTheme = 'dark';
            }
            applyTheme(currentTheme);

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('theme-manual')) {
                    setTheme(e.matches ? 'dark' : 'light');
                }
            });
        } catch (e) {
            applyTheme('light');
        }
    }

    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        currentTheme = theme;
    }

    async function setTheme(theme) {
        if (!THEMES.includes(theme)) return;
        applyTheme(theme);
        localStorage.setItem('theme-manual', 'true');
        try { await Storage.setSetting('theme', theme); } catch (e) { }
    }

    function cycleTheme() {
        const nextIndex = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
        setTheme(THEMES[nextIndex]);
        return THEMES[nextIndex];
    }

    function getCurrentTheme() { return currentTheme; }

    return { init, setTheme, cycleTheme, getCurrentTheme };
})();
