/* ═══════════════════════════════════════════════════════
   VendorBridge — Client-side Vendor Validation
   Mirrors backend Pydantic rules
   ═══════════════════════════════════════════════════════ */

const VendorValidation = {
  CATEGORIES: ['Construction', 'IT', 'Logistics', 'Manufacturing', 'Services', 'Other'],
  STATUSES: ['Active', 'Pending', 'Blocked'],
  GST_REGEX: /^[A-Za-z0-9]{29}$/,
  PHONE_REGEX: /^[+]?[\d\s\-()]{10,15}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  validate(data, isUpdate = false) {
    const errors = {};

    if (!isUpdate || data.name !== undefined) {
      const name = (data.name || '').trim();
      if (name.length < 2) errors.name = 'Name must be at least 2 characters';
      else if (name.length > 200) errors.name = 'Name must be under 200 characters';
    }

    if (!isUpdate || data.category !== undefined) {
      if (!data.category || !this.CATEGORIES.includes(data.category)) {
        errors.category = 'Select a valid category';
      }
    }

    if (!isUpdate || data.gst_number !== undefined) {
      const gst = (data.gst_number || '').trim().toUpperCase();
      if (!this.GST_REGEX.test(gst)) {
        errors.gst_number = 'GST number must be exactly 29 alphanumeric characters';
      }
    }

    if (!isUpdate || data.contact_person !== undefined) {
      const cp = (data.contact_person || '').trim();
      if (cp.length < 2) errors.contact_person = 'Contact person is required (min 2 chars)';
    }

    if (!isUpdate || data.email !== undefined) {
      const email = (data.email || '').trim();
      if (!this.EMAIL_REGEX.test(email)) errors.email = 'Enter a valid email address';
    }

    if (!isUpdate || data.phone !== undefined) {
      const phone = (data.phone || '').trim();
      if (!this.PHONE_REGEX.test(phone)) errors.phone = 'Enter a valid phone number';
      else {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) {
          errors.phone = 'Phone must contain 10–15 digits';
        }
      }
    }

    return { valid: Object.keys(errors).length === 0, errors };
  },

  sanitizePayload(data) {
    return {
      name: (data.name || '').trim(),
      category: data.category,
      gst_number: (data.gst_number || '').trim().toUpperCase(),
      contact_person: (data.contact_person || '').trim(),
      email: (data.email || '').trim().toLowerCase(),
      phone: (data.phone || '').trim(),
      status: data.status || 'Pending',
    };
  },
};
