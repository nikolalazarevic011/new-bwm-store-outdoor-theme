// API Configuration for Picklist functionality
// This file provides the API configuration that would normally be fetched from config.json
// Since config.json is not accessible via XHR in deployed BigCommerce themes,
// we use this static configuration file instead.

const API_CONFIG = {
  BASE_URL: "https://bwm-store-laravel-app.lwccportal.com/api",
  ENDPOINTS: {
    PRODUCT_MODIFIERS: "/products/{{productId}}/modifiers",
    CUSTOMER_DOWNLOADS: "/customers/orders-with-links"
  },
  DEFAULT_HEADERS: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
};

export default API_CONFIG;

