import utils from '@bigcommerce/stencil-utils';
import { showAlertModal } from '../global/modal';
import currencySelector from '../global/currency-selector';
import { normalizeFormData } from './utils/api';
import forms from './models/forms';
import nod from './nod';
import API_CONFIG from '../api-config';

/**
 * Picklist (modifier product_list_with_images) UI:
 * - Fetches picklist products for the parent PDP product
 * - Renders a table: product name, price, qty selector
 * - Adds multiple selected rows to cart via sequential cart.itemAdd calls
 *
 * Markup expectations (see product-view.html):
 * - [data-picklist-root]
 *   - [data-picklist-loading]
 *   - [data-picklist-error]
 *   - [data-picklist-table]
 *     - tbody[data-picklist-tbody]
 *   - button[data-picklist-add]
 *
 * Optional:
 * - [data-picklist-api-base] attribute to override API base URL
 */
export default class Picklist {
    constructor({
        $scope,
        context,
        $overlay,
        previewModal,
        updateCartContent,
        productId,
    }) {
        this.$scope = $scope;
        this.context = context;

        this.$overlay = $overlay;
        this.previewModal = previewModal;
        this.updateCartContent = updateCartContent;

        // Elements (resolved in init)
        this.$root = null;
        this.$loading = null;
        this.$error = null;
        this.$table = null;
        this.$tbody = null;
        this.$addBtn = null;

        this._data = null;
        this._rows = [];
        this._validator = null;

        this._picklistModifiers = null; // { ids: number[], displayNames: string[] }
        this._hiddenOptionFields = $(); // jQuery collection of hidden option .form-field nodes

        // Prefer passing productId from product-details.js, fallback to reading from PDP form.
        this._productId = productId ? Number(productId) : null;
    }

    init() {
        this.$root = this.$scope.find('[data-picklist-root]').first();

        // If theme template hasn't been updated yet, no-op safely.
        if (!this.$root.length) return;

        console.groupCollapsed('[Picklist] init');
        console.log('Root found:', this.$root[0]);
        console.log('Initial productId (if provided):', this._productId);
        console.groupEnd();

        this.$loading = this.$root.find('[data-picklist-loading]');
        this.$error = this.$root.find('[data-picklist-error]');
        this.$table = this.$root.find('[data-picklist-table]');
        this.$tbody = this.$root.find('[data-picklist-tbody]');
        this.$addBtn = this.$root.find('[data-picklist-add]');

        this.$addBtn.on('click', (event) => {
            event.preventDefault();
            this.handleAddSelected();
        });

        // Show loading state immediately and ensure it's visible
        this.showLoadingState();

        // Use the fallback method that handles API errors gracefully
        this.fetchAndRenderWithFallback();
    }

    getProductId() {
        if (this._productId) return this._productId;

        const $form = this.$scope.find('form[data-cart-item-add]').first();
        const id = Number($form.find('[name="product_id"]').val());
        this._productId = id || null;
        return id;
    }

    getApiConfig() {
        // Use the static API configuration
        // This avoids XHR issues in deployed BigCommerce themes
        if (!API_CONFIG?.BASE_URL) {
            throw new Error('Config missing BASE_URL');
        }
        return API_CONFIG;
    }

    async fetchAndRenderWithFallback() {
        try {
            await this.fetchAndRender();
        } catch (e) {
            console.error('[Picklist] Error in fetchAndRender:', e);
            // Show "Coming Soon" message instead of network error
            this.showComingSoonMessage();
        }
    }

    showComingSoonMessage() {
        // Display a "Coming Soon" message when API is not available
        if (this.$loading) {
            this.$loading.hide();
        }
        if (this.$error) {
            this.$error.show().text('Coming Soon...');
        }
        if (this.$table) {
            this.$table.hide();
        }
        if (this.$addBtn) {
            this.$addBtn.prop('disabled', true);
        }
        // Show the picklist root container with the coming soon message
        if (this.$root) {
            this.$root.show();
        }
    }

