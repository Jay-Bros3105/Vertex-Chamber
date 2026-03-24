const { validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = [];
    errors.array().map(err => extractedErrors.push({ 
      field: err.param, 
      message: err.msg 
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: extractedErrors
    });
  };
};

// Custom validators
const validateObjectId = (value, { req }) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    throw new Error('Invalid ID format');
  }
  return true;
};

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/;
  return re.test(password);
};

const validateUsername = (username) => {
  // 3-20 characters, letters, numbers, underscores
  const re = /^[a-zA-Z0-9_]{3,20}$/;
  return re.test(username);
};

module.exports = {
  validate,
  validateObjectId,
  validateEmail,
  validatePassword,
  validateUsername
};