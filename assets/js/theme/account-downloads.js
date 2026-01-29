import PageManager from "./page-manager";
import API_CONFIG from "./api-config";
import { showAlertModal } from "./global/modal";

export default class AccountDownloads extends PageManager {
    constructor(context) {
        super(context);
        this.$container = $("[data-downloads-container]");
        this.$loading = $("[data-downloads-loading]");
        this.$error = $("[data-downloads-error]");
        this.$list = $("[data-downloads-list]");
        this.$pagination = $("[data-downloads-pagination]");

        this.currentPage = 1;
        this.perPage = 5;
        this.totalOrders = 0;
        this.customerEmail = this.context.customerEmail || "";

        // Bind event handlers
        this.onPageChange = this.onPageChange.bind(this);
    }

    onReady() {
        console.log("[AccountDownloads] Page Manager initialized");

        // Check if we're on the downloads page by URL (fallback detection)
        const currentUrl = window.location.href;
        const isDownloadsPage =
            currentUrl.includes("action=downloads") ||
            currentUrl.includes("/downloads") ||
            currentUrl.includes("show=downloads");

        console.log("[AccountDownloads] Current URL:", currentUrl);
        console.log(
            "[AccountDownloads] Is downloads page by URL check:",
            isDownloadsPage,
        );

        // Debug: Log URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        console.log(
            "[AccountDownloads] URL Parameters:",
            Object.fromEntries(urlParams.entries()),
        );

        // Check if we need to show the downloads container (for orders page integration)
        if (isDownloadsPage && currentUrl.includes("show=downloads")) {
            console.log(
                "[AccountDownloads] Showing downloads container for orders page integration",
            );
            this.$container.show();
        }

        if (!this.$container.length) {
            console.log(
                "[AccountDownloads] No container found - skipping initialization",
            );
            return;
        }

        console.log(
            "[AccountDownloads] Container found - initializing downloads list",
        );

        // Update breadcrumbs to show "Downloads" instead of "Your Orders" when on downloads page
        this.updateBreadcrumbsForDownloads();

