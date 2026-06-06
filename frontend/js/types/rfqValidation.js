/**
 * Dynamic RFQ validation — rules imported from backend config at runtime.
 */
const RFQValidation = {
  validateStep1(data, config) {
    const v = config.validation;
    const errors = {};
    const title = (data.title || '').trim();

    if (!title) errors.title = 'RFQ title is required';
    else if (title.length < v.min_title_length) errors.title = `Title must be at least ${v.min_title_length} characters`;
    else if (title.length > v.max_title_length) errors.title = `Title must be under ${v.max_title_length} characters`;
    else if (!new RegExp(v.title_pattern).test(title)) errors.title = 'Title contains invalid characters';

    if (!data.deadline) {
      errors.deadline = 'Deadline is required';
    } else {
      const dl = new Date(data.deadline + 'T00:00:00');
      const min = new Date();
      min.setHours(0, 0, 0, 0);
      if (dl < min) {
        errors.deadline = 'Deadline cannot be a past date';
      }
    }

    const desc = data.description || '';
    if (desc.length > v.max_description_length) {
      errors.description = `Description must be under ${v.max_description_length} characters`;
    }

    return errors;
  },

  validateStep2(lineItems, config) {
    const v = config.validation;
    const errors = {};

    if (!lineItems.length) {
      errors.line_items = `At least ${v.min_line_items} line item is required`;
      return errors;
    }

    lineItems.forEach((item, i) => {
      if (!(item.item_name || '').trim()) errors[`line_items.${i}.item_name`] = 'Item name is required';
      const qty = parseFloat(item.qty);
      if (isNaN(qty) || qty < v.min_qty) errors[`line_items.${i}.qty`] = `Quantity must be at least ${v.min_qty}`;
      if (!item.unit) errors[`line_items.${i}.unit`] = 'Unit is required';
    });

    return errors;
  },

  validateStep3(data, config) {
    const v = config.validation;
    const errors = {};
    const ids = data.assigned_vendor_ids || [];
    if (ids.length < (v.min_vendors_on_send || 1)) {
      errors.assigned_vendor_ids = `At least ${v.min_vendors_on_send || 1} vendor must be assigned`;
    }
    return errors;
  },

  validateDraft(data, config) {
    const errors = {};
    const v = config.validation;
    const title = (data.title || '').trim();
    if (title && title.length > v.max_title_length) {
      errors.title = `Title must be under ${v.max_title_length} characters`;
    }
    return errors;
  },

  validateFiles(files, config) {
    const fu = config.file_upload;
    const errors = {};
    if (files.length > fu.max_total_files) {
      errors.attachments = `Maximum ${fu.max_total_files} files allowed`;
      return errors;
    }
    files.forEach((f, i) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!fu.allowed_extensions.includes(ext)) {
        errors[`attachments.${i}`] = `File type ${ext} is not allowed`;
      }
      if (f.size > fu.max_file_size_bytes) {
        errors[`attachments.${i}`] = `File exceeds maximum size of ${Math.round(fu.max_file_size_bytes / 1048576)}MB`;
      }
    });
    return errors;
  },

  sanitizeText(str) {
    if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
    return (str || '').replace(/<[^>]*>/g, '');
  },
};
