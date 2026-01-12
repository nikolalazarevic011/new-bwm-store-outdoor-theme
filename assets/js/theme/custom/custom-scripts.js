import epicSearch from './epic-search';

export default function customScripts(context) {
    if(context.themeSettings['epic-toggle-search']) epicSearch();

    searchFix();
};

export function searchFix() {
    // hide quick search results when clicked outside of quick search
    $(window).on('click', () => {
        $('.quickSearch .quickSearchResults, .header-search .quickSearchResults').hide();
    });

    $('.quickSearch, .header-search').on('click', '.modal-close', () => {
        $('.quickSearch .quickSearchResults, .header-search .quickSearchResults').hide();
    });

    $('.quickSearch, .header-search').on('click', (event) => {
        event.stopPropagation();
    });

    // show quick search results when focused in search input
    $('.quickSearch input, .header-search input').on('focusin', () => {
        $('.quickSearch .quickSearchResults, .header-search .quickSearchResults').show();
    });
};
