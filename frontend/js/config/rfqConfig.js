/**
 * RFQ configuration loader — all business rules fetched from backend.
 */
const RFQConfigLoader = {
  _config: null,
  _loading: null,

  async load() {
    if (this._config) return this._config;
    if (this._loading) return this._loading;

    this._loading = Api.request(API_ENDPOINTS.RFQ_CONFIG).then((cfg) => {
      this._config = cfg;
      this._loading = null;
      return cfg;
    }).catch((err) => {
      this._loading = null;
      throw err;
    });

    return this._loading;
  },

  get() {
    return this._config;
  },

  clear() {
    this._config = null;
  },
};
