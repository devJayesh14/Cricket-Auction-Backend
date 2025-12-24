require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Use Atlas connection string (same as server.js)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bsp7779:FNo92TAJCIj0Yfgv@cluster0.i4orfae.mongodb.net/cricket-auction?retryWrites=true&w=majority';

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@gmail.com' });
    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists');
      await mongoose.connection.close();
      return;
    }

    // Create admin user
    const admin = new User({
      email: 'admin@gmail.com',
      password: 'admin123', // Will be hashed by pre-save middleware
      name: 'Super Admin',
      role: 'admin',
      teamId: null,
      isActive: true,
    });

    await admin.save();
    console.log('✅ Super Admin created successfully!');
    console.log('   Email: admin@gmail.com');
    console.log('   Password: admin123');
    console.log('   Role: admin');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createAdmin();

