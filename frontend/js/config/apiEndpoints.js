/**
 * API route path templates — no business rules, only endpoint paths.
 * Base URL is configured in api.js.
 */
const API_ENDPOINTS = {
  RFQ_CONFIG: '/rfqs/config',
  RFQ_LIST: '/rfqs',
  RFQ_DETAIL: (id) => `/rfqs/${id}`,
  RFQ_DRAFT: '/rfqs/draft',
  RFQ_SEND: '/rfqs/send',
  CATEGORIES: '/categories',
  UNITS: '/units',
  VENDORS: '/vendors',
};
