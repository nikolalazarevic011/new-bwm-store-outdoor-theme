import PageManager from './page-manager';
import API_CONFIG from './api-config';
import { showAlertModal } from './global/modal';

export default class AccountDownloads extends PageManager {
    constructor(context) {
        super(context);
        this.$container = $('[data-downloads-container]');
        this.$loading = $('[data-downloads-loading]');
        this.$error = $('[data-downloads-error]');
        this.$list = $('[data-downloads-list]');
        this.$pagination = $('[data-downloads-pagination]');

        this.currentPage = 1;
        this.perPage = 10;
        this.totalOrders = 0;
        this.customerEmail = this.context.customerEmail || '';

        // Bind event handlers
        this.onPageChange = this.onPageChange.bind(this);
    }

    onReady() {
        console.log('[AccountDownloads] Page Manager initialized');

        // Check if we're on the downloads page by URL (fallback detection)
        const currentUrl = window.location.href;
        const isDownloadsPage = currentUrl.includes('action=downloads') ||
                              currentUrl.includes('/downloads') ||
                              currentUrl.includes('show=downloads');

        console.log('[AccountDownloads] Current URL:', currentUrl);
        console.log('[AccountDownloads] Is downloads page by URL check:', isDownloadsPage);

        // Debug: Log URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        console.log('[AccountDownloads] URL Parameters:', Object.fromEntries(urlParams.entries()));

        // Check if we need to show the downloads container (for orders page integration)
        if (isDownloadsPage && currentUrl.includes('show=downloads')) {
            console.log('[AccountDownloads] Showing downloads container for orders page integration');
            this.$container.show();
        }

        if (!this.$container.length) {
            console.log('[AccountDownloads] No container found - skipping initialization');
            return;
        }

        console.log('[AccountDownloads] Container found - initializing downloads list');

        // Initialize the downloads list
        this.initDownloadsList();
    }

    static load(context) {
        console.log('[AccountDownloads] Static load called with context:', context);

        // Create instance and call onReady
        const instance = new AccountDownloads(context);
        instance.onReady();
    }

    // Fallback initialization - check URL and initialize if needed
    static initFallback() {
        console.log('[AccountDownloads] Fallback initialization called');

        const currentUrl = window.location.href;
        const isDownloadsPage = currentUrl.includes('action=downloads') ||
                              currentUrl.includes('/downloads') ||
                              currentUrl.includes('show=downloads');

        console.log('[AccountDownloads] Fallback - Current URL:', currentUrl);
        console.log('[AccountDownloads] Fallback - Is downloads page:', isDownloadsPage);

        if (isDownloadsPage) {
            console.log('[AccountDownloads] Fallback - Initializing downloads on detected downloads page');

            // Check if we need to hide the orders content and show downloads instead
            if (currentUrl.includes('show=downloads')) {
                console.log('[AccountDownloads] Fallback - Hiding orders content for downloads view');
                // Hide orders content
                $('.account-content').hide();
                // Show loading state in case our container exists
                $('[data-downloads-loading]').show();
            }

            // Get context from window if available
            const context = window.stencilBootstrapContext || {
                customerEmail: window.customerData?.email || '',
                lang: (key, params) => {
                    if (window.langTranslations && window.langTranslations[key]) {
                        return window.langTranslations[key];
                    }
                    return key;
                },
                html_lang: 'en-US'
            };

            console.log('[AccountDownloads] Fallback - Using context:', context);

            // Initialize the downloads
            const instance = new AccountDownloads(context);
            instance.onReady();
        } else {
            console.log('[AccountDownloads] Fallback - Not on downloads page, skipping');
        }
    }

    initDownloadsList() {
        // Show loading state
        this.showLoading();

        // Fetch downloads data
        this.fetchDownloads(this.currentPage, this.perPage);
    }

    showLoading() {
        this.$loading.show();
        this.$error.hide().text('');
        this.$list.empty();
        this.$pagination.hide();
    }

    showError(message) {
        this.$loading.hide();
        this.$error.show().text(message);
        this.$list.empty();
        this.$pagination.hide();
    }

    showContent() {
        this.$loading.hide();
        this.$error.hide();
        this.$list.show();
    }