    async buildEndpoint(productId) {
        try {
            const config = await this.getApiConfig();

            // Validate BASE_URL exists and is not empty
            if (!config?.BASE_URL || typeof config.BASE_URL !== 'string' || config.BASE_URL.trim() === '') {
                console.error('[Picklist] Invalid or missing BASE_URL in config');
                throw new Error('Invalid API configuration: BASE_URL is missing or empty');
            }

            const base = config.BASE_URL.replace(/\/$/, '').trim();

            // Validate endpoint exists and is not empty
            const endpoint = config.ENDPOINTS?.PRODUCT_MODIFIERS || '/products/{{productId}}/modifiers';
            if (typeof endpoint !== 'string' || endpoint.trim() === '') {
                console.error('[Picklist] Invalid or missing PRODUCT_MODIFIERS endpoint');
                throw new Error('Invalid API configuration: PRODUCT_MODIFIERS endpoint is missing or empty');
            }

            const fullUrl = `${base}${endpoint.replace('{{productId}}', String(productId))}`;

            // Validate the final URL is valid
            try {
                new URL(fullUrl);
                return fullUrl;
            } catch (urlError) {
                console.error('[Picklist] Invalid URL constructed:', fullUrl, urlError);
                throw new Error('Invalid API URL constructed');
            }
        } catch (configError) {
            console.error('[Picklist] Configuration error:', configError);
            throw new Error('API configuration error: ' + configError.message);
        }
    }

    setUiState({ loading = false, error = '' } = {}) {
        if (this.$loading) this.$loading.toggle(loading);
        if (this.$error) {
            this.$error.toggle(!!error);
            this.$error.text(error || '');
        }
        if (this.$table) this.$table.toggle(!loading && !error && this._rows.length > 0);
        if (this.$addBtn) this.$addBtn.prop('disabled', loading || this._rows.length === 0);
    }

    enablePicklistMode() {
        // Hide the normal PDP single-item add to cart UI when picklist is present.
        // This keeps users focused on the picklist purchase flow.
        this.$scope.find('#add-to-cart-wrapper').hide();
        // Stock + other form fields remain visible; you can expand this if needed.
    }

    disablePicklistMode() {
        this.$scope.find('#add-to-cart-wrapper').show();
    }

    extractPicklistModifiers(json) {
        const groups = json?.data || [];
        const ids = [];
        const displayNames = [];

        for (const group of groups) {
            const details = group?.modifier_details || {};
            if (details.modifier_type !== 'product_list_with_images') continue;

            const modifierId = Number(details.modifier_id);
            if (!Number.isNaN(modifierId)) ids.push(modifierId);

            if (details.modifier_display_name) displayNames.push(String(details.modifier_display_name));
            if (details.modifier_name) displayNames.push(String(details.modifier_name));
        }

        // De-dupe
        return {
            ids: Array.from(new Set(ids)),
            displayNames: Array.from(new Set(displayNames)).filter(Boolean),
        };
    }

    showPicklistOptionUi() {
        if (this._hiddenOptionFields && this._hiddenOptionFields.length) {
            this._hiddenOptionFields.show();
        }
        this._hiddenOptionFields = $();
    }

    hidePicklistOptionUi(modifiers) {
        const $optionsRoot = this.$scope.find('[data-product-option-change]').first();
        if (!$optionsRoot.length) return;

        const ids = modifiers?.ids || [];
        const displayNames = modifiers?.displayNames || [];

        let $fields = $();

        // Prefer exact match by modifier/option ID (attribute[ID])
        ids.forEach((id) => {
            if (!id) return;

            $fields = $fields.add(
                $optionsRoot
                    .find(`input[name="attribute[${id}]"], select[name="attribute[${id}]"], textarea[name="attribute[${id}]"]`)
                    .closest('.form-field'),
            );
        });

        // Fallback match by label text (display name)
        if (displayNames.length) {
            const $labelFields = $optionsRoot.find('.form-field').filter((_, el) => {
                const $el = $(el);
                const labelText = $el.find('.form-label--alternate').first().text().trim();
                if (!labelText) return false;

                return displayNames.some((dn) => {
                    const needle = String(dn).trim();
                    if (!needle) return false;

                    // Handles patterns like "Format:" and "Format: Required"
                    return labelText.startsWith(`${needle}:`) || labelText === needle;
                });
            });

            $fields = $fields.add($labelFields);
        }

        if (!$fields.length) return;

        // If the hidden modifier had required inputs, remove required so the main form validity isn't impacted.
        $fields.find('[required]').removeAttr('required');

        $fields.hide();
        this._hiddenOptionFields = $fields;
    }

