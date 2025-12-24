const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directories if they don't exist
const playersUploadsDir = path.join(__dirname, '../../uploads/players');
const teamsUploadsDir = path.join(__dirname, '../../uploads/teams');
if (!fs.existsSync(playersUploadsDir)) {
  fs.mkdirSync(playersUploadsDir, { recursive: true });
}
if (!fs.existsSync(teamsUploadsDir)) {
  fs.mkdirSync(teamsUploadsDir, { recursive: true });
}

// Configure storage for player photos
const playerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, playersUploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// Configure storage for team logos
const teamStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, teamsUploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter - only accept images
const imageFileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// File filter - accept CSV files
const csvFileFilter = (req, file, cb) => {
  // Accept CSV files
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed!'), false);
  }
};

// Configure multer for players (images)
const playerUpload = multer({
  storage: playerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Configure multer for teams (images)
const teamUpload = multer({
  storage: teamStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Configure multer for CSV files
const csvStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads/csv'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `players-${uniqueSuffix}.csv`);
  }
});

// Create CSV uploads directory
const csvUploadsDir = path.join(__dirname, '../../uploads/csv');
if (!fs.existsSync(csvUploadsDir)) {
  fs.mkdirSync(csvUploadsDir, { recursive: true });
}

const csvUpload = multer({
  storage: csvStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for CSV
  },
  fileFilter: csvFileFilter
});

// Middleware for single file upload (for player photos)
const uploadPlayerPhoto = playerUpload.single('photo');

// Middleware for single file upload (for team logos)
const uploadTeamLogo = teamUpload.single('logo');

// Middleware for CSV file upload
const uploadCSV = csvUpload.single('csv');

module.exports = {
  uploadPlayerPhoto,
  uploadTeamLogo,
  uploadCSV,
  uploadsDir: playersUploadsDir,
};

