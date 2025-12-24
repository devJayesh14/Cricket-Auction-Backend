const { body, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
      })),
    });
  }
  
  next();
}

/**
 * Validation rules for user registration
 */
const registerValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('Email cannot exceed 100 characters'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .isLength({ max: 128 })
    .withMessage('Password cannot exceed 128 characters'),
  
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('role')
    .optional()
    .isIn(['admin', 'auctioneer', 'team_owner'])
    .withMessage('Role must be either admin, auctioneer, or team_owner'),
  
  body('teamId')
    .optional()
    .isMongoId()
    .withMessage('Team ID must be a valid MongoDB ObjectId'),
  
  handleValidationErrors,
];

/**
 * Validation rules for user login
 */
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors,
];

/**
 * Validation rules for player creation
 */
const createPlayerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Player name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Player name must be between 2 and 100 characters'),
  
  body('age')
    .notEmpty()
    .withMessage('Age is required')
    .isInt({ min: 16, max: 50 })
    .withMessage('Age must be between 16 and 50'),
  
  body('role')
    .notEmpty()
    .withMessage('Player role is required')
    .isIn(['batsman', 'bowler', 'all-rounder', 'wicket-keeper', 'wicket-keeper-batsman'])
    .withMessage('Role must be one of: batsman, bowler, all-rounder, wicket-keeper, wicket-keeper-batsman'),
  
  body('basePrice')
    .notEmpty()
    .withMessage('Base price is required')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),
  
  // Photo is handled by multer middleware, so skip validation here
  // body('photo') removed - handled by file upload middleware
  
  handleValidationErrors,
];

module.exports = {
  registerValidation,
  loginValidation,
  createPlayerValidation,
  handleValidationErrors,
};

