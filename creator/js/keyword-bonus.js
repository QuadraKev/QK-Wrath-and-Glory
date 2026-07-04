// Keyword Bonus - sub-faction keyword lookup and info panel
// Shows the official keyword bonus (short text) and the Abundance of Apocrypha
// homebrew sub-faction bonus for a chosen keyword, wherever keywords are picked.

const KeywordBonus = {
    // Find the keyword-category option matching a chosen keyword value
    findOption(keyword) {
        if (!keyword) return null;
        const categories = DataLoader.getKeywordCategories();
        const kw = String(keyword).toUpperCase();
        for (const [key, cat] of Object.entries(categories)) {
            for (const opt of cat.options || []) {
                if (opt.value === kw) return { categoryKey: key, category: cat, option: opt };
            }
        }
        return null;
    },

    // Render the info panel for a chosen keyword ('' if nothing is catalogued for it)
    renderPanel(keyword) {
        const found = this.findOption(keyword);
        if (!found) return '';
        const { category, option } = found;

        let html = '';
        if (option.bonus) {
            html += `<div class="keyword-bonus-line"><span class="keyword-bonus-label">${category.label} bonus:</span> ${option.bonus}</div>`;
        }
        const ab = option.apocryphaBonus;
        if (ab) {
            html += `
                <div class="keyword-bonus-apocrypha">
                    <div class="keyword-bonus-header">${ab.name ? `${ab.name} ` : ''}<span class="homebrew-tag">Apocrypha homebrew</span></div>
                    <div class="keyword-bonus-effect">${ab.effect}</div>
                    <div class="source-ref">An Abundance of Apocrypha (homebrew), p. ${ab.page}</div>
                </div>`;
        }
        return html ? `<div class="keyword-bonus-panel">${html}</div>` : '';
    }
};