    async fetchAndRender() {
        const productId = this.getProductId();
        if (!productId) {
            console.warn('[Picklist] No productId found; skipping picklist fetch.');
            return;
        }

        this.setUiState({ loading: true, error: '' });

        try {
            const url = await this.buildEndpoint(productId);

            console.groupCollapsed('[Picklist] API request');
            console.log('productId:', productId);
            console.log('url:', url);
            console.groupEnd();

            let res;
            try {
                res = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    // credentials: 'include', // Include cookies if needed
                });
            } catch (fetchError) {
                console.error('[Picklist] Network error:', fetchError);
                throw new Error('Network error: Unable to connect to the API');
            }

            if (!res) {
                throw new Error('No response received from API');
            }

            console.log('[Picklist] API response status:', res.status, res.statusText);
            console.log('[Picklist] API response headers:', Object.fromEntries(res.headers.entries()));

            if (!res.ok) {
                const text = await res.text();
                console.groupCollapsed('[Picklist] API response text (non-JSON)');
                console.log(text);
                console.groupEnd();
                throw new Error(`Picklist API failed (${res.status})`);
            }

            const text = await res.text();
            // console.groupCollapsed('[Picklist] API response text (raw)');
            // console.log(text);
            // console.groupEnd();

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.error('[Picklist] Failed to parse JSON:', e);
                throw new Error('Invalid JSON response');
            }

            this._data = json;

            // console.groupCollapsed('[Picklist] API response JSON');
            // console.log(json);
            // console.groupEnd();

            this._picklistModifiers = this.extractPicklistModifiers(json);
            // console.log('[Picklist] extracted picklist modifiers:', this._picklistModifiers);

            const rows = this.extractRows(json);
            // console.log('[Picklist] extracted picklist rows:', rows);

            if (!rows.length) {
                // If no picklist data, keep component hidden but do not show error.
                this._rows = [];
                this.$root.hide();
                this.disablePicklistMode();
                this.showPicklistOptionUi();
                this.setUiState({ loading: false, error: '' });
                return;
            }

            this._rows = rows;
            this.enablePicklistMode();
            this.hidePicklistOptionUi(this._picklistModifiers);
            this.$root.show();
            this.renderRows(rows);
            this.setupValidation();

            this.setUiState({ loading: false, error: '' });
        } catch (e) {
            console.error('[Picklist] Error in fetchAndRender:', e);
            this._rows = [];
            this.disablePicklistMode();
            this.showPicklistOptionUi();
            this.setUiState({ loading: false, error: '' });
            // Show coming soon message for any errors
            this.showComingSoonMessage();
        }
    }

    extractRows(json) {
        // Expected response (per user):
        // { success: true, data: [ { modifier_details: {...}, products: [{id,name,price,inventory_level,...}] } ] }
        const groups = json?.data || [];
        const rows = [];

        for (const group of groups) {
            const modifierType = group?.modifier_details?.modifier_type;
            const products = group?.products || [];

            // Only treat as picklist if type matches and products exist
            if (modifierType !== 'product_list_with_images') continue;

            for (const p of products) {
                if (!p || !p.id) continue;

                rows.push({
                    productId: Number(p.id),
                    name: p.name || `Product ${p.id}`,
                    sku: p.sku || '',
                    // price appears numeric in response
                    price: typeof p.price === 'number' ? p.price : Number(p.price),
                    inventoryLevel: typeof p.inventory_level === 'number' ? p.inventory_level : Number(p.inventory_level),
                    isVisible: !!p.is_visible,
                    isDigital: this.isDigitalProduct(p),
                });
            }
        }

        return rows;
    }

    isDigitalProduct(p) {
        // Prefer explicit API flag if present.
        if (p?.is_digital === true) return true;
        if (p?.is_digital === false) return false;

        // Infer from name or SKU if not provided.
        const name = String(p.name || '').toLowerCase();
        const sku = String(p.sku || '').toLowerCase();

        // Common digital product indicators (file extensions, etc.)
        const digitalKeywords = [
            'mp3', 'mp4', 'pdf', 'epub', 'mobi', 'zip', 'download', 'digital', 'ebook', 'audiobook', 'video', 'stream',
        ];

        return digitalKeywords.some(keyword => name.includes(keyword) || sku.includes(keyword));
    }

    formatPrice(value) {
        // If context has a currency formatter, prefer it.
        // Stencil context varies; safest is to show with 2 decimals.
        const n = Number(value);
        if (Number.isNaN(n)) return '';
        return n.toFixed(2);
    }

    renderRows(rows) {
        if (!this.$tbody || !this.$tbody.length) return;

        console.groupCollapsed('[Picklist] renderRows');
        console.log('rows:', rows);
        console.groupEnd();

        const html = rows.map((row) => {
            // Digital products are never out of stock; physical products respect inventory_level.
            const disabled = !row.isDigital && row.inventoryLevel === 0;
            const qtyMin = 0;
            const qtyMax = row.isDigital ? 9999 : (row.inventoryLevel > 0 ? row.inventoryLevel : 0);

            // qty input name intentionally unique, we do not submit the main form.
            return `
                <tr data-picklist-row data-product-id="${row.productId}">
                    <td class="picklistTable-name">${this.escapeHtml(row.name)}</td>
                    <td class="picklistTable-price">${this.escapeHtml(this.formatPrice(row.price))}</td>
                    <td class="picklistTable-qty">
                        <div class="form-field" data-quantity-change>
                            <div class="form-increment">
                                <button class="button button--icon" type="button" data-action="dec" ${disabled ? 'disabled' : ''}>-</button>
                                <input
                                    class="form-input form-input--incrementTotal"
                                    type="tel"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    value="0"
                                    data-quantity-min="${qtyMin}"
                                    data-quantity-max="${qtyMax}"
                                    aria-label="Quantity"
                                    ${disabled ? 'disabled' : ''}
                                />
                                <button class="button button--icon" type="button" data-action="inc" ${disabled ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                        ${disabled ? '<div class="picklistTable-oos">Out of stock</div>' : ''}
                    </td>
                </tr>
            `;
        }).join('');

        console.groupCollapsed('[Picklist] renderRows HTML');
        console.log(html);
        console.groupEnd();

        this.$tbody.html(html);

        // Bind +/- controls for each row
        this.$tbody.off('click.picklistQty');
        this.$tbody.on('click.picklistQty', '[data-quantity-change] button', (event) => {
            event.preventDefault();

            const $btn = $(event.currentTarget);
            const $row = $btn.closest('[data-picklist-row]');
            const $input = $row.find('.form-input--incrementTotal');

            const qtyMin = parseInt($input.data('quantityMin'), 10);
            const qtyMax = parseInt($input.data('quantityMax'), 10);

            let qty = forms.numbersOnly($input.val()) ? parseInt($input.val(), 10) : qtyMin;

            if ($btn.data('action') === 'inc') {
                qty = forms.validateIncreaseAgainstMaxBoundary(qty, qtyMax);
            } else if (qty > qtyMin) {
                qty = forms.validateDecreaseAgainstMinBoundary(qty, qtyMin);
            }

            $input.val(qty);

            if (this._validator) this._validator.performCheck();
        });

        // Prevent enter key from submitting the PDP form when focused in qty input
        this.$tbody.off('keypress.picklistQty');
        this.$tbody.on('keypress.picklistQty', '.form-input--incrementTotal', (event) => {
            const x = event.which || event.keyCode;
            if (x === 13) event.preventDefault();
        });
    }

    setupValidation() {
        // Validate all qty inputs are numeric and within bounds.
        // We reuse nod for consistency with theme behavior.
        this._validator = nod({
            submit: this.$addBtn,
        });

        this._validator.add([{
            selector: '[data-picklist-row] .form-input--incrementTotal',
            validate: (cb, val, el) => {
                const isNumber = forms.numbersOnly(val);
                if (!isNumber) return cb(false);

                const qty = parseInt(val, 10);
                const $el = $(el);
                const qtyMin = parseInt($el.data('quantityMin'), 10);
                const qtyMax = parseInt($el.data('quantityMax'), 10);

                if (qty < qtyMin) return cb(false);
                if (qtyMax >= 0 && qty > qtyMax) return cb(false);

                return cb(true);
            },
            errorMessage: this.context?.productQuantityErrorMessage || 'Please enter a valid quantity.',
        }]);
    }

    getSelectedLineItems() {
        if (!this.$tbody || !this.$tbody.length) return [];

        const items = [];

        this.$tbody.find('[data-picklist-row]').each((_, rowEl) => {
            const $row = $(rowEl);
            const productId = Number($row.data('productId'));
            const $input = $row.find('.form-input--incrementTotal');
            const qty = forms.numbersOnly($input.val()) ? parseInt($input.val(), 10) : 0;

            if (productId && qty > 0) {
                items.push({ productId, qty });
            }
        });

        return items;
    }

    async handleAddSelected() {
        if (this._validator) this._validator.performCheck();
        if (this._validator && !this._validator.areAll('valid')) return;

        const items = this.getSelectedLineItems();

        console.groupCollapsed('[Picklist] Add Selected');
        console.log('items:', items);
        console.groupEnd();

        if (!items.length) {
            return showAlertModal('Select a quantity for at least one item.');
        }

        // UI lock
        this.$addBtn.prop('disabled', true);
        if (this.$overlay) this.$overlay.show();

        try {
            let lastCartItemId = null;

            // Sequential adds, so cart preview behavior matches existing theme.
            // If any add fails, we stop and show error.
            // eslint-disable-next-line no-restricted-syntax
            for (const item of items) {
                // eslint-disable-next-line no-await-in-loop
                const response = await this.addSingleItem(item.productId, item.qty);
                lastCartItemId = response?.data?.cart_item?.id || lastCartItemId;
            }

            // Open preview modal after the last successful add (match existing PDP UX)
            if (this.previewModal && lastCartItemId) {
                this.previewModal.open();
                this.updateCartContent(this.previewModal, lastCartItemId);
            } else {
                // fallback: reload cart counter via event? Keep minimal.
                window.location.reload();
            }
        } catch (e) {
            showAlertModal(e.message || 'Failed to add items to cart.');
        } finally {
            if (this.$overlay) this.$overlay.hide();
            this.$addBtn.prop('disabled', false);
        }
    }

    addSingleItem(productId, qty) {
        return new Promise((resolve, reject) => {
            console.groupCollapsed('[Picklist] cart.itemAdd');
            console.log('productId:', productId);
            console.log('qty:', qty);
            console.groupEnd();

            const fd = new FormData();
            fd.append('action', 'add');
            fd.append('product_id', String(productId));
            fd.append('qty[]', String(qty));

            utils.api.cart.itemAdd(normalizeFormData(fd), (err, response) => {
                currencySelector(response?.data?.cart_id);

                console.groupCollapsed('[Picklist] cart.itemAdd response');
                console.log('err:', err);
                console.log('response:', response);
                console.groupEnd();

                const errorMessage = err || response?.data?.error;
                if (errorMessage) {
                    const tmp = document.createElement('DIV');
                    tmp.innerHTML = errorMessage;
                    reject(new Error(tmp.textContent || tmp.innerText));
                    return;
                }

                resolve(response);
            });
        });
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#039;');
    }

    showLoadingState() {
        // Ensure loading state is properly displayed before API call
        if (this.$loading) {
            this.$loading.show();
        }
        if (this.$error) {
            this.$error.hide().text('');
        }
        if (this.$table) {
            this.$table.hide();
        }
        if (this.$addBtn) {
            this.$addBtn.prop('disabled', true);
        }
        // Show the picklist root container so loading state is visible
        if (this.$root) {
            this.$root.show();
        }
    }
}