    async fetchDownloads(page, perPage) {
        try {
            // Get customer email from context or current customer
            let identifier = this.customerEmail;

            // Try to get email from various sources in BigCommerce
            if (!identifier && this.context && this.context.customer) {
                identifier = this.context.customer.email;
            }

            if (!identifier && window.customerData) {
                identifier = window.customerData.email;
            }

            // Try to get from customer object in context
            if (!identifier && this.context.customerEmail) {
                identifier = this.context.customerEmail;
            }

            // Try to get from hidden fields in the DOM
            if (!identifier) {
                const $hiddenEmailField = $('#customer-id-field');
                if ($hiddenEmailField.length && $hiddenEmailField.data('customer-email')) {
                    identifier = $hiddenEmailField.data('customer-email');
                    console.log('[AccountDownloads] Found customer email in hidden field:', identifier);
                }
            }

            // Try to get from any input field with customer email data
            if (!identifier) {
                const $emailField = $('[data-customer-email]');
                if ($emailField.length && $emailField.data('customer-email')) {
                    identifier = $emailField.data('customer-email');
                    console.log('[AccountDownloads] Found customer email in data attribute:', identifier);
                }
            }

            // Debug: Log what we found
            console.log('[AccountDownloads] Customer identifier found:', identifier);

            if (!identifier) {
                console.error('[AccountDownloads] No customer email found in context, window objects, or hidden fields');
                console.log('[AccountDownloads] Context:', this.context);
                console.log('[AccountDownloads] Window customerData:', window.customerData);
                console.log('[AccountDownloads] Hidden field check:', $('#customer-id-field').length ? 'Found' : 'Not found');
                throw new Error('Customer email not found - cannot fetch downloads');
            }

            // Build API URL
            const endpoint = API_CONFIG.ENDPOINTS.CUSTOMER_DOWNLOADS;
            const baseUrl = API_CONFIG.BASE_URL.replace(/\/$/, '');

            const url = `${baseUrl}${endpoint}?identifier=${encodeURIComponent(identifier)}&page=${page}&per_page=${perPage}`;

            console.log('[AccountDownloads] Fetching downloads from:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                credentials: 'omit' // Change from 'include' to 'omit' to avoid CORS issues with wildcard origins
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('[AccountDownloads] API response:', data);

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch downloads');
            }

            // Store pagination info
            this.currentPage = data.pagination.current_page;
            this.perPage = data.pagination.per_page;
            this.totalOrders = data.orders_count;

            // Render downloads
            this.renderDownloads(data.orders_with_links);

            // Render pagination
            this.renderPagination();

        } catch (error) {
            console.error('[AccountDownloads] Error fetching downloads:', error);

            // Provide more specific error messages for common issues
            if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
                this.showError('Failed to load downloads: Cross-origin request blocked. Please check CORS settings on the API server.');
            } else if (error.message.includes('network')) {
                this.showError('Failed to load downloads: Network error. Please check your internet connection.');
            } else if (error.message.includes('404')) {
                this.showError('Failed to load downloads: API endpoint not found. Please check the API URL.');
            } else if (error.message.includes('Customer email not found')) {
                this.showError('Failed to load downloads: Customer email not found. Please ensure you are logged in.');
            } else {
                this.showError(`Failed to load downloads: ${error.message}`);
            }
        }
    }

    renderDownloads(orders) {
        if (!orders || orders.length === 0) {
            this.$list.html(`
                <div class="alertBox alertBox--info">
                    ${this.context.lang('account.downloads.no_downloads')}
                </div>
            `);
            this.$pagination.hide();
            return;
        }

        // Create table structure as requested
        let html = `
            <div class="downloads-table-container">
                <table class="downloads-table">
                    <thead>
                        <tr>
                            <th>${this.context.lang('account.downloads.order_number')}</th>
                            <th>${this.context.lang('common.date')}</th>
                            <th>${this.context.lang('account.downloads.product_name')}</th>
                            <th>${this.context.lang('account.downloads.remaining_downloads')}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        orders.forEach(order => {
            if (order.download_links && order.download_links.length > 0) {
                order.download_links.forEach((link, index) => {
                    html += `
                        <tr class="downloads-table-row">
                            <td class="downloads-table-cell">
                                ${index === 0 ? `#${order.order_number}` : ''}
                            </td>
                            <td class="downloads-table-cell">
                                ${this.formatDate(order.date_created)}
                            </td>
                            <td class="downloads-table-cell">
                                <a href="${link.url}" target="_blank" class="download-link">
                                    ${link.product_title}
                                </a>
                            </td>
                            <td class="downloads-table-cell">
                                ${this.context.lang('account.downloads.unlimited')}
                            </td>
                        </tr>
                    `;
                });
            }
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        this.$list.html(html);
        this.showContent();
    }

    renderPagination() {
        if (this.totalOrders <= this.perPage) {
            this.$pagination.hide();
            return;
        }

        const totalPages = Math.ceil(this.totalOrders / this.perPage);
        let html = '<div class="pagination">';

        // Previous button
        if (this.currentPage > 1) {
            html += `
                <a href="#" class="pagination-item pagination-item--previous" data-page="${this.currentPage - 1}">
                    ${this.context.lang('common.previous')}
                </a>
            `;
        }

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        if (startPage > 1) {
            html += `<a href="#" class="pagination-item" data-page="1">1</a>`;
            if (startPage > 2) {
                html += `<span class="pagination-item pagination-item--ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            if (i === this.currentPage) {
                html += `<span class="pagination-item pagination-item--current">${i}</span>`;
            } else {
                html += `<a href="#" class="pagination-item" data-page="${i}">${i}</a>`;
            }
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span class="pagination-item pagination-item--ellipsis">...</span>`;
            }
            html += `<a href="#" class="pagination-item" data-page="${totalPages}">${totalPages}</a>`;
        }

        // Next button
        if (this.currentPage < totalPages) {
            html += `
                <a href="#" class="pagination-item pagination-item--next" data-page="${this.currentPage + 1}">
                    ${this.context.lang('common.next')}
                </a>
            `;
        }

        html += '</div>';

        this.$pagination.html(html).show();

        // Bind pagination events
        this.$pagination.off('click', '.pagination-item').on('click', '.pagination-item', (e) => {
            e.preventDefault();
            const $target = $(e.currentTarget);
            const page = parseInt($target.data('page'));

            if (page && page !== this.currentPage) {
                this.onPageChange(page);
            }
        });
    }

    onPageChange(page) {
        this.currentPage = page;

        // Scroll to top of downloads container
        if (this.$container.length) {
            $('html, body').animate({
                scrollTop: this.$container.offset().top - 20
            }, 300);
        }

        // Show loading and fetch new page
        this.showLoading();
        this.fetchDownloads(this.currentPage, this.perPage);
    }

    formatDate(dateString) {
        if (!dateString) return '';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return dateString;
            }

            return date.toLocaleString(this.context.html_lang || 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateString;
        }
    }
}