        // Initialize the downloads list
        this.initDownloadsList();
    }

    /**
     * Update breadcrumbs to show "Downloads" instead of "Your Orders" for downloads page
     */
    updateBreadcrumbsForDownloads() {
        console.log(
            "[AccountDownloads] Updating breadcrumbs for downloads page",
        );

        // Wait for breadcrumbs to be rendered
        setTimeout(() => {
            const $breadcrumbs = $(".breadcrumbs");
            if ($breadcrumbs.length) {
                console.log("[AccountDownloads] Found breadcrumbs element");

                // Find the last breadcrumb (should be "Your Orders") and change it to "Downloads"
                const $lastBreadcrumb = $breadcrumbs.find(
                    ".breadcrumb.is-active",
                );
                if ($lastBreadcrumb.length) {
                    const currentText = $lastBreadcrumb
                        .find("span")
                        .text()
                        .trim();
                    console.log(
                        "[AccountDownloads] Current last breadcrumb text:",
                        currentText,
                    );

                    // Only update if it's showing orders-related text
                    if (
                        currentText.includes("Order") ||
                        currentText.includes("Orders")
                    ) {
                        $lastBreadcrumb.find("span").text("Downloads");
                        console.log(
                            '[AccountDownloads] Updated breadcrumb text to "Downloads"',
                        );
                    }
                }

                // Also update the JSON-LD breadcrumb data for SEO
                const $jsonLd = $('script[type="application/ld+json"]');
                if ($jsonLd.length) {
                    try {
                        const breadcrumbData = JSON.parse($jsonLd.html());
                        if (
                            breadcrumbData.itemListElement &&
                            breadcrumbData.itemListElement.length > 0
                        ) {
                            const lastItem =
                                breadcrumbData.itemListElement[
                                    breadcrumbData.itemListElement.length - 1
                                ];
                            if (
                                lastItem.item &&
                                (lastItem.item.name.includes("Order") ||
                                    lastItem.item.name.includes("Orders"))
                            ) {
                                lastItem.item.name = "Downloads";
                                $jsonLd.html(JSON.stringify(breadcrumbData));
                                console.log(
                                    "[AccountDownloads] Updated JSON-LD breadcrumb data",
                                );
                            }
                        }
                    } catch (error) {
                        console.error(
                            "[AccountDownloads] Error updating JSON-LD breadcrumb data:",
                            error,
                        );
                    }
                }
            } else {
                console.log(
                    "[AccountDownloads] No breadcrumbs found - may not be rendered yet",
                );
            }
        }, 500); // Small delay to ensure breadcrumbs are rendered
    }

    static load(context) {
        console.log(
            "[AccountDownloads] Static load called with context:",
            context,
        );

        // Create instance and call onReady
        const instance = new AccountDownloads(context);
        instance.onReady();
    }

    // Fallback initialization - check URL and initialize if needed
    static initFallback() {
        console.log("[AccountDownloads] Fallback initialization called");

        const currentUrl = window.location.href;
        const isDownloadsPage =
            currentUrl.includes("action=downloads") ||
            currentUrl.includes("/downloads") ||
            currentUrl.includes("show=downloads");

        console.log("[AccountDownloads] Fallback - Current URL:", currentUrl);
        console.log(
            "[AccountDownloads] Fallback - Is downloads page:",
            isDownloadsPage,
        );

        if (isDownloadsPage) {
            console.log(
                "[AccountDownloads] Fallback - Initializing downloads on detected downloads page",
            );

            // Check if we need to hide the orders content and show downloads instead
            if (currentUrl.includes("show=downloads")) {
                console.log(
                    "[AccountDownloads] Fallback - Hiding orders content for downloads view",
                );
                // Hide orders content
                $(".account-content").hide();
                // Show loading state in case our container exists
                $("[data-downloads-loading]").show();
            }

            // Get context from window if available
            const context = window.stencilBootstrapContext || {
                customerEmail: window.customerData?.email || "",
                lang: (key, params) => {
                    if (
                        window.langTranslations &&
                        window.langTranslations[key]
                    ) {
                        return window.langTranslations[key];
                    }
                    return key;
                },
                html_lang: "en-US",
            };

            console.log(
                "[AccountDownloads] Fallback - Using context:",
                context,
            );

            // Initialize the downloads
            const instance = new AccountDownloads(context);
            instance.onReady();
        } else {
            console.log(
                "[AccountDownloads] Fallback - Not on downloads page, skipping",
            );
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
        this.$error.hide().text("");
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
        console.log(
            "[AccountDownloads] showContent called - showing downloads list",
        );
        this.$loading.hide();
        this.$error.hide();
        this.$list.show();
        console.log("[AccountDownloads] Downloads list shown successfully");
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
                const $hiddenEmailField = $("#customer-id-field");
                if (
                    $hiddenEmailField.length &&
                    $hiddenEmailField.data("customer-email")
                ) {
                    identifier = $hiddenEmailField.data("customer-email");
                    console.log(
                        "[AccountDownloads] Found customer email in hidden field:",
                        identifier,
                    );
                }
            }

            // Try to get from any input field with customer email data
            if (!identifier) {
                const $emailField = $("[data-customer-email]");
                if ($emailField.length && $emailField.data("customer-email")) {
                    identifier = $emailField.data("customer-email");
                    console.log(
                        "[AccountDownloads] Found customer email in data attribute:",
                        identifier,
                    );
                }
            }

            // Persistence fix: Save the discovered email to the class instance
            // This ensures renderDownloads can access it later
            if (identifier && !this.customerEmail) {
                console.log(
                    "[AccountDownloads] Persisting discovered email to class instance:",
                    identifier,
                );
                this.customerEmail = identifier;
            }

            // Debug: Log what we found
            console.log(
                "[AccountDownloads] Customer identifier found:",
                identifier,
            );

            if (!identifier) {
                console.error(
                    "[AccountDownloads] No customer email found in context, window objects, or hidden fields",
                );
                console.log("[AccountDownloads] Context:", this.context);
                console.log(
                    "[AccountDownloads] Window customerData:",
                    window.customerData,
                );
                console.log(
                    "[AccountDownloads] Hidden field check:",
                    $("#customer-id-field").length ? "Found" : "Not found",
                );
                throw new Error(
                    "Customer email not found - cannot fetch downloads",
                );
            }

            // Build API URL
            const endpoint = API_CONFIG.ENDPOINTS.CUSTOMER_DOWNLOADS;
            const baseUrl = API_CONFIG.BASE_URL.replace(/\/$/, "");

            const url = `${baseUrl}${endpoint}?identifier=${encodeURIComponent(identifier)}&page=${page}&per_page=${perPage}`;

            console.log("[AccountDownloads] Fetching downloads from:", url);

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                credentials: "omit", // Change from 'include' to 'omit' to avoid CORS issues with wildcard origins
            });

            if (!response.ok) {
                throw new Error(
                    `API request failed with status ${response.status}`,
                );
            }

            const data = await response.json();
            console.log("[AccountDownloads] API response:", data);

            if (!data.success) {
                throw new Error(data.message || "Failed to fetch downloads");
            }

            // Check if we have any orders with download links
            const ordersWithLinks = data.orders_with_links || [];
            const hasDownloadableOrders = ordersWithLinks.some(
                (order) =>
                    order.download_links && order.download_links.length > 0,
            );

            // If no downloadable orders found on this page, show "no more records" message
            if (!hasDownloadableOrders && page > 1) {
                console.log(
                    "[AccountDownloads] No more downloadable records found",
                );
                this.$list.html(`
                    <div class="alertBox alertBox--info">
                        No more downloadable records available.
                    </div>
                `);
                this.$loading.hide(); // Hide loading spinner

                // Show pagination with only Previous button enabled
                this.renderNoMoreRecordsPagination();
                return;
            }

            // Store pagination info - handle different API response formats
            this.currentPage =
                data.pagination?.current_page || data.pagination?.page || page;
            this.perPage =
                data.pagination?.per_page || data.pagination?.limit || perPage;

            // Handle different field names for total orders count
            let totalOrders =
                data.orders_count ||
                data.total_orders ||
                data.total_records ||
                0;

            // If we have orders_with_links array, use its length as fallback
            if (data.orders_with_links && data.orders_with_links.length > 0) {
                totalOrders = data.orders_with_links.length;
            }

            // If pagination has total_orders_checked, use that
            if (data.pagination?.total_orders_checked) {
                totalOrders = data.pagination.total_orders_checked;
            }

            this.totalOrders = totalOrders;

            console.log("[AccountDownloads] Pagination info:", {
                currentPage: this.currentPage,
                perPage: this.perPage,
                totalOrders: this.totalOrders,
                totalPages: Math.ceil(this.totalOrders / this.perPage),
            });

            // Render downloads
            this.renderDownloads(ordersWithLinks);

            // Render pagination
            this.renderPagination();
        } catch (error) {
            console.error(
                "[AccountDownloads] Error fetching downloads:",
                error,
            );

            // Provide more specific error messages for common issues
            if (
                error.message.includes("CORS") ||
                error.message.includes("cross-origin")
            ) {
                this.showError(
                    "Failed to load downloads: Cross-origin request blocked. Please check CORS settings on the API server.",
                );
            } else if (error.message.includes("network")) {
                this.showError(
                    "Failed to load downloads: Network error. Please check your internet connection.",
                );
            } else if (error.message.includes("404")) {
                this.showError(
                    "Failed to load downloads: API endpoint not found. Please check the API URL.",
                );
            } else if (error.message.includes("Customer email not found")) {
                this.showError(
                    "Failed to load downloads: Customer email not found. Please ensure you are logged in.",
                );
            } else {
                this.showError(`Failed to load downloads: ${error.message}`);
            }
        }
    }

    renderDownloads(orders) {
        if (!orders || orders.length === 0) {
            this.$list.html(`
                <div class="alertBox alertBox--info">
                    ${this.context.lang("account.downloads.no_downloads")}
                </div>
            `);
            this.$pagination.hide();
            return;
        }

        // Create table structure as requested (without RemainingDownloads column)
        let html = `
            <div class="downloads-table-container">
                <p class="downloads-instructions" style="margin-bottom: 15px; padding: 12px 15px; background-color: #f5f5f5; border-left: 4px solid #333; font-size: 14px;">
                    <strong>How to download:</strong> Click on the <strong>Order#</strong> or <strong>Product Name</strong> to start your download.
                </p>
                <table class="downloads-table">
                    <thead>
                        <tr>
                            <th>Order#</th>
                            <th>Creation Date</th>
                            <th>Product Name</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        orders.forEach((order) => {
            if (order.download_links && order.download_links.length > 0) {
                order.download_links.forEach((link) => {
                    // Construct full download URL using BASE_URL from API config
                    const baseUrl = API_CONFIG.BASE_URL.replace(/\/$/, "");

                    // Manually construct the download link if not provided or to ensure correctness
                    // The backend expects a base64 encoded 'data' parameter containing order_id, sku, and customer_email
                    let downloadUrl;

                    if (link.download_link) {
                        downloadUrl = `${baseUrl}${link.download_link}`;
                    } else {
                        // Fallback construction
                        const orderId = order.order_id;
                        const sku = link.sku;
                        // Use the email that was used to fetch the downloads (this.customerEmail)
                        // or fallback to the current context email if available
                        let email =
                            this.customerEmail ||
                            (this.context && this.context.customer
                                ? this.context.customer.email
                                : "");

                        // Extra fallback: Check hidden fields directly if still missing
                        if (!email) {
                            const $hiddenEmailField = $("#customer-id-field");
                            if (
                                $hiddenEmailField.length &&
                                $hiddenEmailField.data("customer-email")
                            ) {
                                email =
                                    $hiddenEmailField.data("customer-email");
                            }
                        }

                        if (orderId && sku && email) {
                            const queryString = `order_id=${orderId}&sku=${sku}&customer_email=${encodeURIComponent(email)}`;
                            try {
                                const encodedData = btoa(queryString);
                                downloadUrl = `${baseUrl}/account/download?data=${encodeURIComponent(encodedData)}`;
                                console.log(
                                    "[AccountDownloads] Generated manual download link:",
                                    downloadUrl,
                                );
                            } catch (e) {
                                console.error(
                                    "[AccountDownloads] Error encoding download data:",
                                    e,
                                );
                                downloadUrl = "#error-encoding-link";
                            }
                        } else {
                            console.error(
                                "[AccountDownloads] Missing data for download link:",
                                { orderId, sku, email },
                            );
                            downloadUrl = "#missing-data";
                        }
                    }

                    html += `
                        <tr class="downloads-table-row">
                            <td class="downloads-table-cell">
                                <a href="${downloadUrl}" target="_blank" class="download-link">
                                    #${order.order_number}
                                </a>
                            </td>
                            <td class="downloads-table-cell">
                                ${this.formatDate(order.date_created)}
                            </td>
                            <td class="downloads-table-cell">
                                <a href="${downloadUrl}" target="_blank" class="download-link">
                                    ${link.product_title}
                                </a>
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
        console.log("[AccountDownloads] renderPagination called with:", {
            currentPage: this.currentPage,
            perPage: this.perPage,
            totalOrders: this.totalOrders,
        });

        // Calculate total pages based on actual data
        const totalPages = Math.ceil(this.totalOrders / this.perPage);
        console.log("[AccountDownloads] Calculated total pages:", totalPages);

        let html = '<div class="pagination">';

        // Previous button - disabled on first page, enabled otherwise
        if (this.currentPage > 1) {
            html += `
                <a href="#" class="pagination-item pagination-item--previous" data-page="${this.currentPage - 1}">
                    Previous
                </a>
            `;
        } else {
            // Show disabled previous button on first page
            html += `
                <span class="pagination-item pagination-item--previous pagination-item--disabled" aria-disabled="true">
                    Previous
                </span>
            `;
        }

        // Next button - always enabled for testing/navigation purposes
        html += `
            <a href="#" class="pagination-item pagination-item--next" data-page="${this.currentPage + 1}">
                Next
            </a>
        `;

        html += "</div>";

        console.log(
            "[AccountDownloads] Generated simplified pagination HTML:",
            html,
        );

        this.$pagination.html(html).show();

        console.log("[AccountDownloads] Pagination container shown");

        // Bind pagination events
        this.$pagination
            .off("click", ".pagination-item")
            .on("click", ".pagination-item", (e) => {
                e.preventDefault();
                const $target = $(e.currentTarget);
                const page = parseInt($target.data("page"));

                console.log(
                    "[AccountDownloads] Pagination click event triggered for page:",
                    page,
                );

                if (page && page !== this.currentPage) {
                    console.log(
                        `[AccountDownloads] Page change: ${this.currentPage} -> ${page}`,
                    );
                    this.onPageChange(page);
                } else {
                    console.log(
                        "[AccountDownloads] Clicked same page or invalid page number",
                    );
                }
            });

        console.log("[AccountDownloads] Pagination events bound successfully");
    }

    onPageChange(page) {
        this.currentPage = page;

        // Scroll to top of downloads container
        if (this.$container.length) {
            $("html, body").animate(
                {
                    scrollTop: this.$container.offset().top - 20,
                },
                300,
            );
        }

        // Show loading and fetch new page
        this.showLoading();
        this.fetchDownloads(this.currentPage, this.perPage);
    }

    formatDate(dateString) {
        if (!dateString) return "";

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return dateString;
            }

            return date.toLocaleString(this.context.html_lang || "en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch (error) {
            console.error("Error formatting date:", error);
            return dateString;
        }
    }

    /**
     * Render pagination controls when no more records are available
     * Shows only the Previous button to allow navigation back
     */
    renderNoMoreRecordsPagination() {
        console.log("[AccountDownloads] renderNoMoreRecordsPagination called");

        let html = '<div class="pagination">';

        // Show Previous button (enabled since we're not on page 1)
        html += `
            <a href="#" class="pagination-item pagination-item--previous" data-page="${this.currentPage - 1}">
                Previous
            </a>
        `;

        html += "</div>";

        console.log(
            "[AccountDownloads] Generated no-more-records pagination HTML:",
            html,
        );

        this.$pagination.html(html).show();

        // Bind pagination events
        this.$pagination
            .off("click", ".pagination-item")
            .on("click", ".pagination-item", (e) => {
                e.preventDefault();
                const $target = $(e.currentTarget);
                const page = parseInt($target.data("page"));

                console.log(
                    "[AccountDownloads] No-more-records pagination click event triggered for page:",
                    page,
                );

                if (page && page !== this.currentPage) {
                    console.log(
                        `[AccountDownloads] Page change: ${this.currentPage} -> ${page}`,
                    );
                    this.onPageChange(page);
                } else {
                    console.log(
                        "[AccountDownloads] Clicked same page or invalid page number",
                    );
                }
            });

        console.log(
            "[AccountDownloads] No-more-records pagination events bound successfully",
        );
    }
}
